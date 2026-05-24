import React, { useEffect, useState } from 'react';
import UsageChart, { DailyUsageData } from '../components/UsageChart';
import LeakDiag from '../components/LeakDiag';

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
  const [dailyData, setDailyData] = useState<DailyUsageData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      try {
        // Fetch aggregated summary
        const summaryResp = await fetch('/v1/usage/summary');
        if (summaryResp.ok) {
          const summaryData = await summaryResp.json();
          // Map snake_case from gateway backend to camelCase in frontend
          setSummary({
            totalRequests: summaryData.total_requests || 0,
            totalPromptTokens: summaryData.total_prompt_tokens || 0,
            totalCompletionTokens: summaryData.total_completion_tokens || 0,
            totalTokens: summaryData.total_tokens || 0,
            totalTokensSaved: summaryData.total_tokens_saved || 0,
            averageCompressionRatio: summaryData.average_compression_ratio || 0,
            estimatedCostUsd: summaryData.estimated_cost_usd || 0,
            periodStart: summaryData.period_start || '',
            periodEnd: summaryData.period_end || '',
          });
        }

        // Fetch daily analytics points
        const dailyResp = await fetch('/v1/usage/daily');
        if (dailyResp.ok) {
          const dailyPoints = await dailyResp.json();
          setDailyData(dailyPoints);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard metrics…</div>;
  }

  return (
    <div className="dashboard">
      <h1>CostOps Analytics Dashboard</h1>

      {/* 1. Real-time Anomaly Diagnostics warnings alert widgets */}
      <LeakDiag />

      {/* 2. Overview Stats grid cards */}
      <section className="metrics-grid">
        <div className="metric-card">
          <h3>Total Requests</h3>
          <p className="metric-value">{summary.totalRequests.toLocaleString()}</p>
        </div>

        <div className="metric-card">
          <h3>Tokens Spent</h3>
          <p className="metric-value">{summary.totalTokens.toLocaleString()}</p>
        </div>

        <div className="metric-card">
          <h3>Tokens Saved</h3>
          <p className="metric-value" style={{ color: '#10b981' }}>
            {summary.totalTokensSaved.toLocaleString()}
          </p>
        </div>

        <div className="metric-card">
          <h3>Avg Compression</h3>
          <p className="metric-value">
            {(summary.averageCompressionRatio * 100).toFixed(1)}%
          </p>
        </div>

        <div className="metric-card">
          <h3>Estimated Cost</h3>
          <p className="metric-value" style={{ color: '#8b5cf6' }}>
            ${summary.estimatedCostUsd.toFixed(4)}
          </p>
        </div>
      </section>

      {/* 3. Historical Usage Chart composed visualization */}
      <section className="metric-card usage-chart-card">
        <div className="chart-header">
          <h3>Historical Compression Savings vs Cost Spent</h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Dual-axis analysis tracking cumulative token optimizations (green area) against daily upstream cost (purple line)
          </p>
        </div>
        <UsageChart data={dailyData} />
      </section>
    </div>
  );
};

export default Dashboard;
