import http from 'http';
import { parseArgs } from 'util';

// Parse command line arguments
const options = {
  mode: { type: 'string', default: 'baseline' },
  nest: { type: 'string', default: 'nest-05' },
  rate: { type: 'string', default: '200' },
  duration: { type: 'string', default: '120' },
  targetUrl: { type: 'string', default: 'http://localhost:3000/api/ingest' }
};

let args;
try {
  args = parseArgs({ options, allowPositionals: true }).values;
} catch (e) {
  args = { mode: 'baseline', nest: 'nest-05', rate: '200', duration: '120', targetUrl: 'http://localhost:3000/api/ingest' };
}

const MODE = args.mode; // 'baseline' or 'burst'
const BURST_NEST_ID = args.nest;
const BURST_RATE = parseInt(args.rate, 10) || 200; // events/sec for burst nest
const BURST_DURATION_SEC = parseInt(args.duration, 10) || 120;
const TARGET_URL = new URL(args.targetUrl);

// Keep-alive agent for high-throughput HTTP POSTs
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50
});

const EVENT_TYPES = [
  'motion_detected',
  'object_entered',
  'nest_entry',
  'feeding_observed',
  'sound_alert'
];

let eventSeq = 0;

function generateEvent(nestId) {
  eventSeq++;
  return {
    eventId: `evt_${Date.now()}_${eventSeq}`,
    nestId: nestId,
    timestamp: new Date().toISOString(),
    eventType: EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)],
    confidence: parseFloat((0.75 + Math.random() * 0.24).toFixed(2)),
    metadata: {
      zone: ['entrance', 'perch', 'nesting_box', 'landing_pad'][Math.floor(Math.random() * 4)],
      frameIndex: eventSeq % 1000,
      sensorId: `sensor_${nestId}`
    }
  };
}

async function sendBatch(events) {
  if (events.length === 0) return;

  const payloadStr = JSON.stringify(events);

  return new Promise((resolve) => {
    const req = http.request(TARGET_URL, {
      method: 'POST',
      agent: httpAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr)
      }
    }, (res) => {
      res.resume(); // consume response stream
      res.on('end', () => resolve(true));
    });

    req.on('error', (err) => {
      console.error(`[Simulator Error] Failed to send ingestion batch: ${err.message}`);
      resolve(false);
    });

    req.write(payloadStr);
    req.end();
  });
}

console.log(`====================================================`);
console.log(`🦅 Nest Motion Traffic Generator`);
console.log(`Target: ${TARGET_URL.href}`);
console.log(`Mode: ${MODE.toUpperCase()}`);
if (MODE === 'burst') {
  console.log(`Burst Nest: ${BURST_NEST_ID}`);
  console.log(`Burst Target Rate: ${BURST_RATE} events/sec`);
  console.log(`Burst Duration: ${BURST_DURATION_SEC} seconds`);
} else {
  console.log(`Baseline Traffic across 12 nests (~12-24 events/sec total)`);
}
console.log(`====================================================\n`);

let isRunning = true;
let totalSent = 0;
const startTime = Date.now();

// Print periodic status every 5 seconds
const statusInterval = setInterval(() => {
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgRate = (totalSent / elapsedSec).toFixed(1);
  console.log(`[Simulator Status] Elapsed: ${elapsedSec}s | Total Sent: ${totalSent} events | Current Avg Rate: ${avgRate} ev/s`);
}, 5000);

// Stop process cleanly on SIGINT
process.on('SIGINT', () => {
  console.log('\n[Simulator] Stopping traffic generator...');
  isRunning = false;
  clearInterval(statusInterval);
  process.exit(0);
});

// Timer for burst mode duration limit
if (MODE === 'burst') {
  setTimeout(() => {
    console.log(`\n✅ [Simulator] Burst duration of ${BURST_DURATION_SEC} seconds completed.`);
    isRunning = false;
    clearInterval(statusInterval);
    process.exit(0);
  }, BURST_DURATION_SEC * 1000);
}

// Tick loop running every 50ms (20 ticks per second)
const TICK_INTERVAL_MS = 50;

async function runLoop() {
  while (isRunning) {
    const tickStart = Date.now();
    const batch = [];

    // 1. Baseline traffic generation across 12 nests (approx 1 event every second or two per nest)
    for (let i = 1; i <= 12; i++) {
      const nestId = `nest-${String(i).padStart(2, '0')}`;

      if (MODE === 'burst' && nestId === BURST_NEST_ID) {
        // High volume burst nest: send required events per 50ms tick
        // 200 ev/s over 20 ticks = 10 events per tick
        const eventsPerTick = Math.ceil(BURST_RATE / (1000 / TICK_INTERVAL_MS));
        for (let k = 0; k < eventsPerTick; k++) {
          batch.push(generateEvent(nestId));
        }
      } else {
        // Baseline nests: ~10% probability per tick per nest (~1 event/sec per nest)
        if (Math.random() < 0.08) {
          batch.push(generateEvent(nestId));
        }
      }
    }

    if (batch.length > 0) {
      totalSent += batch.length;
      sendBatch(batch).catch(() => {});
    }

    const elapsed = Date.now() - tickStart;
    const sleepTime = Math.max(0, TICK_INTERVAL_MS - elapsed);
    await new Promise(r => setTimeout(r, sleepTime));
  }
}

runLoop();
