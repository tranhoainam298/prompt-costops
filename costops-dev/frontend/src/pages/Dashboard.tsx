import React, { useEffect, useState } from 'react';

interface UsageSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalTokensSaved: number;
  averageCompressionRatio: number;
  estimatedCostUsd: number;
  periodStart: string;
  periodEnd: string;
}

const EMPTY_SUMMARY: UsageSummary = {
  totalRequests: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  totalTokensSaved: 0,
  averageCompressionRatio: 0,
  estimatedCostUsd: 0,
  periodStart: '',
  periodEnd: '',
};

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<UsageSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchSummary = async (): Promise<void> => {
      try {
        const response = await fetch('/v1/usage/summary');
        if (response.ok) {
          const data: UsageSummary = await response.json();
          setSummary(data);
        }
      } catch (error) {
        console.error('Failed to fetch usage summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard…</div>;
  }

  return (
    <div className="dashboard">
      <h1>CostOps Dashboard</h1>

      <section className="metrics-grid">
        <div className="metric-card">
          <h3>Total Requests</h3>
          <p className="metric-value">{summary.totalRequests.toLocaleString()}</p>
        </div>

        <div className="metric-card">
          <h3>Tokens Used</h3>
          <p className="metric-value">{summary.totalTokens.toLocaleString()}</p>
        </div>

        <div className="metric-card">
          <h3>Tokens Saved</h3>
          <p className="metric-value">{summary.totalTokensSaved.toLocaleString()}</p>
        </div>

        <div className="metric-card">
          <h3>Compression Ratio</h3>
          <p className="metric-value">
            {(summary.averageCompressionRatio * 100).toFixed(1)}%
          </p>
        </div>

        <div className="metric-card">
          <h3>Estimated Cost</h3>
          <p className="metric-value">${summary.estimatedCostUsd.toFixed(4)}</p>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
