import React, { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';

export interface CostAlertData {
  id: string;
  userId: string;
  alertType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const LeakDiag: React.FC = () => {
  const [alerts, setAlerts] = useState<CostAlertData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAlerts = async (): Promise<void> => {
    try {
      const response = await fetch('/v1/alerts');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setAlerts(data);
        } else if (data && typeof data === 'object' && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        } else {
          setAlerts([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId: string): Promise<void> => {
    try {
      const response = await fetch(`/v1/alerts/${alertId}/read`, {
        method: 'POST',
      });
      if (response.ok) {
        setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      }
    } catch (err) {
      console.error(`Failed to acknowledge alert ${alertId}:`, err);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && alerts.length === 0) {
    return null;
  }

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-5 mb-4 shadow-lg shadow-red-950/10 flex flex-col gap-4 animate-pulse-glow" aria-label="System active anomaly diagnostic banner">
      
      {/* Title Header */}
      <div className="flex items-center gap-2 border-b border-red-900/20 pb-2.5">
        <AlertOctagon size={16} className="text-red-500 animate-bounce" />
        <h3 className="text-xs font-bold font-mono tracking-widest text-red-400 uppercase">
          Active System Anomalies & Token Leaks Detected
        </h3>
      </div>

      {/* Diagnostics Alert Cards list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {alerts.map((alert) => {
          const date = new Date(alert.createdAt).toLocaleString();
          return (
            <div key={alert.id} className="bg-slate-950/40 border border-red-900/35 rounded-lg p-3.5 flex flex-col justify-between gap-3 shadow hover:border-red-500/50 transition-colors duration-200">
              <div className="flex justify-between items-center gap-2">
                <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-red-950/60 border border-red-900/50 text-red-400 uppercase tracking-widest">
                  {alert.alertType}
                </span>
                <span className="font-mono text-[10px] text-slate-500">{date}</span>
              </div>
              
              <p className="text-xs text-red-200/90 font-mono leading-relaxed flex-1">
                {alert.message}
              </p>

              <button
                className="mt-1 self-start inline-flex items-center gap-1.5 bg-red-950/40 hover:bg-red-900/20 text-red-300 hover:text-white border border-red-900/50 hover:border-red-500 text-[10px] font-bold uppercase tracking-widest font-mono rounded py-1 px-3 transition-all duration-200"
                onClick={() => handleAcknowledge(alert.id)}
              >
                <CheckCircle2 size={11} />
                <span>Acknowledge & Clear</span>
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
};

export default LeakDiag;
