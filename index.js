// app.js
//
// Full backend for testing @anonotf/connect — every feature wired up:
// calls/group calls, live streaming, chat + raise hand, voice notes.
// Serves index.html as a static site AND proxies every AnonOtF
// request your frontend needs, attaching your x-api-key server-side
// (the browser never sees it).
//
// Setup:
//   npm install express multer form-data
//   cp .env.example .env   (fill in your real values)
//   node app.js
//
// Then open http://localhost:4000 in two different browser tabs/
// windows (or two devices) — log in as two different userIds to
// actually test calling between them.

require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Config ──
const ANONOTF_BASE_URL = process.env.ANONOTF_BASE_URL;
const ANONOTF_API_KEY = process.env.ANONOTF_API_KEY;
const ANONOTF_APP_ID = process.env.ANONOTF_APP_ID;

if (!ANONOTF_BASE_URL || !ANONOTF_API_KEY || !ANONOTF_APP_ID) {
  console.error('Missing ANONOTF_BASE_URL / ANONOTF_API_KEY / ANONOTF_APP_ID — set these in .env before starting.');
  process.exit(1);
}

const anonotfHeaders = { 'x-api-key': ANONOTF_API_KEY, 'Content-Type': 'application/json' };

// ── IMPORTANT — replace this with your real auth ──
// This test site trusts whatever userId the page sends, which is
// fine for trying the SDK out, but is NOT real authentication. A
// production app should derive userId from a real login/session
// instead of letting the client just declare who it is.
function getUserId(req) {
  return req.body.userId || req.query.userId;
}

// ── Frontend config (so index.html knows where to point the SDK) ──
app.get('/api/config', (req, res) => {
  res.json({ serverUrl: ANONOTF_BASE_URL, apiBase: '/api' });
});

// ── Socket token — frontend calls this once per login ──
app.post('/api/socket-token', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'userId is required' });

    const r = await fetch(`${ANONOTF_BASE_URL}/api/apps/${ANONOTF_APP_ID}/socket-token`, {
      method: 'POST',
      headers: anonotfHeaders,
      body: JSON.stringify({ userId }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    // index.html needs to know where to actually connect — serverUrl
    // for the Socket.IO connection, apiBase for every REST call the
    // SDK makes (rooms, media clips, streaming tokens). Both come
    // from THIS server's own config, not from AnonOtF's response.
    res.status(r.status).json({ ...data, serverUrl: ANONOTF_BASE_URL, apiBase: '/api' });
  } catch (err) {
    console.error('socket-token proxy error:', err);
    res.status(500).json({ error: 'Failed to get socket token' });
  }
});

// ── Rooms ──
app.post('/api/rooms', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'userId is required' });

    const r = await fetch(`${ANONOTF_BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: anonotfHeaders,
      body: JSON.stringify({
        appId: ANONOTF_APP_ID,
        roomName: req.body.roomName,
        createdBy: userId,
        maxParticipants: req.body.maxParticipants,
      }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('rooms proxy error:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:roomId/participants', async (req, res) => {
  try {
    const r = await fetch(`${ANONOTF_BASE_URL}/api/rooms/${req.params.roomId}/participants`, { headers: anonotfHeaders });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('participants proxy error:', err);
    res.status(500).json({ error: 'Failed to list participants' });
  }
});

// ── ICE servers (STUN/TURN) for calls ──
// Needs your x-api-key (the real /api/ice route on AnonOtF requires
// it), so the browser calls this proxy instead of AnonOtF directly.
// The SDK calls this automatically via the fetchIceServers option
// passed into AnonOtFConnect — see index.html's setupSocket().
app.get('/api/ice', async (req, res) => {
  try {
    const r = await fetch(`${ANONOTF_BASE_URL}/api/ice`, { headers: anonotfHeaders });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('ice proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch ICE servers' });
  }
});

// ── Live streaming token (LiveKit) ──
app.post('/api/streams/:roomId/token', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'userId is required' });

    const r = await fetch(`${ANONOTF_BASE_URL}/api/streams/${req.params.roomId}/token`, {
      method: 'POST',
      headers: anonotfHeaders,
      body: JSON.stringify({ userId }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('stream-token proxy error:', err);
    res.status(500).json({ error: 'Failed to get streaming token' });
  }
});

// ── Voice notes / call recordings ──
const upload = multer();
app.post('/api/media-clips', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname || 'clip', contentType: req.file.mimetype });
    form.append('type', req.body.type);
    form.append('mediaType', req.body.mediaType);
    form.append('fromUserId', req.body.fromUserId);
    if (req.body.roomId) form.append('roomId', req.body.roomId);
    if (req.body.toUserId) form.append('toUserId', req.body.toUserId);
    if (req.body.durationSeconds) form.append('durationSeconds', req.body.durationSeconds);

    const r = await fetch(`${ANONOTF_BASE_URL}/api/media-clips`, {
      method: 'POST',
      headers: { 'x-api-key': ANONOTF_API_KEY, ...form.getHeaders() },
      body: form,
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('media-clip upload proxy error:', err);
    res.status(500).json({ error: 'Failed to upload media clip' });
  }
});

app.get('/api/rooms/:roomId/media-clips', async (req, res) => {
  try {
    const r = await fetch(
      `${ANONOTF_BASE_URL}/api/rooms/${req.params.roomId}/media-clips?userId=${encodeURIComponent(req.query.userId)}`,
      { headers: anonotfHeaders }
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('room media-clips proxy error:', err);
    res.status(500).json({ error: 'Failed to list media clips' });
  }
});

app.get('/api/media-clips/dm/:otherUserId', async (req, res) => {
  try {
    const r = await fetch(
      `${ANONOTF_BASE_URL}/api/media-clips/dm/${req.params.otherUserId}?userId=${encodeURIComponent(req.query.userId)}`,
      { headers: anonotfHeaders }
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('dm media-clips proxy error:', err);
    res.status(500).json({ error: 'Failed to list DM media clips' });
  }
});

app.get('/api/media-clips/:id', async (req, res) => {
  try {
    const r = await fetch(
      `${ANONOTF_BASE_URL}/api/media-clips/${req.params.id}?userId=${encodeURIComponent(req.query.userId)}`,
      { headers: anonotfHeaders }
    );
    if (!r.ok) return res.status(r.status).json(await r.json().catch(() => ({ error: 'Failed to fetch clip' })));
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
    r.body.pipe(res);
  } catch (err) {
    console.error('media-clip playback proxy error:', err);
    res.status(500).json({ error: 'Failed to stream media clip' });
  }
});

app.delete('/api/media-clips/:id', async (req, res) => {
  try {
    const r = await fetch(
      `${ANONOTF_BASE_URL}/api/media-clips/${req.params.id}?userId=${encodeURIComponent(req.query.userId)}`,
      { method: 'DELETE', headers: anonotfHeaders }
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('media-clip delete proxy error:', err);
    res.status(500).json({ error: 'Failed to delete media clip' });
  }
});

// ── Webhook setup (optional — lets this test app receive call events) ──
app.put('/api/webhook', async (req, res) => {
  try {
    const r = await fetch(`${ANONOTF_BASE_URL}/api/apps/webhook`, {
      method: 'PUT',
      headers: anonotfHeaders,
      body: JSON.stringify({ webhookUrl: req.body.webhookUrl }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error('webhook proxy error:', err);
    res.status(500).json({ error: 'Failed to set webhook' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Test site running at http://localhost:${PORT}`));
