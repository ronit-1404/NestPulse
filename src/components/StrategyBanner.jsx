import React from 'react';
import { Info } from 'lucide-react';

export function StrategyBanner({ strategy }) {
  const isLagging = strategy === 'lagging';

  return (
    <div className="mcp-banner">
      <Info size={18} color="var(--accent-cyan)" />
      <div>
        <span className="banner-pill">
          {isLagging ? 'COMPLETE-BUT-LAGGING MODE' : 'CURRENT-BUT-DROPPING MODE'}
        </span>{' '}
        {isLagging ? (
          <span>
            <strong>Zero Data Loss Rationale:</strong> All motion events are preserved sequentially in memory. High-volume bursts build queue backlog and delivery lag, which then drain smoothly after traffic returns to baseline.
          </span>
        ) : (
          <span>
            <strong>Low Latency Rationale:</strong> Bounded buffer capacity (max 500 items). When full during a 200 ev/s burst, oldest events are dropped on overflow to maintain live real-time latency.
          </span>
        )}
      </div>
    </div>
  );
}
