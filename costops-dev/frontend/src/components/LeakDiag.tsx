import React, { useEffect, useState } from 'react';

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
        setAlerts(data);
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
        // Filter out from local state immediately for instant feedback
        setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      }
    } catch (err) {
      console.error(`Failed to acknowledge alert ${alertId}:`, err);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Poll for anomalies every 10 seconds to keep it live
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && alerts.length === 0) {
    return null; // Silent while initial loading
  }

  if (alerts.length === 0) {
    return null; // Hidden if there are no unread warning alerts
  }

  return (
    <div className="leak-alerts-container">
      <div className="leak-alerts-header">
        <span className="leak-warning-icon">⚠️</span>
        <h3>Active System Anomalies & Token Leaks Detected</h3>
      </div>
      <div className="leak-alerts-list">
        {alerts.map((alert) => {
          const date = new Date(alert.createdAt).toLocaleString();
          return (
            <div key={alert.id} className="leak-alert-card">
              <div className="alert-card-header">
                <span className="alert-badge">{alert.alertType.toUpperCase()}</span>
                <span className="alert-timestamp">{date}</span>
              </div>
              <p className="alert-message">{alert.message}</p>
              <button
                className="alert-ack-btn"
                onClick={() => handleAcknowledge(alert.id)}
              >
                Acknowledge & Clear Anomaly
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeakDiag;
