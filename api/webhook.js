import { AgentMailClient } from "agentmail";
import { Webhook } from "svix";

// Vercel config: disable body parsing so we can verify the raw signature
export const config = {
  api: { bodyParser: false },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Idempotency: track processed event IDs to avoid double-processing on retries
const processedEvents = new Set();

// ── Main Handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // 1. Read raw body (required for Svix signature verification)
  const rawBody = await getRawBody(req);

  // 2. Verify the webhook signature using Svix
  let event;
  try {
    const wh = new Webhook(process.env.AGENTMAIL_WEBHOOK_SECRET);
    event = wh.verify(rawBody, {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  // 3. Return 200 immediately — AgentMail expects a fast acknowledgement
  res.status(200).json({ received: true });

  // 4. Process asynchronously
  processEvent(event).catch((err) =>
    console.error("Error processing event:", err)
  );
}

// ── Event Router ──────────────────────────────────────────────────────────────

async function processEvent(event) {
  const { event_id, event_type } = event;

  // Idempotency guard — safe against AgentMail retries
  if (processedEvents.has(event_id)) {
    console.log(`⚠️  Duplicate event ignored: ${event_id}`);
    return;
  }
  processedEvents.add(event_id);

  console.log(`📨 Event received: ${event_type} [${event_id}]`);

  // Initialise the official AgentMail SDK client
  const client = new AgentMailClient({
    apiKey: process.env.AGENTMAIL_API_KEY,
  });

  switch (event_type) {
    case "message.received":
      await onMessageReceived(event, client);
      break;
    case "message.sent":
      await onMessageSent(event);
      break;
    case "message.delivered":
      await onMessageDelivered(event);
      break;
    case "message.bounced":
      await onMessageBounced(event);
      break;
    case "message.complained":
      await onMessageComplained(event);
      break;
    case "message.rejected":
      await onMessageRejected(event);
      break;
    case "domain.verified":
      await onDomainVerified(event);
      break;
    default:
      console.log(`ℹ️  Unhandled event type: ${event_type}`);
  }
}

// ── Event Handlers ────────────────────────────────────────────────────────────

async function onMessageReceived(event, client) {
  // message.received is the ONLY event that includes both message + thread data
  const { message, thread } = event;

  console.log("📩 New email received!");
  console.log(`   From    : ${JSON.stringify(message.from)}`);
  console.log(`   To      : ${JSON.stringify(message.to)}`);
  console.log(`   Subject : ${message.subject}`);
  // text/preview may be absent if the email is HTML-only
  console.log(`   Preview : ${message.preview ?? message.text?.slice(0, 200) ?? "(HTML only)"}`);
  console.log(`   Thread  : ${thread.thread_id} (${thread.message_count} messages)`);

  // ── AUTO-REPLY (uncomment to enable) ──────────────────────────────────────
  //
  // try {
  //   await client.inboxes.threads.messages.reply(
  //     message.inbox_id,
  //     thread.thread_id,
  //     {
  //       text: `Hi,\n\nThanks for your email! We received your message and will get back to you shortly.\n\nBest,\nYour AI Agent`,
  //     }
  //   );
  //   console.log("✅ Auto-reply sent");
  // } catch (err) {
  //   console.error("Failed to send auto-reply:", err);
  // }
}

async function onMessageSent(event) {
  const { send } = event;
  console.log(`✅ Message sent — ID: ${send.message_id}`);
}

async function onMessageDelivered(event) {
  const { delivery } = event;
  console.log(`📬 Message delivered — ID: ${delivery.message_id}`);
}

async function onMessageBounced(event) {
  const { bounce } = event;
  console.error(`⚠️  Message bounced — ID: ${bounce.message_id}, Type: ${bounce.bounce_type}`);
  // TODO: flag this address in your CRM / database
}

async function onMessageComplained(event) {
  const { complaint } = event;
  console.warn(`🚨 Spam complaint — ID: ${complaint.message_id}`);
  // TODO: unsubscribe user from future emails
}

async function onMessageRejected(event) {
  const { reject } = event;
  console.error(`🚫 Message rejected — ID: ${reject.message_id}`);
  // TODO: log rejection reason and alert your team
}

async function onDomainVerified(event) {
  const { domain } = event;
  console.log(`🌐 Domain verified: ${domain.domain}`);
  // TODO: enable domain-based features in your app
}
