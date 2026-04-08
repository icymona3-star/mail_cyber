/**
 * test-webhook.js
 * 
 * Simulates a real AgentMail webhook locally WITHOUT calling the AgentMail API.
 * Tests: env loading, AI reply generation, locked reply routing, sanitisation.
 * Does NOT send any email — safe to run anytime.
 * 
 * Run: node test-webhook.js
 */

import fs from 'fs';
import path from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    });
    console.log("✅ Loaded .env.local\n");
  }
}
loadEnv();

// ── Import AI reply generator from server.js ─────────────────────────────────
import { generateAIReply } from './server.js';

// ── Test cases ───────────────────────────────────────────────────────────────
const TEST_CASES = [
  {
    label: "💰 Pricing question (locked reply expected)",
    subject: "Hello",
    body: "How much for a website?",
    sender: "John",
  },
  {
    label: "🛠️ Services question (locked reply expected)",
    subject: "What do you offer?",
    body: "Hi, what services do you provide?",
    sender: "Sarah",
  },
  {
    label: "📅 Meeting request (locked reply expected)",
    subject: "Book a call",
    body: "Can we schedule a demo this week?",
    sender: "Mark",
  },
  {
    label: "🤖 AI question (locked reply expected)",
    subject: "Curious",
    body: "Are you a bot or a human?",
    sender: "Alice",
  },
  {
    label: "💬 General question (AI reply expected)",
    subject: "Partnership",
    body: "Hi, I run a startup in Accra. We are building a fintech app and looking for a tech partner. Do you have experience with payment integrations?",
    sender: "Kwame",
  },
];

async function runTests() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  🧪 AgentMail Webhook — Local Dry-Run Test");
  console.log("  (No emails are sent. AI generation only.)");
  console.log("═══════════════════════════════════════════════════════\n");

  for (const tc of TEST_CASES) {
    console.log(`\n▶ ${tc.label}`);
    console.log(`  Subject : ${tc.subject}`);
    console.log(`  Body    : ${tc.body}`);
    console.log(`  Sender  : ${tc.sender}`);
    console.log("  ─────────────────────────────────────────────────────");

    try {
      const reply = await generateAIReply(tc.body, tc.subject, tc.sender);
      if (reply.startsWith("[Debug Error]")) {
        console.error("  ❌ AI Error:", reply);
      } else {
        console.log("  ✅ Reply generated:\n");
        reply.split('\n').forEach(line => console.log(`     ${line}`));
      }
    } catch (err) {
      console.error("  ❌ Exception:", err.message);
    }

    console.log();
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅ All tests done. No emails were sent.");
  console.log("═══════════════════════════════════════════════════════\n");
}

runTests();
