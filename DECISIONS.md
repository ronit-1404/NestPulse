# Architectural & Technical Decision Record

This document records the architectural choices, queue decoupling mechanisms, trade-off selections, and design constraints implemented in the **Nest Motion Event Ingestion & Streaming System**.

---

## 1. System Architecture & Tech Stack Selection

### Choice: Single-Process Node.js with In-Process Queue Buffer
We chose a **Node.js (Express + `ws`)** application with an **in-process bounded/unbounded memory queue (`EventQueue`)**.

#### Rationale for Smallest Reasonable Architecture
- **Workload Scale**: 12 nests generating baseline traffic (~15 ev/s) with a peak burst of ~200 ev/s from one nest represents an aggregate ingestion payload bandwidth of `~20–50 KB/sec`.
- **Infrastructure Overhead**: Introducing external message brokers (Kafka, RabbitMQ, Redis), container orchestration (Kubernetes, Docker Compose), or cloud databases adds significant operational complexity, latency, and setup friction without providing technical benefit at this scale.
- **Node.js Capabilities**: Node.js executes asynchronous I/O on a single-threaded event loop. Enqueuing JavaScript objects into an in-memory array takes `< 0.001 ms` per event. Node.js can easily ingest upwards of `10,000 events/sec` in memory on modest hardware.

---

## 2. Queue Decoupling & Non-Blocking Guarantees

### The Core Problem
If event ingestion and browser delivery are tightly coupled (e.g., synchronously broadcasting incoming HTTP POST events directly to WebSockets), a slow browser client, network congestion, or WebSocket backpressure will stall the HTTP ingestion endpoint or crash the server.

### The Decoupled Queue Solution
Our architecture enforces strict isolation between Ingestion and Egress:

```
[HTTP POST /api/ingest]
        │
        ▼ (Synchronous O(1) Enqueue)
┌────────────────────────────────────────────────────────┐
│                   In-Process EventQueue                 │
└────────────────────────────────────────────────────────┘
        │
        ▼ (Asynchronous Dequeue Loop @ 50ms)
[WebSocket Egress Broadcaster] ───> [Browser Clients]
```

1. **Ingestion Endpoint (`POST /api/ingest`)**:
   - Accepts motion event payloads.
   - Validates JSON schema.
   - Pushes event object into `EventQueue` array (`O(1)` time complexity).
   - Immediately returns `HTTP 202 Accepted` (`< 2ms` latency).
   - **Never blocks** on browser WebSocket status, client socket buffers, or rendering speed.

2. **Egress Broadcaster Worker**:
   - Runs on an independent timer loop (every 50ms).
   - Dequeues events up to the target delivery rate limit (~60 ev/s).
   - Checks `ws.bufferedAmount` for each connected client. If a client's socket buffer exceeds `512 KB` (indicating a frozen tab or slow network), the worker skips sending frames to that specific socket without halting the delivery loop or queue operations.

---

## 3. Trade-off Analysis: Complete-but-Lagging vs Current-but-Dropping

The assignment requires an explicit choice between two buffering strategies during high-volume traffic bursts.

### Selected Strategy: `complete-but-lagging` (Default Choice)

#### Rationale
For nest camera motion tracking, motion events carry critical scientific and observational value (e.g. recording egg hatchings, predator interactions, feeding frequencies). Losing event payloads corrupts historical count integrity. 

- **Behavior**: Under a 200 ev/s burst, the ingestion side accepts all 200 ev/s into the queue. Since browser delivery rate is capped at ~60 ev/s to prevent UI DOM exhaustion, queue backlog builds up linearly (+140 ev/s) and delivery lag increases (e.g., reaching 10–20 seconds).
- **Drain Behavior**: As soon as the 2-minute burst terminates and traffic returns to baseline (~15 ev/s), the delivery worker continues draining the queue at 60 ev/s. Within ~60 seconds post-burst, queue depth returns to 0 and delivery lag drops back to `< 0.05s`.
- **Data Loss**: **0 events dropped**.

### Alternative Strategy: `current-but-dropping` (Configurable Toggle)

#### Behavior
- Uses a bounded queue with `maxCapacity = 500`.
- When the queue fills during a 200 ev/s burst, the queue drops the oldest events on overflow (`buffer.shift()`) and increments `totalDropped`.
- **Trade-off**: Keeps live delivery lag capped at `< 2.5 seconds`, but discards older events during congestion.

*Both strategies are implemented in `queue.js` and can be toggled at runtime via the UI header dropdown or API endpoint (`POST /api/config`).*

---

## 4. UI Design & Metrics Honesty

Per the assignment directive, UI styling was kept intentionally simple, readable, and functional without heavy design frameworks or charts:

- **Typography**: Clean system sans-serif fonts (`-apple-system, Segoe UI, Roboto`).
- **Nest Camera Matrix**: 12 clean grid tiles displaying nest name, status, active ingestion counts, and recent event details.
- **Honest System Metrics**:
  - `Ingestion Rate`: Incoming events/sec received from simulator.
  - `Delivery Rate`: Egress events/sec pushed to WebSockets.
  - `Queue Backlog`: Exact pending count in queue buffer.
  - `Delivery Lag`: Difference between event creation time and browser rendering time.
  - `Dropped Events`: Counter incremented when buffer overflows in dropping mode.
- **Status Indicators**: Dynamic badge pills (`BUFFER STABLE`, `DRAINING BACKLOG`, `HEAVY BACKLOG`, `DROPPING OVERFLOW`) and tile highlights (`🔥 BURST ACTIVE`) visually reflect system load.

---

## 5. Explicit Exclusions

The following features were intentionally excluded per prompt constraints to maintain architectural simplicity:
- Authentication & user login screens
- Persistent databases (PostgreSQL, MongoDB, SQLite)
- Video/image transcoding or RTSP camera feeds
- Microservices, Docker, Kubernetes, or cloud deployment configs
- Complex chart libraries or CSS animation frameworks
