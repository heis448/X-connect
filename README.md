# AnonOtF Test Client

A complete, working site that exercises every
`@anonotf/connect` feature: 1-on-1 and group calls (full mesh — everyone
sees everyone), live streaming, chat, raise hand / approve contributor,
and voice notes.

Use this to confirm your API key and backend actually work end-to-end
before building your real app.

## Setup

```bash
npm install
cp .env.example .env
# fill in ANONOTF_BASE_URL, ANONOTF_API_KEY, ANONOTF_APP_ID
# (the key and app ID are both on your dashboard's app card)
node app.js
```

Open **http://localhost:4000** in two different browser tabs (or two
devices on the same network). Enter a different display name in each —
a random user ID is generated automatically per browser/device, saved
in localStorage so it persists across reloads.

## What's wired up

- **Calls** — call, accept/decline, end, mute, camera on/off, camera flip, add a 3rd+ person mid-call (real mesh — everyone connects to everyone, not just to the original caller)
- **Presence** — online users list, profile photos/emoji, last-seen, live profile updates
- **Live streaming** — go live from the sidebar's "Live Streams" entry, or watch others; chat, raise hand, and broadcaster approval all work inside the stream screen
- **Voice notes** — record from your mic from the sidebar's "Voice Notes" entry, uploads automatically, plays back from a list

## Notes

- `getUserId()` in `index.js` trusts whatever the page sends — fine for this test client, **not** real auth. Replace with your actual login system before shipping a real product.
- Two people calling each other need this same server reachable by both — `localhost` works for two tabs on one machine; for two separate devices, deploy this somewhere both can reach (or use the same LAN with your machine's local IP).
- Requires `@anonotf/connect@0.4.1` or later — it's loaded directly from `esm.sh` inside `index.html`, no separate `npm install` of the SDK needed on the frontend.
