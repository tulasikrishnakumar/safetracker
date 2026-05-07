/**
 * SafeTracker — Backend Server (Production Ready for Render.com)
 * ═══════════════════════════════════════════════════════════════
 * Endpoints:
 *  POST /api/location           ← live GPS point from tracked device
 *  POST /api/location/batch     ← bulk upload of offline-queued points
 *  GET  /api/location/:id       ← latest location for a device
 *  GET  /api/location/:id/history ← location history
 *  GET  /api/devices            ← list all known devices
 *  GET  /health                 ← health check
 *  GET  /dashboard              ← serves the monitor dashboard HTML
 *  WSS  /                       ← real-time push to monitor dashboard
 *
 * OFFLINE SUPPORT: mobile app queues points locally when offline,
 * sends via /api/location/batch when connection is restored.
 *
 * PRODUCTION: Deployed on Render.com — uses RENDER_EXTERNAL_URL env var.
 * Keep-alive pings /health every 14 min to prevent free-tier sleep.
 */

const express   = require('express');
const cors      = require('cors');
const http      = require('http');
const path      = require('path');
const fs        = require('fs');
const { WebSocketServer } = require('ws');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const PORT       = process.env.PORT || 4000;
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// ─── In-memory store ──────────────────────────────────────────────────────────
// devices: { [deviceId]: { latest: LocationRecord, history: LocationRecord[] } }
const devices = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function storeRecord(record) {
  const { deviceId } = record;
  if (!devices[deviceId]) devices[deviceId] = { latest: null, history: [] };
  devices[deviceId].history.push(record);
  if (devices[deviceId].history.length > 2000) devices[deviceId].history.shift();
  if (!devices[deviceId].latest || record.timestamp > devices[deviceId].latest.timestamp) {
    devices[deviceId].latest = record;
  }
}

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── POST /api/location — Single live point ───────────────────────────────────
app.post('/api/location', (req, res) => {
  const { deviceId, latitude, longitude, accuracy, altitude, speed, timestamp } = req.body;
  if (!deviceId || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'deviceId, latitude and longitude are required.' });
  }
  const record = { deviceId, latitude, longitude,
    accuracy: accuracy ?? null, altitude: altitude ?? null,
    speed: speed ?? null, timestamp: timestamp ?? Date.now(),
    receivedAt: Date.now(), offline: false,
  };
  storeRecord(record);
  console.log(`📍 [${deviceId}] ${latitude.toFixed(5)}, ${longitude.toFixed(5)} ±${accuracy?.toFixed(0) ?? '?'}m`);
  broadcast({ type: 'location_update', data: record });
  res.status(200).json({ status: 'ok', receivedAt: record.receivedAt });
});

// ─── POST /api/location/batch — Bulk offline upload ───────────────────────────
app.post('/api/location/batch', (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: '"records" must be a non-empty array.' });
  }
  const sorted = [...records].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  let accepted = 0;
  for (const raw of sorted) {
    const { deviceId, latitude, longitude, accuracy, altitude, speed, timestamp, savedAt } = raw;
    if (!deviceId || latitude == null || longitude == null) continue;
    storeRecord({ deviceId, latitude, longitude,
      accuracy: accuracy ?? null, altitude: altitude ?? null,
      speed: speed ?? null, timestamp: timestamp ?? Date.now(),
      savedAt: savedAt ?? null, receivedAt: Date.now(), offline: true,
    });
    accepted++;
  }
  console.log(`📦 Batch: ${accepted}/${records.length} points from "${sorted[0]?.deviceId}"`);
  const latestId = sorted[sorted.length - 1]?.deviceId;
  if (latestId && devices[latestId]?.latest) {
    broadcast({ type: 'location_update', data: { ...devices[latestId].latest, batchSize: accepted } });
  }
  res.status(200).json({ status: 'ok', accepted, total: records.length });
});

// ─── GET /api/location/:deviceId — Latest location ────────────────────────────
app.get('/api/location/:deviceId', (req, res) => {
  const entry = devices[req.params.deviceId];
  if (!entry) return res.status(404).json({ error: 'Device not found.' });
  res.json({ latest: entry.latest, historyCount: entry.history.length });
});

// ─── GET /api/location/:deviceId/history — Full history ───────────────────────
app.get('/api/location/:deviceId/history', (req, res) => {
  const entry = devices[req.params.deviceId];
  if (!entry) return res.status(404).json({ error: 'Device not found.' });
  const limit = Math.min(parseInt(req.query.limit || '100'), 2000);
  res.json({ deviceId: req.params.deviceId, history: entry.history.slice(-limit) });
});

// ─── GET /api/devices — List all known devices ────────────────────────────────
app.get('/api/devices', (_req, res) => {
  const list = Object.entries(devices).map(([id, data]) => ({
    deviceId: id,
    lastSeen: data.latest ? new Date(data.latest.receivedAt).toISOString() : null,
    latitude: data.latest?.latitude,
    longitude: data.latest?.longitude,
    historyCount: data.history.length,
  }));
  res.json({ devices: list });
});

// ─── GET /health — Health check ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(),
    devicesTracked: Object.keys(devices).length, publicUrl: PUBLIC_URL });
});

// ─── GET /dashboard — Serve monitor dashboard with auto-injected WSS URL ──────
app.get(['/dashboard', '/'], (_req, res) => {
  const dashPath = path.join(__dirname, '..', 'dashboard', 'index.html');
  if (fs.existsSync(dashPath)) {
    let html = fs.readFileSync(dashPath, 'utf8');
    const wsUrl = PUBLIC_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    html = html.replace(/(<input[^>]+id="serverUrl"[^>]+value=")[^"]*(")/g, `$1${wsUrl}$2`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } else {
    res.json({ message: 'SafeTracker API running', health: `${PUBLIC_URL}/health` });
  }
});

// ─── WebSocket: Connection handler ────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  console.log(`🖥️  Dashboard connected from ${req.socket.remoteAddress}`);
  ws.send(JSON.stringify({ type: 'snapshot', data: devices }));
  ws.on('close', () => console.log('🖥️  Dashboard disconnected.'));
  ws.on('error', (e) => console.error('WebSocket error:', e.message));
});

// ─── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  SafeTracker Backend — Production`);
  console.log(`  API       → ${PUBLIC_URL}`);
  console.log(`  Dashboard → ${PUBLIC_URL}/dashboard`);
  console.log(`  Health    → ${PUBLIC_URL}/health\n`);
  console.log(`  [INFO] Started at ${new Date().toISOString()}`);

  // Keep-alive: ping /health every 14 min to prevent Render free-tier sleep
  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(async () => {
      try {
        const r = await fetch(`${PUBLIC_URL}/health`);
        const d = await r.json();
        console.log(`[keep-alive] ok — uptime: ${Math.floor(d.uptime)}s, devices: ${d.devicesTracked}`);
      } catch (e) {
        console.warn(`[keep-alive] failed: ${e.message}`);
      }
    }, 14 * 60 * 1000);
    console.log('  [INFO] Keep-alive ping active (every 14 min).\n');
  }
});
