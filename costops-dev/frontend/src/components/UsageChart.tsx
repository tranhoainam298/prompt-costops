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
      <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg shadow-xl backdrop-blur-md font-mono text-xs text-slate-100 flex flex-col gap-2">
        <p className="font-bold text-slate-350 border-b border-slate-800 pb-1.5">{label}</p>
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="text-[8px] animate-pulse">●</span>
            <span>Saved: {payload[0].value.toLocaleString()} tokens</span>
          </p>
          <p className="flex items-center gap-1.5 text-blue-400 font-semibold">
            <span className="text-[8px] animate-pulse">●</span>
            <span>Cost: ${payload[1].value.toFixed(4)}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

export const UsageChart: React.FC<UsageChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-500 font-mono text-xs bg-slate-950/20">
        <p>No historical telemetry data available for this period.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-80 select-none">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 15, right: 5, bottom: 5, left: 5 }}
        >
          <defs>
            <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148, 163, 184, 0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={8}
            className="font-mono"
          />
          <YAxis
            yAxisId="left"
            stroke="#10b981"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dx={-8}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
            className="font-mono font-semibold"
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#3b82f6"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dx={8}
            tickFormatter={(v) => `$${v.toFixed(2)}`}
            className="font-mono font-semibold"
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="tokensSaved"
            name="Tokens Saved"
            stroke="#10b981"
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#colorSaved)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="costUsd"
            name="Cost Spent ($)"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3.5, strokeWidth: 1, fill: '#3b82f6' }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default UsageChart;
