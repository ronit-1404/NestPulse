/**
 * In-Process Event Buffer Queue
 * Decouples ingestion HTTP API from browser WebSocket delivery.
 * Supports dual strategies:
 *   1. 'lagging' (complete-but-lagging): Unbounded/large queue preserving all events; lag grows during bursts.
 *   2. 'dropping' (current-but-dropping): Bounded queue dropping oldest events on overflow to maintain near real-time stream.
 */
export class EventQueue {
  constructor(options = {}) {
    this.strategy = options.strategy || 'lagging'; // 'lagging' | 'dropping'
    this.maxCapacity = options.maxCapacity || 500; // Capacity limit for dropping strategy mode
    
    // Core data structures
    this.buffer = [];
    
    // Aggregated Metrics
    this.totalIngested = 0;
    this.totalDelivered = 0;
    this.totalDropped = 0;
    this.currentLagMs = 0;

    // Sliding window metrics tracking (1-second window)
    this.ingestTimestamps = [];
    this.deliveryTimestamps = [];

    // Per-nest counters (nestId -> { ingested, delivered })
    this.nestStats = {};
    for (let i = 1; i <= 12; i++) {
      const nestId = `nest-${String(i).padStart(2, '0')}`;
      this.nestStats[nestId] = {
        nestId,
        name: `Nest Camera #${String(i).padStart(2, '0')}`,
        ingested: 0,
        delivered: 0,
        lastEventTime: null,
        lastEventType: null,
        recentIngestCount: 0
      };
    }

    // Periodic rolling rate calculator (updates rates every second)
    this.ingestRate = 0;
    this.deliveryRate = 0;
    this._startRateCalculator();
  }

  setStrategy(strategy) {
    if (['lagging', 'dropping'].includes(strategy)) {
      this.strategy = strategy;
      console.log(`[Queue] Strategy updated to: ${this.strategy}`);
    }
  }

  /**
   * Enqueue event into buffer.
   * Runs in O(1) synchronous time on Ingestion API thread.
   */
  enqueue(event) {
    const now = Date.now();
    const eventWithIngress = {
      ...event,
      ingressTimestamp: now
    };

    // Update nest stats
    const nestId = event.nestId;
    if (this.nestStats[nestId]) {
      this.nestStats[nestId].ingested++;
      this.nestStats[nestId].lastEventTime = now;
      this.nestStats[nestId].lastEventType = event.eventType;
      this.nestStats[nestId].recentIngestCount++;
    }

    this.totalIngested++;
    this.ingestTimestamps.push(now);

    // Strategy behavior on enqueue
    if (this.strategy === 'dropping' && this.buffer.length >= this.maxCapacity) {
      // Drop oldest event to keep stream current
      this.buffer.shift();
      this.totalDropped++;
    }

    this.buffer.push(eventWithIngress);
    return true;
  }

  /**
   * Enqueue a batch of events
   */
  enqueueBatch(events) {
    for (const evt of events) {
      this.enqueue(evt);
    }
  }

  /**
   * Dequeue next event for delivery to browser
   */
  dequeue() {
    if (this.buffer.length === 0) return null;

    const event = this.buffer.shift();
    const now = Date.now();
    
    this.totalDelivered++;
    this.deliveryTimestamps.push(now);

    if (this.nestStats[event.nestId]) {
      this.nestStats[event.nestId].delivered++;
    }

    // Calculate latency/lag: difference between current delivery time and original event creation timestamp
    const creationTime = new Date(event.timestamp).getTime();
    this.currentLagMs = Math.max(0, now - (isNaN(creationTime) ? event.ingressTimestamp : creationTime));

    return event;
  }

  /**
   * Dequeue up to maxCount events for batch delivery
   */
  dequeueBatch(maxCount = 50) {
    const batch = [];
    while (batch.length < maxCount && this.buffer.length > 0) {
      const evt = this.dequeue();
      if (evt) batch.push(evt);
    }
    return batch;
  }

  get size() {
    return this.buffer.length;
  }

  _startRateCalculator() {
    setInterval(() => {
      const now = Date.now();
      const windowStart = now - 1000;

      // Filter timestamps within last 1 second
      this.ingestTimestamps = this.ingestTimestamps.filter(t => t > windowStart);
      this.deliveryTimestamps = this.deliveryTimestamps.filter(t => t > windowStart);

      this.ingestRate = this.ingestTimestamps.length;
      this.deliveryRate = this.deliveryTimestamps.length;
    }, 500);
  }

  /**
   * Snapshot of full queue metrics
   */
  getMetrics() {
    return {
      strategy: this.strategy,
      totalIngested: this.totalIngested,
      totalDelivered: this.totalDelivered,
      totalDropped: this.totalDropped,
      queueSize: this.buffer.length,
      maxCapacity: this.maxCapacity,
      ingestRate: this.ingestRate,
      deliveryRate: this.deliveryRate,
      currentLagMs: this.currentLagMs,
      currentLagSec: (this.currentLagMs / 1000).toFixed(2),
      nestStats: Object.values(this.nestStats)
    };
  }
}
