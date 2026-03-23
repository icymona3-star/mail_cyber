# AgentMail Webhook — Vercel (Node.js)

Production-ready webhook handler for AgentMail, built with the **official `agentmail` Node SDK**.

---

## Project Structure

```
agentmail-webhook/
├── api/
│   └── webhook.js      ← Vercel serverless webhook endpoint
├── setup.js            ← Run ONCE to create inbox + register webhook
├── .env.example        ← Template — copy to .env.local and fill in values
├── .env.local          ← Your real keys (never committed to Git)
├── .gitignore
└── package.json
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Add your API key to `.env.local`
Get your key from [console.agentmail.to](https://console.agentmail.to) → API Keys
```
AGENTMAIL_API_KEY=am_your_key_here
```

### 3. Deploy to Vercel
```bash
npx vercel deploy --prod
```
Your webhook URL will be: `https://your-project.vercel.app/api/webhook`

### 4. Run the setup script
```bash
AGENTMAIL_API_KEY=am_your_key \
WEBHOOK_URL=https://your-project.vercel.app/api/webhook \
node setup.js
```
This will:
- Idempotently create your AgentMail inbox
- Register your webhook with all 7 event types
- Print your **webhook secret**

### 5. Add secrets to Vercel
Go to: **Vercel Dashboard → Project → Settings → Environment Variables**

| Variable | Value |
|---|---|
| `AGENTMAIL_API_KEY` | Your AgentMail API key |
| `AGENTMAIL_WEBHOOK_SECRET` | Secret printed by `setup.js` |

### 6. Redeploy
```bash
npx vercel deploy --prod
```

### 7. Test it
Send an email to your AgentMail inbox, then check **Vercel → Logs**.

---

## Webhook Events

All 7 AgentMail event types are handled in `api/webhook.js`:

| Event | Trigger |
|---|---|
| `message.received` | New email arrives (**includes full message + thread data**) |
| `message.sent` | You successfully sent an email |
| `message.delivered` | Delivery confirmed by receiving server |
| `message.bounced` | Email could not be delivered |
| `message.complained` | Recipient marked email as spam |
| `message.rejected` | Email was rejected outright |
| `domain.verified` | Your custom domain was verified |

> **Note:** `message.received` is the only event with full `message` + `thread` data in the payload.
> All other events only include metadata about the event itself.

---

## Enabling Auto-Reply

In `api/webhook.js`, find the `onMessageReceived` function and uncomment the `client.inboxes.threads.messages.reply(...)` block.

---

## Security

- Signatures verified with **Svix** before any processing
- Raw body preserved for signature integrity
- `200 OK` returned immediately; processing happens in background
- Duplicate events are safely ignored via idempotency guard