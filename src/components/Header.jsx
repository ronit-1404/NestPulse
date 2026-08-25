import React from 'react';
import { Activity, ShieldAlert, Cpu, Layers } from 'lucide-react';

export function Header({ isConnected, strategy, onStrategyChange }) {
  return (
    <header className="mcp-header">
      <div className="brand-title">
        <div className="brand-icon">
          <Activity size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>NestPulse Event Stream</h1>
            <span className="tag">Decoupled Queue</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            12 Nest Camera Ingestion & Streaming Pipeline
          </div>
        </div>
      </div>

      <div className="header-right">
        {/* Strategy Selector Toggle */}
        <div className="strategy-toggle">
          <button
            className={`strategy-btn ${strategy === 'lagging' ? 'active' : ''}`}
            onClick={() => onStrategyChange('lagging')}
            title="Complete-but-Lagging: Zero Data Loss (Buffers high burst in queue)"
          >
            <Layers size={14} />
            Complete-but-Lagging
          </button>
          <button
            className={`strategy-btn ${strategy === 'dropping' ? 'active' : ''}`}
            onClick={() => onStrategyChange('dropping')}
            title="Current-but-Dropping: Low Latency (Drops oldest on buffer overflow)"
          >
            <ShieldAlert size={14} />
            Current-but-Dropping
          </button>
        </div>

        {/* Live WebSocket Status Pill */}
        <div className="connection-pill">
          <div className={`live-pulse ${isConnected ? 'connected' : ''}`} />
          <span>{isConnected ? 'STREAM CONNECTED' : 'RECONNECTING...'}</span>
        </div>
      </div>
    </header>
  );
}
