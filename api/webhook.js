/**
 * api/webhook.js — Vercel serverless handler.
 * All logic lives in core.js — this file is just the Vercel entry point.
 */

import { Webhook } from "svix";
import { processEvent } from "../core.js";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  console.log(`⚡ Incoming Webhook! Method: ${req.method}`);
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const rawBody = await getRawBody(req);

  let event;
  try {
    const wh = new Webhook(process.env.AGENTMAIL_WEBHOOK_SECRET);
    event = wh.verify(rawBody, {
      "svix-id":        req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });
  } catch (err) {
    console.error("❌ Webhook verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try { await processEvent(event, false); } catch (err) { console.error("Error:", err); }

  res.status(200).json({ received: true });
}
