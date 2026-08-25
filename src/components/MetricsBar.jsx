import React from 'react';
import { ArrowDownRight, ArrowUpRight, Database, Clock, Trash2 } from 'lucide-react';

export function MetricsBar({ metrics }) {
  const ingestRate = metrics?.ingestRate || 0;
  const deliveryRate = metrics?.deliveryRate || 0;
  const queueSize = metrics?.queueSize || 0;
  const currentLagSec = parseFloat(metrics?.currentLagSec || 0);
  const totalDropped = metrics?.totalDropped || 0;
  const strategy = metrics?.strategy || 'lagging';

  // State evaluation
  let queueStateClass = '';
  let queueStateText = 'BUFFER STABLE';
  if (strategy === 'dropping' && totalDropped > 0) {
    queueStateClass = 'danger';
    queueStateText = 'DROPPING OVERFLOW';
  } else if (queueSize > 500) {
    queueStateClass = 'danger';
    queueStateText = 'HEAVY BACKLOG';
  } else if (queueSize > 50) {
    queueStateClass = 'warning';
    queueStateText = 'DRAINING BACKLOG';
  }

  let lagCardClass = '';
  if (currentLagSec > 2.0) {
    lagCardClass = 'danger';
  } else if (currentLagSec > 0.5) {
    lagCardClass = 'warning';
  }

  return (
    <div className="metrics-grid">
      {/* Ingestion Rate Card */}
      <div className="mcp-metric-card">
        <div className="metric-header">
          <span className="metric-title">Ingestion Rate</span>
          <ArrowDownRight className="metric-icon" size={18} color="var(--accent-cyan)" />
        </div>
        <div className="metric-num">
          {ingestRate} <span className="metric-unit">ev/s</span>
        </div>
        <div className="metric-footer">
          Incoming from HTTP Ingest API
        </div>
      </div>

      {/* Egress Delivery Rate Card */}
      <div className="mcp-metric-card">
        <div className="metric-header">
          <span className="metric-title">Delivery Rate</span>
          <ArrowUpRight className="metric-icon" size={18} color="var(--accent-green)" />
        </div>
        <div className="metric-num">
          {deliveryRate} <span className="metric-unit">ev/s</span>
        </div>
        <div className="metric-footer">
          WebSocket Push to Browser
        </div>
      </div>

      {/* Queue Backlog Depth Card */}
      <div className={`mcp-metric-card ${queueStateClass}`}>
        <div className="metric-header">
          <span className="metric-title">Queue Backlog</span>
          <Database className="metric-icon" size={18} />
        </div>
        <div className="metric-num">
          {queueSize} <span className="metric-unit">events</span>
        </div>
        <div className="metric-footer">
          {queueStateText}
        </div>
      </div>

      {/* Delivery Lag Card */}
      <div className={`mcp-metric-card ${lagCardClass}`}>
        <div className="metric-header">
          <span className="metric-title">Delivery Lag</span>
          <Clock className="metric-icon" size={18} />
        </div>
        <div className="metric-num">
          {currentLagSec.toFixed(2)} <span className="metric-unit">sec</span>
        </div>
        <div className="metric-footer">
          Ingress-to-Browser Timestamp Delta
        </div>
      </div>

      {/* Dropped Events Card */}
      <div className={`mcp-metric-card ${totalDropped > 0 ? 'danger' : ''}`}>
        <div className="metric-header">
          <span className="metric-title">Dropped Events</span>
          <Trash2 className="metric-icon" size={18} color={totalDropped > 0 ? 'var(--accent-red)' : 'var(--text-muted)'} />
        </div>
        <div className="metric-num">
          {totalDropped}
        </div>
        <div className="metric-footer">
          Overflow Discards (Dropping Mode)
        </div>
      </div>
    </div>
  );
}
