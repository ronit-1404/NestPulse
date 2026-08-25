import React from 'react';
import { Terminal } from 'lucide-react';

export function EventTicker({ logs }) {
  return (
    <section className="ticker-container">
      <div className="ticker-header">
        <Terminal size={18} color="var(--accent-cyan)" />
        <span>Live Ingested Event Feed (Egress Stream Ticker)</span>
      </div>

      <div className="ticker-log-box">
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
            Awaiting real-time event packets...
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={log.id || idx} className={`log-row ${log.isBurst ? 'burst' : ''}`}>
              <span className="log-time">{log.time}</span>
              <span className="log-nest">[{log.nestId}]</span>
              <span>{log.text}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
