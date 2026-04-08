import fs from 'fs';
import path from 'path';
import { generateAIReply } from './api/webhook.js';

// 1. Load environment variables from .env.local manually
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envConfig = fs.readFileSync(envPath, 'utf8');
      envConfig.split('\n').forEach(line => {
        // Match KEY=VALUE lines
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          // Remove quotes if present
          const value = match[2].trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = value;
        }
      });
      console.log("✅ Loaded .env.local");
    } else {
      console.warn("⚠️  .env.local not found. Relying on system env vars.");
    }
  } catch (e) {
    console.error("❌ Failed to load .env.local:", e);
  }
}

async function runTest() {
  loadEnv();

  const key = process.env.GROQ_API_KEY || "";
  console.log(`🔑 Loaded API Key: ${key.substring(0, 6)}... (Length: ${key.length})`);

  // 2. Define a mock email
  const subject = "Question about Enterprise Pricing";
  const body = "Hi there, I represent a large agency. Do you offer volume discounts for bulk usage? Also, how do I book a demo?";

  console.log("\n🧪 Running Local AI Test...");
  console.log(`📩 Mock Input:\n   Subject: ${subject}\n   Body:    ${body}\n`);
  
  // 3. Run the AI function
  try {
    const reply = await generateAIReply(body, subject, "Augustine");
    
    if (reply.startsWith("[Debug Error]")) {
      console.error("\n❌ AI Generation Failed:");
      // Try to parse out the JSON part for cleaner reading
      try {
        const jsonPart = reply.substring(reply.indexOf('{'));
        console.error(JSON.stringify(JSON.parse(jsonPart), null, 2));
      } catch (e) {
        console.error(reply);
      }
    } else {
      console.log("🤖 AI Response:\n──────────────────────────────────────────────────");
      console.log(reply);
      console.log("──────────────────────────────────────────────────\n");
    }
  } catch (err) {
    console.error("❌ Test Failed:", err);
  }
}

runTest();
