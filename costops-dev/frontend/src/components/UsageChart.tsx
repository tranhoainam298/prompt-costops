import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export interface DailyUsageData {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  tokensSaved: number;
  costUsd: number;
}

interface UsageChartProps {
  data: DailyUsageData[];
}

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-chart-tooltip">
        <p className="tooltip-label">{label}</p>
        <div className="tooltip-divider" />
        <p className="tooltip-item saved-item">
          <span className="tooltip-dot saved-dot">●</span>
          Tokens Saved: <strong>{payload[0].value.toLocaleString()}</strong>
        </p>
        <p className="tooltip-item cost-item">
          <span className="tooltip-dot cost-dot">●</span>
          Cost: <strong>${payload[1].value.toFixed(4)}</strong>
        </p>
      </div>
    );
  }
  return null;
};

export const UsageChart: React.FC<UsageChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="empty-chart-fallback">
        <p>No historical usage data available for this period.</p>
      </div>
    );
  }

  return (
    <div className="usage-chart-container">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 5, bottom: 5, left: 5 }}
        >
          <defs>
            <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255, 255, 255, 0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="#9ca3af"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            yAxisId="left"
            stroke="#10b981"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dx={-10}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#8b5cf6"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dx={10}
            tickFormatter={(v) => `$${v.toFixed(2)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="tokensSaved"
            name="Tokens Saved"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorSaved)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="costUsd"
            name="Cost Spent ($)"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 1 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default UsageChart;
