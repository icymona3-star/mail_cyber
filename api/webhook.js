import { AgentMailClient } from "agentmail";
import { Webhook } from "svix";

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const processedEvents = new Set();
const aiReplyCache = new Map();

export default async function handler(req, res) {
  console.log(`⚡ Incoming Webhook! Method: ${req.method}`);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const rawBody = await getRawBody(req);

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

  try {
    await processEvent(event);
  } catch (err) {
    console.error("Error processing event:", err);
  }

  res.status(200).json({ received: true });
}

async function processEvent(event) {
  const { event_id, event_type } = event;

  if (processedEvents.has(event_id)) {
    console.log(`⚠️  Duplicate event ignored: ${event_id}`);
    return;
  }
  processedEvents.add(event_id);

  console.log(`📨 Event received: ${event_type} [${event_id}]`);

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

const COMPANY = {
  name: "TGNE Solutions",
  rep: "Mr. David Oppan",
  role: "Sales Representative",
  phone: "+233 55 812 2767",
  email: "info@tgnesolutions.com",
  website: "www.tgnesolutions.com",
  location: "Tema, Community 11, Ghana",
  hours: "Monday to Friday 8AM-6PM, Saturday 9AM-2PM",
  projects: "200+",
  satisfaction: "98%",
  aiBuilder: "Cyber",
  aiBuilderContact: "0541988383",
  services: [
    "Custom Software Development (web apps, mobile apps, APIs, enterprise systems)",
    "AI-Powered Tools and Automation",
    "Website Creation and Development (WordPress, React, E-Commerce)",
    "Graphic Design and Branding",
    "Digital Education and ICT Training",
    "Production and Manufacturing (printing, laser engraving, CNC)"
  ]
};

const SIGNATURE = [
  "Warm regards,",
  COMPANY.rep,
  `${COMPANY.role} | ${COMPANY.name}`,
  `Tel: ${COMPANY.phone} | Email: ${COMPANY.email}`,
  COMPANY.website
].join("\n");

function buildEmail(senderName, bodyText) {
  return `Dear ${senderName},\n\n${bodyText.trim()}\n\n${SIGNATURE}`;
}

function getLockedReply(emailText, subject, senderName) {
  const text = ((emailText || "") + " " + (subject || "")).toLowerCase();

  if (/\b(pric|cost|quot|fee|charg|rate|budget|how much|payment|invoice)/.test(text)) {
    return buildEmail(senderName,
      `Thank you for reaching out to ${COMPANY.name}.\n\n` +
      `Every project we undertake is unique, and we tailor our pricing to match your specific requirements. ` +
      `Our team will carefully assess your needs and provide you with a detailed, transparent quote.\n\n` +
      `To get started, kindly share a brief overview of your project and we will get back to you promptly.`
    );
  }

  if (/\b(service|what do you (do|offer)|what can you|how can you help|capabilit|solution)/.test(text)) {
    const serviceList = COMPANY.services.map(s => `- ${s}`).join("\n");
    return buildEmail(senderName,
      `Thank you for your interest in ${COMPANY.name}.\n\n` +
      `We offer a comprehensive suite of technology and digital solutions:\n\n${serviceList}\n\n` +
      `We would love to explore how we can tailor any of these to your specific needs. ` +
      `Kindly share a brief overview of your project to get started.`
    );
  }

  if (/\b(demo|schedul|appointm|book|meeting|call|availab|time slot|connect|talk|discuss)/.test(text)) {
    return buildEmail(senderName,
      `Thank you for your interest in ${COMPANY.name}.\n\n` +
      `We would love to connect with you and explore how we can support your goals.\n\n` +
      `Kindly share 2 to 3 convenient time slots that work for you, and our team will confirm a session promptly.`
    );
  }

  if (/\b(who built|who made|who creat|who develop|are you ai|are you a bot|are you human|what are you)/.test(text)) {
    return buildEmail(senderName,
      `Great question!\n\n` +
      `I am an AI-powered assistant representing ${COMPANY.name}. ` +
      `I was developed by ${COMPANY.aiBuilder}, our in-house AI engineer. ` +
      `You can reach him directly on ${COMPANY.aiBuilderContact}.\n\n` +
      `Feel free to ask me anything about our services or how we can support your business.`
    );
  }

  if (/\b(contact|location|address|where are you|office|open|hours|visit|find you|reach you)/.test(text)) {
    return buildEmail(senderName,
      `Thank you for reaching out.\n\n` +
      `You can reach ${COMPANY.name} through any of the following:\n\n` +
      `Phone: ${COMPANY.phone}\nEmail: ${COMPANY.email}\nWebsite: ${COMPANY.website}\n` +
      `Address: ${COMPANY.location}\nOffice Hours: ${COMPANY.hours}\n\n` +
      `We look forward to hearing from you.`
    );
  }

  if (/\b(who are you|your name|introduce yourself|tell me about you|about tgne|about your company)/.test(text)) {
    return buildEmail(senderName,
      `Thank you for your interest.\n\n` +
      `My name is ${COMPANY.rep}, ${COMPANY.role} at ${COMPANY.name} — ` +
      `a premium technology and digital innovation company based in ${COMPANY.location}, ` +
      `serving businesses across Africa and beyond.\n\n` +
      `With over ${COMPANY.projects} projects delivered and a ${COMPANY.satisfaction} client satisfaction rate, ` +
      `we are proud to be a trusted partner for businesses that want to grow through technology. ` +
      `How can we help you today?`
    );
  }

  return null;
}

function sanitiseReply(reply, senderName) {
  return reply
    .replace(/Mr\.?\s*Augustine/gi, COMPANY.rep)
    .replace(/David\s+Oppan/gi, "David Oppan")
    .replace(/\[Your\s*Name\]/gi, COMPANY.rep)
    .replace(/\[Your\s*Company\]/gi, COMPANY.name)
    .replace(/\[Client\s*Name\]/gi, senderName)
    .replace(/\[Recipient\]/gi, senderName)
    .replace(/\[SenderFirstName\]/gi, senderName)
    .replace(/\[Contact\s*Number\]/gi, COMPANY.phone)
    .replace(/\[Project\s*Name\]/gi, "your project")
    .replace(/\[Areas\s*of\s*Expertise\]/gi, "software development, AI automation, and web development")
    .replace(/\[.*?\]/g, "")
    .replace(/\+?\d{3}[-\s]?\d{3}[-\s]?\d{4,}/g, COMPANY.phone)
    .replace(/warm\s*regards[\s\S]*/gi, "")
    .trim();
}

export async function generateAIReply(emailText, subject, senderName, threadId = null, client = null) {
  let threadMessages = [];
  let hasHangingMessages = false;

  if (threadId && client) {
    try {
      const thread = await client.threads.get(threadId);
      const messages = thread?.messages ?? thread?.data ?? [];
      if (messages.length > 1) {
        threadMessages = messages.slice(0, -1);
        hasHangingMessages = true;
        console.log(`📜 Found ${threadMessages.length} previous messages in thread`);
      }
    } catch (e) {
      console.log("⚠️ Could not fetch thread history:", e.message);
    }
  }

  const lockedReply = getLockedReply(emailText, subject, senderName);
  if (lockedReply) {
    console.log("🔒 Locked reply used — AI not consulted");
    return lockedReply;
  }

  console.log("🤖 General question — AI thinking freely");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("❌ GROQ_API_KEY is missing!");
    return buildEmail(senderName,
      `Thank you for reaching out to ${COMPANY.name}.\n\n` +
      `We have received your message and a member of our team will get back to you shortly.\n\n` +
      `In the meantime, feel free to reach us at ${COMPANY.phone} or ${COMPANY.email}.`
    );
  }

  const SYSTEM_PROMPT = `You are ${COMPANY.rep}, a confident and warm Sales Representative for ${COMPANY.name} — a premium technology company in Ghana.

You are writing a professional email reply. You may think freely and respond naturally to whatever the client is asking. Be helpful, insightful, and human — not robotic.

${hasHangingMessages ? `IMPORTANT: This is a follow-up message. Previous messages in this thread:\n${threadMessages.map(m => `- ${m.from?.name ?? 'User'}: ${m.preview ?? m.text ?? ''}`).join('\n')}\n\nTake this context into account when writing your reply.\n` : ''}

Locked facts you MUST use exactly as written (never invent alternatives):
- Company: ${COMPANY.name}
- Your name: ${COMPANY.rep}
- Your role: ${COMPANY.role}
- Phone: ${COMPANY.phone}
- Email: ${COMPANY.email}
- Website: ${COMPANY.website}
- Location: ${COMPANY.location}
- Services: ${COMPANY.services.join(", ")}

Formatting rules:
1. Start with: Dear ${senderName},
2. Leave a blank line between each paragraph.
3. Keep reply between 80 and 160 words.
4. Perfect spelling and grammar always.
5. Do NOT include a signature — it will be added automatically.
6. Do NOT use placeholder text like [Your Name] or [Company]. Use real values only.
7. Do NOT include a subject line.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Sender: ${senderName}\nSubject: ${subject}\nEmail: ${emailText}\n\nWrite the reply now.` }
        ],
        temperature: 0.5,
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const text = await response.text();
      return `[Debug Error] Groq API status ${response.status}: ${text.slice(0, 200)}`;
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return buildEmail(senderName, `Thank you for your message. A member of our team will be in touch with you shortly.\n\nFeel free to reach us at ${COMPANY.phone} or ${COMPANY.email}.`);
    }

    reply = sanitiseReply(reply, senderName);
    return reply + "\n\n" + SIGNATURE;

  } catch (error) {
    console.error("Groq error:", error);
    return buildEmail(senderName, `Thank you for your message. A member of our team will be in touch with you shortly.\n\nFeel free to reach us directly at ${COMPANY.phone} or ${COMPANY.email}.`);
  }
}

