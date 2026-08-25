import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header.jsx';
import { MetricsBar } from './components/MetricsBar.jsx';
import { StrategyBanner } from './components/StrategyBanner.jsx';
import { NestGrid } from './components/NestGrid.jsx';
import { EventTicker } from './components/EventTicker.jsx';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    }

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  function handleMessage(msg) {
    if (msg.type === 'init' || msg.type === 'metrics_tick') {
      const data = msg.metrics || (msg.data && msg.data.metrics);
      if (data) setMetrics(data);
    } else if (msg.type === 'events_batch') {
      if (msg.events && msg.events.length > 0) {
        const newLogs = msg.events.slice(0, 3).map((evt, i) => ({
          id: `${evt.eventId}_${Date.now()}_${i}`,
          time: new Date(evt.timestamp).toLocaleTimeString(),
          nestId: evt.nestId,
          text: `${evt.eventType} | Conf: ${(evt.confidence * 100).toFixed(0)}%`,
          isBurst: evt.nestId === 'nest-05'
        }));

        setLogs(prev => [...newLogs, ...prev].slice(0, 50));
      }

      if (msg.queueSize !== undefined) {
        setMetrics(prev => prev ? {
          ...prev,
          queueSize: msg.queueSize,
          currentLagMs: msg.currentLagMs,
          currentLagSec: (msg.currentLagMs / 1000).toFixed(2)
        } : null);
      }
    } else if (msg.type === 'system') {
      setLogs(prev => [{
        id: `sys_${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        nestId: 'SYSTEM',
        text: msg.message,
        isBurst: false
      }, ...prev].slice(0, 50));
    }
  }

  function handleStrategyChange(newStrategy) {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: newStrategy })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMetrics(prev => prev ? { ...prev, strategy: data.strategy } : null);
        }
      })
      .catch(err => console.error('Failed to change strategy:', err));
  }

  return (
    <div className="app-viewport">
      <Header
        isConnected={isConnected}
        strategy={metrics?.strategy || 'lagging'}
        onStrategyChange={handleStrategyChange}
      />

      <MetricsBar metrics={metrics} />

      <StrategyBanner strategy={metrics?.strategy || 'lagging'} />

      <NestGrid nestStats={metrics?.nestStats} />

      <EventTicker logs={logs} />
    </div>
  );
}
