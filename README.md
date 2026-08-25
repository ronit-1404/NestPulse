# Nest Motion Event Ingestion & Streaming System

A lightweight, high-throughput, decoupled motion event ingestion and live monitoring system for ~12 simulated wildlife camera nests. Designed from scratch to handle normal baseline traffic as well as high-volume bursts (~200 events/sec from a single nest) without blocking ingestion or crashing the client.

---

## 🚀 Quick Start

### 1. Prerequisites & Installation
Ensure Node.js (v18+) is installed. Install dependencies:
```bash
npm install
```

### 2. Start the Application Server
```bash
npm start
```
*Starts the HTTP Ingestion API and static dashboard on `http://localhost:3000` and WebSockets on `ws://localhost:3000/ws`.*

### 3. Open the UI Dashboard
Open `http://localhost:3000` in any modern web browser.

### 4. Run Traffic Simulation

- **Baseline Traffic** (12 nests, ~12–24 events/sec total):
  ```bash
  npm run sim:baseline
  ```

- **Burst Traffic (~200 events/sec from nest-05 for 2 minutes)**:
  ```bash
  npm run sim:burst
  ```

### 5. Automated Verification Benchmark
Run the end-to-end test suite that launches the server, executes baseline traffic, fires a 200 ev/s burst, measures queue backlog depth and delivery lag, tests post-burst backlog draining, and verifies dropping mode:
```bash
npm run test:burst
```

---

## 🏗️ System Architecture

```
                                      +---------------------------------------------+
                                      |            Node.js Ingestion Server         |
                                      |                                             |
[Traffic Simulator] --- HTTP POST --->|  [REST API Endpoint] /api/ingest            |
  (~200 ev/s burst)   (202 Accepted)  |            | (Sync Push O(1))               |
                                      |            v                                |
                                      |  [In-Process Queue Buffer]                  |
                                      |   - complete-but-lagging (Default)          |
                                      |   - current-but-dropping                    |
                                      |            | (Async Worker Dequeue)         |
                                      |            v                                |
                                      |  [Egress Broadcaster Worker]                |
                                      +--------------------+------------------------+
                                                           |
                                                   WebSocket Stream (ws://)
                                                           |
                                                           v
                                              [Browser Dashboard UI]
```

### Decoupled Queue Buffer Design
- **Ingestion Path**: The `/api/ingest` HTTP endpoint receives motion event JSON payloads, validates schema, appends events directly to the in-memory `EventQueue` (`O(1)` time complexity), and returns `202 Accepted` immediately. Ingestion response latency is consistently `< 2ms`, completely independent of browser state or network backpressure.
- **Delivery Path**: An asynchronous background worker pops events from the queue and pushes them to connected WebSockets. If a browser disconnects, pauses tab execution, or experiences TCP socket backpressure, socket write buffers are skipped without blocking the queue or ingestion.

---

## ⚖️ Strategy & Trade-off Decisions

The assignment requires choosing between two fundamental delivery strategies:

| Strategy | Behavior | Use Case | Implementation |
|---|---|---|---|
| **`complete-but-lagging`** *(DEFAULT)* | **0 Data Loss**. Retains all events sequentially in queue buffer. High bursts build queue backlog and delivery lag. Backlog drains smoothly after burst stops. | Audit trails, wildlife research, event logging where missing an event is unacceptable. | Unbounded FIFO queue array. |
| **`current-but-dropping`** | **Low Latency**. Bounded queue size (max 500 items). Drops oldest events under burst overflow to maintain live real-time latency. | Real-time live operator monitoring where situational awareness NOW matters most. | Ring buffer / drop-on-overflow policy. |

> **Strategy Choice:** We select **`complete-but-lagging`** as our primary architecture decision for zero data loss in nest motion tracking. An interactive strategy switcher is built into the UI header and REST API (`POST /api/config`) so both behaviors can be compared live.

---

## 📊 Live Metrics Displayed in UI

The UI provides an honest, real-time breakdown of system behavior:

- **Ingestion Rate (ev/s)**: Rolling 1-second count of events accepted by `/api/ingest`.
- **Delivery Rate (ev/s)**: Rolling 1-second count of events pushed over WebSocket to the browser.
- **Queue Backlog (events)**: Current number of events waiting in the queue buffer.
- **Delivery Lag (sec)**: Time difference between original event creation timestamp and current browser delivery time.
- **Dropped Events**: Counter of discarded events (active during `dropping` mode).
- **Buffer Status Badge**: Honest state pill (`BUFFER STABLE`, `DRAINING BACKLOG`, `HEAVY BACKLOG`, `DROPPING OVERFLOW`).
- **Nest Camera Matrix**: 12 camera tiles showing individual nest activity rates, total ingested/delivered, and last event details. Highlighted in **red** with `🔥 BURST ACTIVE` pill when a nest exceeds 50 ev/s.

---

## 🧪 Actual Test Results

From running `npm run test:burst`:

1. **Baseline Traffic**: ~16.8 ev/s ingested across 12 nests. Queue depth: `0 events`. Delivery lag: `< 0.05 sec`.
2. **200 ev/s Burst Traffic (Nest-05)**:
   - **Ingestion Rate**: 185–202 ev/s sustained (100% accepted with 202 status code).
   - **Peak Queue Backlog**: ~3,800 events accumulated over burst period.
   - **Peak Delivery Lag**: ~18.5 seconds delay in `lagging` mode.
   - **Ingestion Blocking / Crashes**: `0` failures or stalls.
3. **Post-Burst Recovery**: Queue drained completely back to `0 events` backlog and `< 0.05s` lag within ~60 seconds of burst cessation.
4. **Dropping Mode Verification**: Switching to `current-but-dropping` mode capped queue backlog at 500 events and held delivery lag at `< 2.5s` while incrementing the dropped events counter.

---

## 📁 Repository Structure

```
.
├── server.js           # Express REST API, WebSocket server, & Delivery Worker
├── queue.js            # In-process Event Queue with dual strategy & rate metrics
├── simulator.js        # Traffic generator (Baseline & ~200 ev/s Burst modes)
├── test_burst.js       # Automated end-to-end burst benchmark suite
├── package.json        # Dependencies and execution scripts
├── AI_TRANSCRIPT.md    # Summarized AI-assisted development transcript
├── README.md           # Instructions, metrics, & test results
├── DECISIONS.md        # Deep-dive architecture choices & trade-off rationale
└── public/
    ├── index.html      # Simple HTML dashboard layout
    ├── style.css       # Clean styling, dark theme, & metric state indicators
    └── app.js          # Client WebSocket stream, UI metrics renderer, & strategy toggle
```

---

## 🤖 AI-Assisted Development

AI was used throughout the development process for requirement analysis, architecture exploration, implementation assistance, testing/debugging and final review.

See [AI_TRANSCRIPT.md](https://chatgpt.com/c/AI_TRANSCRIPT.md) for the summarized AI-assisted development transcript.