async function onMessageReceived(event, client) {
  const { message, thread } = event;

  console.log("📩 New email received!");
  console.log(`   To      : ${JSON.stringify(message.to)}`);
  console.log(`   Subject : ${message.subject}`);

  const senders = Array.isArray(message.from) ? message.from : [message.from];
  const senderAddress = senders[0]?.address;
  console.log(`   Sender  : ${senderAddress}`);

  const emailBody = message.extractedText ?? message.text ?? message.preview ?? "(no body)";
  console.log(`   Body    : ${emailBody.slice(0, 200)}`);

  try {
    if (senders.some(f => f.address && f.address.includes("agentmail.to"))) {
      console.log("🛑 Skipping auto-reply to avoid loop");
      return;
    }

    const senderFullName = senders[0]?.name || senderAddress?.split("@")[0] || "";
    const senderFirstName = senderFullName.split(" ")[0] || "Valued Client";

    // ✅ Extract IDs FIRST before any use
    const inboxId = message.inboxId ?? message.inbox_id;
    const messageId = message.messageId ?? message.message_id;
    const threadId = thread?.threadId ?? thread?.thread_id;

    console.log(`   InboxID: ${inboxId}, MessageID: ${messageId}, ThreadID: ${threadId}`);

    if (!inboxId) {
      console.error("❌ Cannot reply — inboxId is missing from webhook payload");
      return;
    }
    if (!messageId) {
      console.error("❌ Cannot reply — messageId is missing from webhook payload");
      return;
    }

    // Check cache to avoid duplicate replies on retries
    const cacheKey = messageId;
    if (aiReplyCache.has(cacheKey)) {
      console.log("📦 Using cached AI reply");
      const replyText = aiReplyCache.get(cacheKey);
      console.log(`   Cached Reply: ${replyText.slice(0, 200)}`);
      // ✅ Correct SDK call
      await client.inboxes.messages.reply(inboxId, messageId, { text: replyText });
      console.log("✅ Cached AI reply sent!");
      return;
    }

    console.log("🤖 Generating AI reply...");
    const replyText = await generateAIReply(emailBody, message.subject ?? "(no subject)", senderFirstName, threadId, client);
    console.log(`   AI Reply: ${replyText.slice(0, 200)}`);

    aiReplyCache.set(cacheKey, replyText);

    // ✅ The only correct SDK method
    await client.inboxes.messages.reply(inboxId, messageId, { text: replyText });
    console.log("✅ AI auto-reply sent!");

  } catch (err) {
    console.error("❌ Failed to send AI reply:", err.message);
    if (err.body) console.error("   API response:", JSON.stringify(err.body));
  }
}

async function onMessageSent(event) {
  const { send } = event;
  console.log(`✅ Message sent — ID: ${send?.message_id}`);
}

async function onMessageDelivered(event) {
  const { delivery } = event;
  console.log(`📬 Message delivered — ID: ${delivery?.message_id}`);
}

async function onMessageBounced(event) {
  const { bounce } = event;
  console.error(`⚠️  Message bounced — ID: ${bounce?.message_id}, Type: ${bounce?.bounce_type}`);
}

async function onMessageComplained(event) {
  const { complaint } = event;
  console.warn(`🚨 Spam complaint — ID: ${complaint?.message_id}`);
}

async function onMessageRejected(event) {
  const { reject } = event;
  console.error(`🚫 Message rejected — ID: ${reject?.message_id}`);
}

async function onDomainVerified(event) {
  const { domain } = event;
  console.log(`🌐 Domain verified: ${domain?.domain}`);
}
