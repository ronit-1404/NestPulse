// Client Dashboard Logic

let socket = null;
let currentMetrics = null;
const nestElements = {};

// DOM Elements
const connectionDot = document.getElementById('connection-dot');
const connectionLabel = document.getElementById('connection-label');
const strategySelect = document.getElementById('strategy-select');

const valIngestRate = document.getElementById('val-ingest-rate');
const valDeliveryRate = document.getElementById('val-delivery-rate');
const valQueueSize = document.getElementById('val-queue-size');
const valQueueStatusText = document.getElementById('val-queue-status-text');
const valLag = document.getElementById('val-lag');
const valDropped = document.getElementById('val-dropped');

const cardLag = document.getElementById('card-lag');
const cardDropped = document.getElementById('card-dropped');

const bannerStrategyName = document.getElementById('banner-strategy-name');
const bannerStrategyDesc = document.getElementById('banner-strategy-desc');
const nestsGrid = document.getElementById('nests-grid');
const eventLog = document.getElementById('event-log');

// Initialize Nest Tiles Grid
function initNestTiles() {
  nestsGrid.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const nestId = `nest-${String(i).padStart(2, '0')}`;
    const tile = document.createElement('div');
    tile.className = 'nest-tile';
    tile.id = `tile-${nestId}`;

    tile.innerHTML = `
      <div class="nest-header">
        <div class="nest-name">Nest #${String(i).padStart(2, '0')}</div>
        <div class="nest-status-pill" id="pill-${nestId}">Idle</div>
      </div>
      <div class="nest-metrics">
        <div class="nest-metric-item">
          <div>Ingested</div>
          <div class="val" id="ingest-cnt-${nestId}">0</div>
        </div>
        <div class="nest-metric-item">
          <div>Delivered</div>
          <div class="val" id="deliv-cnt-${nestId}">0</div>
        </div>
      </div>
      <div class="nest-last-event" id="last-evt-${nestId}">No events yet</div>
    `;

    nestsGrid.appendChild(tile);
    nestElements[nestId] = {
      tile,
      pill: document.getElementById(`pill-${nestId}`),
      ingestCnt: document.getElementById(`ingest-cnt-${nestId}`),
      delivCnt: document.getElementById(`deliv-cnt-${nestId}`),
      lastEvt: document.getElementById(`last-evt-${nestId}`)
    };
  }
}

// Connect to WebSocket Server
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    connectionDot.classList.add('connected');
    connectionLabel.textContent = 'CONNECTED';
  };

  socket.onclose = () => {
    connectionDot.classList.remove('connected');
    connectionLabel.textContent = 'DISCONNECTED (Reconnecting...)';
    setTimeout(connectWebSocket, 2000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('Failed to parse WebSocket message', e);
    }
  };
}

function handleServerMessage(msg) {
  if (msg.type === 'init' || msg.type === 'metrics_tick') {
    updateMetricsUI(msg.metrics || (msg.data && msg.data.metrics));
  } else if (msg.type === 'events_batch') {
    processEventsBatch(msg.events);
    if (msg.queueSize !== undefined && currentMetrics) {
      currentMetrics.queueSize = msg.queueSize;
      currentMetrics.currentLagMs = msg.currentLagMs;
      updateMetricsUI(currentMetrics);
    }
  } else if (msg.type === 'system') {
    addLogEntry(`[SYSTEM] ${msg.message}`, false);
  }
}

