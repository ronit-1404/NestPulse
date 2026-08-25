import React from 'react';
import { NestCard } from './NestCard.jsx';

export function NestGrid({ nestStats }) {
  // Ensure array of 12 nests even if metrics not yet received
  const nests = (nestStats && nestStats.length === 12) 
    ? nestStats 
    : Array.from({ length: 12 }, (_, i) => {
        const id = `nest-${String(i + 1).padStart(2, '0')}`;
        return {
          nestId: id,
          name: `Nest Camera #${String(i + 1).padStart(2, '0')}`,
          ingested: 0,
          delivered: 0,
          lastEventTime: null,
          lastEventType: null,
          recentIngestCount: 0
        };
      });

  return (
    <section style={{ marginBottom: '32px' }}>
      <div className="section-header">
        <h2>Simulated Nest Cameras (12 Nests)</h2>
        <span className="count-pill">12 Active Cameras</span>
      </div>

      <div className="nest-cards-grid">
        {nests.map(nest => (
          <NestCard key={nest.nestId} nest={nest} />
        ))}
      </div>
    </section>
  );
}
