/**
 * Run this script ONCE after deploying to Vercel.
 * It idempotently creates your inbox + registers your webhook with AgentMail.
 *
 * Usage:
 *   AGENTMAIL_API_KEY=am_xxx WEBHOOK_URL=https://your-project.vercel.app/api/webhook node setup.js
 */

import { AgentMailClient } from "agentmail";

const client = new AgentMailClient({
  apiKey: process.env.AGENTMAIL_API_KEY,
});

const WEBHOOK_URL = "https://mail-cyber.vercel.app/api/webhook";

if (!process.env.AGENTMAIL_API_KEY) {
  console.error("❌ Please set AGENTMAIL_API_KEY env var.");
  process.exit(1);
}

async function setup() {
  // ── 1. Idempotently create an inbox ─────────────────────────────────────
  // Using client_id means running this script twice won't create duplicates
  console.log("Creating inbox...");
  const inbox = await client.inboxes.create({
    // username: "support",      // optional — e.g. support@agentmail.to
    // domain: "agentmail.to",   // optional — defaults to agentmail.to
    clientId: "my-inbox-v1",    // idempotency key
  });
  console.log(`✅ Inbox ready: ${inbox.inboxId ?? inbox.inbox_id}`);

  // ── 2. Idempotently register the webhook ─────────────────────────────────
  console.log("\nRegistering webhook...");
  const webhook = await client.webhooks.create({
    url: WEBHOOK_URL,
    // Subscribe to all 7 event types — remove any you don't need:
    eventTypes: [
      "message.received",
      "message.sent",
      "message.delivered",
      "message.bounced",
      "message.complained",
      "message.rejected",
      "domain.verified",
    ],
    clientId: "my-webhook-v2",  // idempotency key
  });

  console.log(`✅ Webhook registered!`);
  const secret = webhook.secret ?? webhook.signingSecret;
  console.log(`   Webhook ID : ${webhook.webhookId ?? webhook.webhook_id}`);
  console.log(`   URL        : ${webhook.url}`);
  console.log(`\n🔑 WEBHOOK SECRET (copy this!):`);
  console.log(`   ${secret}`);
  console.log(`\n👉 Add it to Vercel as: AGENTMAIL_WEBHOOK_SECRET=${secret}`);
  console.log(`   Then redeploy: npx vercel deploy --prod`);
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});