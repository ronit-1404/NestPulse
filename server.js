import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EventQueue } from './queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Initialize Event Queue
const queue = new EventQueue({
  strategy: process.env.STRATEGY || 'lagging', // Default: complete-but-lagging
  maxCapacity: 1000 // Limit for current-but-dropping mode
});

const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
const staticPath = fs.existsSync(distPath) ? distPath : publicPath;

app.use(express.json());
app.use(express.static(staticPath));

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// 1. Ingestion Endpoint - High Performance & Non-blocking
app.post('/api/ingest', (req, res) => {
  const payload = req.body;

  if (!payload) {
    return res.status(400).json({ error: 'Missing event payload' });
  }

  if (Array.isArray(payload)) {
    queue.enqueueBatch(payload);
    return res.status(202).json({
      status: 'accepted',
      count: payload.length,
      queueSize: queue.size
    });
  } else {
    if (!payload.nestId) {
      return res.status(400).json({ error: 'Invalid event payload: nestId required' });
    }
    queue.enqueue(payload);
    return res.status(202).json({
      status: 'accepted',
      count: 1,
      queueSize: queue.size
    });
  }
});

// 2. Metrics Snapshot Endpoint
app.get('/api/stats', (req, res) => {
  res.json(queue.getMetrics());
});

// 3. Strategy Configuration Endpoint
app.post('/api/config', (req, res) => {
  const { strategy } = req.body;
  if (strategy && ['lagging', 'dropping'].includes(strategy)) {
    queue.setStrategy(strategy);
    broadcastSystemMessage(`Queue strategy updated to '${strategy}'`);
    return res.json({ success: true, strategy: queue.strategy });
  }
  res.status(400).json({ error: 'Invalid strategy. Choose "lagging" or "dropping".' });
});

// ----------------------------------------------------
// WEBSOCKET BROADCASTING & DECOUPLED DELIVERY WORKER
// ----------------------------------------------------

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total clients: ${clients.size}`);

  // Send initial metrics & connection greeting
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      metrics: queue.getMetrics(),
      message: 'Connected to Nest Motion Monitoring Stream'
    }
  }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'set_strategy') {
        queue.setStrategy(data.strategy);
        broadcastSystemMessage(`Queue strategy changed to '${data.strategy}' via UI`);
      }
    } catch (e) {
      // Ignore malformed client messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total clients: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    clients.delete(ws);
  });
});

function broadcastSystemMessage(message) {
  const msgStr = JSON.stringify({
    type: 'system',
    message,
    timestamp: new Date().toISOString()
  });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msgStr);
    }
  }
}

// ----------------------------------------------------
// WORKER LOOP: Dequeue events and stream to WebSockets
// ----------------------------------------------------
// To ensure the browser DOM is not overwhelmed by 200+ ev/s rendering and to simulate
// real-world client push rate limits, the delivery worker caps egress streaming at ~60 ev/s
// (3 events every 50ms tick).
// During a 200 ev/s burst:
//   - 'lagging' mode: Ingests all 200 ev/s, building queue backlog (+140 ev/s) and delivery lag.
//   - 'dropping' mode: Retains max 500 items, dropping overflown events to maintain minimal lag.
const DELIVERY_INTERVAL_MS = 50;
const MAX_BATCH_PER_TICK = 3; // 3 events per 50ms = 60 events/sec delivery cap

setInterval(() => {
  if (queue.size === 0 || clients.size === 0) return;

  const eventsBatch = queue.dequeueBatch(MAX_BATCH_PER_TICK);
  if (eventsBatch.length === 0) return;

  const payloadStr = JSON.stringify({
    type: 'events_batch',
    events: eventsBatch,
    queueSize: queue.size,
    currentLagMs: queue.currentLagMs
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      // Protect server from slow/blocked sockets:
      // If client buffer has > 512KB pending, skip this frame for this specific slow client
      if (client.bufferedAmount > 512 * 1024) {
        continue;
      }
      client.send(payloadStr);
    }
  }
}, DELIVERY_INTERVAL_MS);

// Periodic Metrics Broadcast (every 500ms)
setInterval(() => {
  if (clients.size === 0) return;

  const metricsPayload = JSON.stringify({
    type: 'metrics_tick',
    metrics: queue.getMetrics()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(metricsPayload);
    }
  }
}, 500);

// Start Server
httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Nest Motion Event Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`⚙️  Active Strategy: ${queue.strategy} (${queue.strategy === 'lagging' ? 'complete-but-lagging' : 'current-but-dropping'})`);
  console.log(`====================================================`);
});
