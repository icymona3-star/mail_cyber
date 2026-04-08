/**
 * setup.js — Resets webhook and auto-saves fresh secret to .env.local
 * Run: node setup.js
 */

import { AgentMailClient } from "agentmail";
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local if present
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envConfig = fs.readFileSync(envPath, 'utf8');
      envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = value;
        }
      });
      console.log("✅ Loaded .env.local");
    }
  } catch (e) { console.error(e); }
}

loadEnv();
const client = new AgentMailClient({
  apiKey: process.env.AGENTMAIL_API_KEY,
});

const WEBHOOK_URL = "https://mail-cyber.vercel.app/api/webhook";
const ENV_PATH = path.resolve(process.cwd(), '.env.local');

// Write new secret back into .env.local automatically
function saveSecret(newSecret) {
  try {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    if (content.includes('AGENTMAIL_WEBHOOK_SECRET=')) {
      content = content.replace(/AGENTMAIL_WEBHOOK_SECRET=.*/, `AGENTMAIL_WEBHOOK_SECRET=${newSecret}`);
    } else {
      content += `\nAGENTMAIL_WEBHOOK_SECRET=${newSecret}`;
    }
    fs.writeFileSync(ENV_PATH, content);
    console.log('✅ Secret auto-saved to .env.local');
  } catch (e) {
    console.warn('⚠️  Could not write .env.local:', e.message);
  }
}

if (!process.env.AGENTMAIL_API_KEY) {
  console.error("❌ Please set AGENTMAIL_API_KEY env var.");
  process.exit(1);
}

async function setup() {
  // ── 1. Ensure inbox exists ────────────────────────────────────────────────
  console.log('1. Checking inbox...');
  try {
    const inbox = await client.inboxes.create({
      username: "salestgne",
      domain: "agentmail.to",
      clientId: "salestgne-inbox-v1",    // idempotency key
    });
    console.log(`✅ Inbox ready: ${inbox.inboxId ?? inbox.inbox_id}`);
    console.log(`   Address:     ${inbox.username}@${inbox.domain}`);
  } catch (err) {
    if (err.statusCode === 403) {
      console.log("⚠️  Inbox 'salestgne' already exists. Proceeding to webhook...");
    } else {
      throw err;
    }
  }

  // ── 2. Add your Gmail to all allow lists (both dot and no-dot versions) ───
  console.log('\n2. Updating allow lists...');
  const inboxId = 'salestgne'; // inbox username used as ID in lists
  const gmailAddresses = [
    'nyaaba.augustine@gmail.com',
    'nyaabaaugustine@gmail.com',
  ];
  const listTypes = ['receive', 'send', 'reply'];
  for (const listType of listTypes) {
    for (const address of gmailAddresses) {
      try {
        await client.inboxes.lists.addAllowEntry(inboxId, listType, { address });
        console.log(`   ✅ ${listType} allow: ${address}`);
      } catch (e) {
        // Already exists or other non-fatal error
        console.log(`   ℹ️  ${listType} allow (skipped): ${address} — ${e.message?.slice(0,60)}`);
      }
    }
  }

  // ── 3. Delete ALL old webhooks to get a fresh secret ──────────────────────
  console.log('\n3. Deleting old webhooks...');
  try {
    const existing = await client.webhooks.list();
    const list = existing?.webhooks ?? existing?.data ?? [];
    if (list.length === 0) console.log('   No old webhooks found.');
    for (const wh of list) {
      const whId = wh.webhookId ?? wh.webhook_id ?? wh.id;
      await client.webhooks.delete(whId);
      console.log(`   🗑️  Deleted: ${whId}`);
    }
  } catch (e) {
    console.warn('   ⚠️  Could not clean old webhooks:', e.message);
  }

  // ── 4. Create a brand-new webhook (fresh secret every time) ──────────────
  console.log('\n4. Creating fresh webhook...');
  const webhook = await client.webhooks.create({
    url: WEBHOOK_URL,
    eventTypes: [
      'message.received',
      'message.sent',
      'message.delivered',
      'message.bounced',
      'message.complained',
      'message.rejected',
      'domain.verified',
    ],
    // NO clientId — forces a brand new webhook with a new secret every run
  });

  const secret = webhook.secret ?? webhook.signingSecret;
  const webhookId = webhook.webhookId ?? webhook.webhook_id;
  console.log(`   ✅ Webhook ID : ${webhookId}`);
  console.log(`   ✅ URL        : ${webhook.url}`);

  // ── 5. Auto-save the new secret to .env.local ────────────────────────────
  saveSecret(secret);

  console.log('\n════════════════════════════════════════════════════');
  console.log('🔑 NEW SECRET (also saved to .env.local):');
  console.log(`   ${secret}`);
  console.log('════════════════════════════════════════════════════');
  console.log('\n👉 DO THESE 2 STEPS NOW:');
  console.log('   1. Vercel Dashboard → Settings → Environment Variables');
  console.log(`      Set AGENTMAIL_WEBHOOK_SECRET = ${secret}`);
  console.log('   2. npx vercel deploy --prod');
  console.log('════════════════════════════════════════════════════\n');
}

setup().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});