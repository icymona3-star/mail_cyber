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

  // 3. Process event (must await on Vercel to ensure completion)
  try {
    await processEvent(event);
  } catch (err) {
    console.error("Error processing event:", err);
  }

  // 4. Return 200 to AgentMail
  res.status(200).json({ received: true });
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

async function generateAIReply(emailText, subject) { 
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.error("❌ CRITICAL: LLM_API_KEY is missing from environment variables!");
    return "I cannot reply right now because my brain (API Key) is missing.";
  }

  const endpoint = "https://apifreellm.com/api/v1/chat";

  // ── TRAIN YOUR AI HERE ────────────────────────────────────────────────────────
  // Edit this text to change how your AI behaves!
  const SYSTEM_INSTRUCTIONS = `
  You are a professional customer support agent for my company.
  Your goal is to be helpful, polite, and concise.
  
  - If the user asks about pricing, say: "Our pricing depends on the project scope."
  - If the user wants to book a call, ask them to propose 3 available times.
  - If the email is spam or nonsense, reply politely that you cannot help.
  - Keep your reply under 100 words.
  `;
  // ──────────────────────────────────────────────────────────────────────────────

  const requestBody = {
    message: `${SYSTEM_INSTRUCTIONS}\n\nIncoming Email:\nSubject: ${subject}\nBody: ${emailText}\n\nTask: Write a reply following the instructions above.`,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (data.success) {
      return data.response;
    } else {
      console.error("API error:", data);
      return "Sorry, I couldn't generate a reply at this time.";
    }
  } catch (error) {
    console.error("Error calling API:", error);
    return "Sorry, I encountered an error generating a reply.";
  }
}

async function onMessageReceived(event, client) {
  const { message, thread } = event;

  console.log("📩 New email received!");
  console.log(`   From    : ${JSON.stringify(message.from)}`);
  console.log(`   To      : ${JSON.stringify(message.to)}`);
  console.log(`   Subject : ${message.subject}`);

  const emailBody = message.extractedText ?? message.text ?? message.preview ?? "(no body)";
  console.log(`   Body    : ${emailBody.slice(0, 200)}`);

  try {
    // Prevent AI from replying to itself
    const senders = Array.isArray(message.from) ? message.from : [message.from];
    if (senders.some(f => f.address && f.address.includes("agentmail.to"))) {
      console.log("🛑 Skipping auto-reply to avoid loop");
      return;
    }

    console.log("🤖 Generating AI reply...");
    const replyText = await generateAIReply(emailBody, message.subject ?? "(no subject)");
    console.log(`   AI Reply: ${replyText.slice(0, 200)}`);

    await client.inboxes.threads.messages.reply(
      message.inboxId ?? message.inbox_id,
      thread.threadId ?? thread.thread_id,
      { text: replyText }
    );
    console.log("✅ AI auto-reply sent!");
  } catch (err) {
    console.error("❌ Failed to send AI reply:", err.message);
  }
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