function updateMetricsUI(metrics) {
  if (!metrics) return;
  currentMetrics = metrics;

  // Strategy UI state
  if (strategySelect.value !== metrics.strategy) {
    strategySelect.value = metrics.strategy;
  }

  if (metrics.strategy === 'lagging') {
    bannerStrategyName.textContent = 'Complete-but-Lagging Mode';
    bannerStrategyDesc.textContent = 'All events are preserved in queue. High burst traffic builds queue backlog and delivery lag, which drains after burst stops.';
  } else {
    bannerStrategyName.textContent = 'Current-but-Dropping Mode';
    bannerStrategyDesc.textContent = 'Bounded buffer (max 1000 items). When full, oldest events are dropped to maintain near real-time live latency.';
  }

  // Core metrics
  valIngestRate.innerHTML = `${metrics.ingestRate} <span class="unit">ev/s</span>`;
  valDeliveryRate.innerHTML = `${metrics.deliveryRate} <span class="unit">ev/s</span>`;
  valQueueSize.innerHTML = `${metrics.queueSize} <span class="unit">events</span>`;

  const lagSec = parseFloat(metrics.currentLagSec || (metrics.currentLagMs / 1000).toFixed(2));
  valLag.innerHTML = `${lagSec.toFixed(2)} <span class="unit">sec</span>`;
  valDropped.textContent = metrics.totalDropped;

  // Buffer state evaluation & styling
  const queueCard = valQueueSize.parentElement;
  if (metrics.strategy === 'dropping' && metrics.totalDropped > 0) {
    valQueueStatusText.textContent = 'DROPPING OVERFLOW';
    queueCard.className = 'metric-card danger';
  } else if (metrics.queueSize > 500) {
    valQueueStatusText.textContent = 'HEAVY BACKLOG';
    queueCard.className = 'metric-card danger';
  } else if (metrics.queueSize > 50) {
    valQueueStatusText.textContent = 'DRAINING BACKLOG';
    queueCard.className = 'metric-card alert';
  } else {
    valQueueStatusText.textContent = 'BUFFER STABLE';
    queueCard.className = 'metric-card';
  }

  if (lagSec > 2.0) {
    cardLag.className = 'metric-card danger';
  } else if (lagSec > 0.5) {
    cardLag.className = 'metric-card alert';
  } else {
    cardLag.className = 'metric-card';
  }

  if (metrics.totalDropped > 0) {
    cardDropped.className = 'metric-card danger';
  }

  // Update Nest stats
  if (metrics.nestStats) {
    metrics.nestStats.forEach(n => {
      const el = nestElements[n.nestId];
      if (el) {
        el.ingestCnt.textContent = n.ingested;
        el.delivCnt.textContent = n.delivered;

        if (n.recentIngestCount > 50) {
          el.pill.textContent = '🔥 BURST ACTIVE';
          el.pill.className = 'nest-status-pill burst';
          el.tile.classList.add('active-burst');
        } else if (n.lastEventTime && (Date.now() - n.lastEventTime < 3000)) {
          el.pill.textContent = 'Active';
          el.pill.className = 'nest-status-pill';
          el.pill.style.background = '#065f46';
          el.pill.style.color = '#34d399';
          el.tile.classList.remove('active-burst');
        } else {
          el.pill.textContent = 'Idle';
          el.pill.className = 'nest-status-pill';
          el.pill.style.background = '#334155';
          el.pill.style.color = '#94a3b8';
          el.tile.classList.remove('active-burst');
        }
      }
    });
  }
}

function processEventsBatch(events) {
  if (!events || events.length === 0) return;

  // Add sample events to ticker log (keep ticker light)
  events.slice(0, 3).forEach(evt => {
    const isBurst = evt.nestId === 'nest-05';
    addLogEntry(`[${evt.nestId}] ${evt.eventType} | Conf: ${(evt.confidence * 100).toFixed(0)}% | Ts: ${evt.timestamp}`, isBurst);
    
    // Update nest last event label
    const el = nestElements[evt.nestId];
    if (el) {
      el.lastEvt.textContent = `${evt.eventType} (${new Date(evt.timestamp).toLocaleTimeString()})`;
    }
  });
}

function addLogEntry(text, isBurst) {
  // Remove placeholder if present
  const placeholder = eventLog.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = `log-entry ${isBurst ? 'burst' : ''}`;
  entry.textContent = text;
  eventLog.appendChild(entry);

  // Keep max 50 log items
  while (eventLog.children.length > 50) {
    eventLog.removeChild(eventLog.firstChild);
  }

  eventLog.scrollTop = eventLog.scrollHeight;
}

// Listen for Strategy selector changes
strategySelect.addEventListener('change', (e) => {
  const newStrategy = e.target.value;
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy: newStrategy })
  }).catch(err => console.error('Failed to update strategy:', err));
});

// Init on page load
document.addEventListener('DOMContentLoaded', () => {
  initNestTiles();
  connectWebSocket();
});
