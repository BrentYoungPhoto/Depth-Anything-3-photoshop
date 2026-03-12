import React, { useState, useEffect } from 'react';
import * as api from '../lib/api-client';

export const StatusBar: React.FC = () => {
  const [status, setStatus] = useState<api.BackendStatus | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const s = await api.getStatus();
        setStatus(s);
      } catch {
        setStatus(null);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="status-bar">
      <span className={`status-dot ${status ? 'status-dot--green' : 'status-dot--red'}`} />
      <span>{status ? 'Backend Online' : 'Backend Offline'}</span>
      {status?.gpu_available && status.gpu.name && (
        <>
          <span className="status-bar__sep">|</span>
          <span>
            {status.gpu.name} — {status.gpu.memory_used_gb?.toFixed(1)}/
            {status.gpu.memory_total_gb?.toFixed(1)} GB
          </span>
        </>
      )}
      {status?.model_loaded && status.model_name && (
        <>
          <span className="status-bar__sep">|</span>
          <span>Model: {status.model_name}</span>
        </>
      )}
    </div>
  );
};
