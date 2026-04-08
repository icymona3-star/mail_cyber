/**
 * server.js — HTTP server only. All logic lives in core.js.
 * Run: node server.js
 */

import { Webhook } from "svix";
import http from "http";
import fs from "fs";
import path from "path";
import { processEvent, generateAIReply } from "./core.js";

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  });
  console.log("✅ Loaded .env.local");
}

// Re-export so test files can still import generateAIReply from server.js
export { generateAIReply };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/webhook") {
    console.log(`⚡ Incoming Webhook! Method: ${req.method}`);

    const rawBody = await getRawBody(req);
    const isLocalTest = req.headers["x-local-test"] === "true";

    let event;
    try {
      if (isLocalTest) {
        event = JSON.parse(rawBody.toString());
      } else {
        const wh = new Webhook(process.env.AGENTMAIL_WEBHOOK_SECRET);
        event = wh.verify(rawBody, {
          "svix-id":        req.headers["svix-id"],
          "svix-timestamp": req.headers["svix-timestamp"],
          "svix-signature": req.headers["svix-signature"],
        });
      }
    } catch (err) {
      console.error("❌ Webhook verification failed:", err.message);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    // Respond 200 immediately — AgentMail won't retry
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));

    try {
      await processEvent(event, isLocalTest);
    } catch (err) {
      console.error("Error processing event:", err);
    }

  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📬 Webhook endpoint: http://localhost:${PORT}/api/webhook`);
});
