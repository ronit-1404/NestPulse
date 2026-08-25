import React from 'react';
import { Camera, Flame, CheckCircle2 } from 'lucide-react';

export function NestCard({ nest }) {
  const isBursting = nest.recentIngestCount > 50;
  const isActive = nest.lastEventTime && (Date.now() - nest.lastEventTime < 3000);

  let badgeText = 'Idle';
  let badgeClass = '';
  if (isBursting) {
    badgeText = '🔥 BURST ACTIVE';
    badgeClass = 'burst';
  } else if (isActive) {
    badgeText = 'Active';
    badgeClass = 'active';
  }

  const formattedTime = nest.lastEventTime 
    ? new Date(nest.lastEventTime).toLocaleTimeString() 
    : 'No events yet';

  return (
    <div className={`nest-card ${isBursting ? 'bursting' : ''}`}>
      <div className="nest-card-head">
        <div className="nest-title-box">
          {isBursting ? (
            <Flame className="cam-icon" size={18} color="var(--accent-red)" />
          ) : (
            <Camera className="cam-icon" size={18} />
          )}
          <h3>{nest.name || nest.nestId}</h3>
        </div>

        <span className={`status-badge ${badgeClass}`}>
          {badgeText}
        </span>
      </div>

      <div className="nest-stats-row">
        <div className="nest-stat-box">
          <div className="nest-stat-label">Ingested</div>
          <div className="nest-stat-val">{nest.ingested || 0}</div>
        </div>
        <div className="nest-stat-box">
          <div className="nest-stat-label">Delivered</div>
          <div className="nest-stat-val">{nest.delivered || 0}</div>
        </div>
      </div>

      <div className="nest-card-foot">
        {nest.lastEventType ? `${nest.lastEventType} (${formattedTime})` : 'Awaiting motion events...'}
      </div>
    </div>
  );
}
