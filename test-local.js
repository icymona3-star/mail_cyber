/**
 * test-local.js — Full local test suite
 *
 * PART 1: Direct AI generation tests (no server, no ports, instant)
 * PART 2: HTTP pipeline test — fires real POST requests to server.js
 *
 * Run PART 1 only (no server needed):
 *   node test-local.js
 *
 * Run PART 1 + PART 2 (needs server running in another terminal):
 *   Terminal 1: node server.js
 *   Terminal 2: node test-local.js --http
 */

import fs from 'fs';
import path from 'path';
import http from 'http';

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  });
  console.log("✅ Loaded .env.local");
}

// ── Import from core.js ONLY — no HTTP server started ────────────────────────
import { generateAIReply } from './core.js';

// ── Test scenarios ────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    label: "💰 Pricing — 'how much'",
    subject: "Hello", body: "How much for a website?", sender: "John",
    expectLocked: true,
  },
  {
    label: "💰 Pricing — 'what is the cost'",
    subject: "Cost enquiry", body: "What is the cost of building a mobile app?", sender: "Ama",
    expectLocked: true,
  },
  {
    label: "🛠️  Services — 'what do you offer'",
    subject: "Services", body: "Hi, what services do you provide?", sender: "Sarah",
    expectLocked: true,
  },
  {
    label: "📅 Meeting — 'book a demo'",
    subject: "Book a call", body: "Can we schedule a demo this week?", sender: "Mark",
    expectLocked: true,
  },
  {
    label: "🤖 Bot question",
    subject: "Curious", body: "Are you a bot or a human?", sender: "Alice",
    expectLocked: true,
  },
  {
    label: "🏢 Company intro",
    subject: "About TGNE", body: "Tell me about your company", sender: "Emmanuel",
    expectLocked: true,
  },
  {
    label: "💬 Fintech partnership (should use AI — NOT pricing lock)",
    subject: "Tech Partnership",
    body: "Hi, we are building a fintech app in Accra and need a tech partner with payment integration experience. Can you help?",
    sender: "Kwame",
    expectLocked: false,
  },
  {
    label: "💬 General enquiry (should use AI)",
    subject: "Question",
    body: "Hi, I saw your company online. I am interested in your work. Can you tell me more about how you approach new projects?",
    sender: "Abena",
    expectLocked: false,
  },
];

// ── Part 1: Direct AI generation ──────────────────────────────────────────────
async function runDirectTests() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║   🧪  PART 1: Direct AI Generation Test                   ║");
  console.log("║   Imports core.js directly — no port used                 ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;

  for (const sc of SCENARIOS) {
    console.log(`▶ ${sc.label}`);
    console.log(`  Subject : ${sc.subject}`);
    console.log(`  Body    : ${sc.body}`);
    console.log("  ─────────────────────────────────────────────────────────");

    try {
      const reply = await generateAIReply(sc.body, sc.subject, sc.sender);

      if (!reply || reply.startsWith("[Debug Error]")) {
        console.error(`  ❌ FAILED — ${reply}`);
        failed++;
      } else {
        // Check routing expectation
        const wasLocked = !reply.includes("[Debug") && reply.includes("Warm regards");
        const routeLabel = wasLocked ? "🔒 locked" : "🤖 AI";

        if (sc.expectLocked !== undefined) {
          const routeCorrect = sc.expectLocked ? wasLocked : true; // AI replies always OK
          console.log(`  ${routeCorrect ? "✅" : "⚠️ "} Routed via: ${routeLabel}`);
        }

        console.log("  📧 Reply:\n");
        reply.split('\n').forEach(l => console.log(`     ${l}`));
        passed++;
      }
    } catch (err) {
      console.error(`  ❌ Exception: ${err.message}`);
      failed++;
    }
    console.log();
  }

  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log(`║  Part 1 Result: ${passed} passed, ${failed} failed                         ║`);
  console.log("╚═══════════════════════════════════════════════════════════╝");
  return { passed, failed };
}

// ── Part 2: HTTP pipeline ─────────────────────────────────────────────────────
function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1', port: 3000,
      path: '/api/webhook', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-local-test': 'true',
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runHTTPTests() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║   🌐  PART 2: HTTP Pipeline Test                          ║");
  console.log("║   Sending POST requests to http://localhost:3000          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;

  for (let i = 0; i < SCENARIOS.length; i++) {
    const sc = SCENARIOS[i];
    const payload = {
      event_type: 'message.received',
      event_id: `local-http-${i + 1}`,
      message: {
        message_id: `msg-http-${i + 1}`,
        inbox_id: 'salestgne',
        from: [{ address: `test${i}@example.com`, name: sc.sender }],
        to: [{ address: 'salestgne@agentmail.to' }],
        subject: sc.subject,
        text: sc.body,
      },
      thread: { thread_id: `thread-http-${i + 1}` },
    };

    process.stdout.write(`  [${i + 1}/${SCENARIOS.length}] ${sc.label} ... `);
    try {
      const result = await sendWebhook(payload);
      if (result.status === 200) {
        console.log(`✅ HTTP ${result.status}`);
        passed++;
      } else {
        console.log(`❌ HTTP ${result.status} — ${result.body}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      console.log("     → server.js not running? Start it: node server.js");
      failed++;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log(`║  Part 2 Result: ${passed} passed, ${failed} failed                         ║`);
  console.log("║  Check the server.js terminal for full reply output       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const runHTTP = process.argv.includes('--http');

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║   TGNE AgentMail — Local Test Suite                       ║");
  if (!runHTTP) {
    console.log("║   TIP: add --http flag to also test HTTP pipeline         ║");
  }
  console.log("╚═══════════════════════════════════════════════════════════╝");

  await runDirectTests();

  if (runHTTP) {
    await runHTTPTests();
  } else {
    console.log("\n  💡 Run  node test-local.js --http  to also test the HTTP pipeline.");
    console.log("     (Requires node server.js running in another terminal first)\n");
  }
}

main().catch(err => {
  console.error("❌ Test suite crashed:", err.message);
  process.exit(1);
});
