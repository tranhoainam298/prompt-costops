import React, { useEffect, useState } from 'react';
import LeakDiag from '../components/LeakDiag';
import PromptDiff from '../components/PromptDiff';
import {
  Activity,
  Cpu,
  PiggyBank,
  Percent,
  DollarSign,
  ArrowUpRight,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  RefreshCw,
  AlertTriangle,
  Flame,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';

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

interface DailyUsageData {
  date: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  tokensSaved: number;
  costUsd: number;
}

interface WalletBalance {
  userId: string;
  balanceTokens: number;
  usedTokens: number;
  monthlyBudget: number;
}

interface HistoryLogItem {
  id: string;
  createdAt: string;
  modelRequested: string;
  modelUsed: string;
  originalTokens: number;
  optimizedTokens: number;
  completionTokens: number;
  compressionRatio: number;
  estimatedCostUsd: number;
  originalPrompt: string;
  optimizedPrompt: string;
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
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [history, setHistory] = useState<HistoryLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const fetchData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Summary
      const summaryResp = await fetch('/api/analytics/summary');
      if (!summaryResp.ok) throw new Error('Failed to fetch usage summary');
      const summaryData = await summaryResp.json();
      setSummary(summaryData);

      // 2. Fetch Daily aggregates
      const dailyResp = await fetch('/api/analytics/daily');
      if (!dailyResp.ok) throw new Error('Failed to fetch daily data');
      const dailyPoints = await dailyResp.json();
      setDailyData(dailyPoints);

      // 3. Fetch Wallet balance
      const walletResp = await fetch('/api/wallet/balance');
      if (!walletResp.ok) throw new Error('Failed to fetch wallet quota');
      const walletData = await walletResp.json();
      setWallet(walletData);

      // 4. Fetch history logs for data table
      const historyResp = await fetch('/api/analytics/history?limit=10');
      if (!historyResp.ok) throw new Error('Failed to fetch optimized history logs');
      const historyData = await historyResp.json();
      setHistory(historyData);

    } catch (err: any) {
      console.error('Failed to load cost analytics telemetry:', err);
      setError(err?.message || 'A network error occurred while querying the database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  const toggleRow = (id: string): void => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Process data for Recharts Line Chart: Token Consumption vs. Savings
  const chartData = dailyData.map((row) => {
    const consumption = Math.max(row.promptTokens - row.tokensSaved + row.completionTokens, 0);
    return {
      date: new Date(row.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      consumption,
      savings: row.tokensSaved || 0,
    };
  });

  // Process data for Budget Pie Chart
  const usedBudget = wallet ? wallet.usedTokens : 0;
  const balanceBudget = wallet ? wallet.balanceTokens : 1000000;
  const totalBudget = wallet ? wallet.monthlyBudget : 1000000;
  const usedPercent = totalBudget > 0 ? (usedBudget / totalBudget) * 100 : 0;

  // Determine visual warning status
  let budgetStatus: 'safe' | 'warning' | 'critical' = 'safe';
  let budgetColor = '#10b981'; // Emerald-500
  let budgetBg = 'bg-emerald-500/10 text-emerald-650 border-emerald-500/20';

  if (usedPercent >= 90) {
    budgetStatus = 'critical';
    budgetColor = '#ef4444'; // Red-500
    budgetBg = 'bg-red-500/10 text-red-650 border-red-500/20 animate-pulse';
  } else if (usedPercent >= 70) {
    budgetStatus = 'warning';
    budgetColor = '#f59e0b'; // Amber-500
    budgetBg = 'bg-amber-500/10 text-amber-655 border-amber-500/20';
  }

  const pieData = [
    { name: 'Used Quota', value: usedBudget, color: budgetColor },
    { name: 'Remaining Balance', value: balanceBudget, color: '#e2e8f0' },
  ];

  // Custom tooltips
  const LineChartTooltip: React.FC<any> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 dark:bg-slate-950/95 border border-slate-800 p-4 rounded-xl shadow-2xl backdrop-blur-md font-sans text-xs text-slate-200 flex flex-col gap-2">
          <p className="font-semibold text-slate-400 border-b border-slate-800/80 pb-2">{label}</p>
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-indigo-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              <span>Consumed: {payload[0].value.toLocaleString()} tokens</span>
            </p>
            <p className="flex items-center gap-2 text-emerald-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Saved: {payload[1].value.toLocaleString()} tokens</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (error) {
    return (
      <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto py-16 px-4 text-center animate-in fade-in duration-300">
        <div className="flex justify-center">
          <div className="p-5 bg-red-100 dark:bg-red-950/30 border border-red-250 dark:border-red-900/50 rounded-full text-red-650 dark:text-red-400 shadow-inner">
            <AlertTriangle size={48} className="animate-bounce" />
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">Telemetry Outage</h2>
          <p className="text-sm text-slate-550 dark:text-slate-400 mt-3 max-w-lg mx-auto leading-relaxed">
            We encountered a database error while retrieving the cost analytics summary. Please ensure the backend and PostgreSQL database are online.
          </p>
          <div className="mt-6 bg-slate-50 dark:bg-slate-950/30 p-4 rounded-2xl border border-slate-200 dark:border-slate-850 max-w-xl mx-auto shadow-inner">
            <code className="text-xs font-mono text-red-650 dark:text-red-400 block break-all">{error}</code>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <RefreshCw size={14} className="animate-spin-slow" />
            <span>Reconnect Database</span>
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-8 animate-pulse w-full">
        <div>
          <div className="h-9 w-64 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mb-2" />
          <div className="h-5 w-96 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="h-36 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
          <div className="h-36 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
          <div className="h-36 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
          <div className="h-36 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
          <div className="h-36 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 h-[420px] bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
          <div className="lg:col-span-2 h-[420px] bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
        </div>
        <div className="h-72 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in duration-300">
      
      {/* Header telemetry layout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white select-none font-sans bg-gradient-to-r from-slate-900 via-slate-800 to-slate-650 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
            CostOps Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-sans leading-relaxed">
            Real-time prompt compression insights, cumulative token savings, and active leak warnings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 transition-colors shadow-sm"
            title="Refresh Dashboard"
          >
            <RefreshCw size={15} />
          </button>
          <span className="inline-flex items-center text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-650 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/40 shadow-sm">
            Active Billing Cycle
          </span>
        </div>
      </div>

      {/* Anomaly banner warnings alerts */}
      <LeakDiag />

      {/* Bento Grid of KPI Cards - Spacious layout padding p-8 and gap-8 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8" aria-label="Overview KPI Metrics">
        
        {/* KPI 1: Requests */}
        <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-550 dark:text-slate-400 font-bold font-sans">Total Requests</span>
            <span className="text-blue-500 dark:text-blue-400 bg-blue-500/10 p-2 rounded-xl border border-blue-500/10"><Activity size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-6">
            <span className="font-mono text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
              {summary.totalRequests.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>8.2%</span>
            </span>
          </div>
        </div>

        {/* KPI 2: Tokens Spent */}
        <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-550 dark:text-slate-400 font-bold font-sans">Tokens Spent</span>
            <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 p-2 rounded-xl border border-indigo-500/10"><Cpu size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-6">
            <span className="font-mono text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
              {summary.totalTokens.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>4.1%</span>
            </span>
          </div>
        </div>

        {/* KPI 3: Tokens Saved */}
        <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-550 dark:text-slate-400 font-bold font-sans">Tokens Saved</span>
            <span className="text-emerald-650 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/10"><PiggyBank size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-6">
            <span className="font-mono text-3xl font-black text-emerald-650 dark:text-emerald-400 tracking-tighter leading-none">
              {summary.totalTokensSaved.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>24.6%</span>
            </span>
          </div>
        </div>

        {/* KPI 4: Avg Compression */}
        <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-555 dark:text-slate-400 font-bold font-sans">Avg Compression</span>
            <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded-xl border border-amber-500/10"><Percent size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-6">
            <span className="font-mono text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">
              {(summary.averageCompressionRatio * 100).toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>1.8%</span>
            </span>
          </div>
        </div>

        {/* KPI 5: Est. Cost */}
        <div className="backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-widest text-slate-555 dark:text-slate-400 font-bold font-sans">Est. Cost</span>
            <span className="text-purple-650 dark:text-purple-400 bg-purple-500/10 p-2 rounded-xl border border-purple-500/10"><DollarSign size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-6">
            <span className="font-mono text-3xl font-black text-purple-600 dark:text-purple-400 tracking-tighter leading-none">
              ${summary.estimatedCostUsd.toFixed(4)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <TrendingDown size={10} />
              <span>5.2%</span>
            </span>
          </div>
        </div>

      </section>

      {/* Main Visualizations Section: Line Chart vs Donut Pie Chart - Spacious padding p-8 and gap-8 */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Token Consumption vs. Savings Time-series Line Chart */}
        <div className="lg:col-span-3 backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-8 shadow-md shadow-slate-100/50 dark:shadow-black/20 flex flex-col gap-6 hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all duration-300">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Token Consumption vs. Savings</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-1">
              Daily aggregates comparing total tokens consumed by compiled prompts versus compiler-saved tokens.
            </p>
          </div>
          
          <div className="w-full h-80 select-none">
            {chartData.length === 0 ? (
              <div className="h-full border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center text-slate-500 font-mono text-xs bg-slate-50/50 dark:bg-slate-950/20">
                <p>No daily aggregates recorded in this cycle.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 15, right: 10, bottom: 5, left: -5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                    className="font-mono"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    dx={-8}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                    className="font-mono"
                  />
                  <Tooltip content={<LineChartTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '11px', fontFamily: 'sans-serif', paddingBottom: '10px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    name="Consumed Tokens"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 1, fill: '#6366f1' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="savings"
                    name="Saved Tokens"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 1, fill: '#10b981' }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Budget Quota used vs total Pie/Donut Chart */}
        <div className="lg:col-span-2 backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-8 shadow-md shadow-slate-100/50 dark:shadow-black/20 flex flex-col justify-between gap-6 hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all duration-300">
          <div className="mb-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Wallet Budget Quota</h3>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-3 py-0.5 rounded-full border ${budgetBg}`}>
                {budgetStatus === 'safe' && <CheckCircle2 size={10} />}
                {budgetStatus === 'warning' && <AlertTriangle size={10} />}
                {budgetStatus === 'critical' && <Flame size={10} />}
                <span className="capitalize">{budgetStatus}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-1">
              Visual ledger tracking the daily token allocation consumed vs. remaining wallet balance.
            </p>
          </div>

          <div className="relative h-48 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill={budgetColor} />
                  <Cell fill="#e2e8f0" className="dark:fill-slate-800" />
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toLocaleString()} tokens`} />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Absolute Centered Text overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tighter leading-none">
                {usedPercent.toFixed(1)}%
              </span>
              <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest mt-1">
                Used Today
              </span>
            </div>
          </div>

          {/* Telemetry Breakdown Details - Airy pt-6 */}
          <div className="grid grid-cols-3 gap-2 pt-6 border-t border-slate-100 dark:border-slate-800/80 font-sans text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Total Quota</span>
              <span className="font-mono font-bold text-slate-850 dark:text-slate-200">
                {totalBudget.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Spent Today</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {usedBudget.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Remaining</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {balanceBudget.toLocaleString()}
              </span>
            </div>
          </div>

        </div>

      </section>

      {/* Recent Optimized Prompts Data Table - Luxurious padding p-8 and aligned layout margins */}
      <section className="backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-md shadow-slate-100/50 dark:shadow-black/20 flex flex-col overflow-hidden transition-all duration-300">
        
        <div className="p-8 border-b border-slate-150 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Optimized Prompts</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-1">
              Real-time audit log tracking recently optimized user prompt requests, compiler compression statistics, and token metrics.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700/50">
              Showing {history.length} records
            </span>
          </div>
        </div>

        {/* Structured developer-grade dense table */}
        <div className="w-full overflow-hidden">
          <table className="w-full text-sm text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-950/30 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-widest text-slate-550 dark:text-slate-400 font-mono select-none">
                <th className="py-4 pl-8 pr-3 w-[13%]">Timestamp</th>
                <th className="py-4 px-4 w-[25%]">Original Prompt</th>
                <th className="py-4 px-4 w-[32%]">Optimized Prompt</th>
                <th className="py-4 px-4 w-[13%] text-right">Reduction (%)</th>
                <th className="py-4 px-4 w-[11%]">Model Used</th>
                <th className="py-4 pl-3 pr-8 text-center w-[6%]">Action</th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400 dark:text-slate-500 font-mono">
                    <div className="flex flex-col items-center gap-3 justify-center">
                      <FileSpreadsheet size={32} className="text-slate-300 dark:text-slate-700 animate-pulse" />
                      <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">No Audit Logs Recorded</span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs leading-normal">
                        Optimization audits will appear here once executions are submitted in the prompt optimizer.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                history.map((log) => {
                  const dateStr = new Date(log.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  const isExpanded = expandedRowId === log.id;
                  
                  // Safe token compression calculation
                  const original = log.originalTokens || 0;
                  const optimized = log.optimizedTokens || 0;
                  const tokensSaved = Math.max(original - optimized, 0);
                  const reductionPercent = original > 0 ? (tokensSaved / original) * 100 : 0;

                  // Dynamic reduction badge coloring
                  let badgeClass = 'bg-slate-500/10 text-slate-700 dark:text-slate-450 border-slate-500/15';
                  if (reductionPercent >= 30) {
                    badgeClass = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-450 border-emerald-500/15';
                  } else if (reductionPercent > 0) {
                    badgeClass = 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-450 border-amber-500/15';
                  }

                  // Prompt preview truncators
                  const origPreview = log.originalPrompt.length > 55 
                    ? log.originalPrompt.slice(0, 55) + '...' 
                    : log.originalPrompt;
                  
                  const optPreview = log.optimizedPrompt.length > 55
                    ? log.optimizedPrompt.slice(0, 55) + '...'
                    : log.optimizedPrompt;

                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/15 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-indigo-50/20 dark:bg-indigo-950/5' : ''
                        }`}
                        onClick={() => toggleRow(log.id)}
                      >
                        {/* Timestamp - aligned pl-8 */}
                        <td className="py-4 pl-8 pr-3 text-xs text-slate-450 dark:text-slate-500 whitespace-nowrap font-mono">
                          {dateStr}
                        </td>

                        {/* Original Prompt preview - Clean elegant text */}
                        <td className="py-4 px-4">
                          <span className="text-xs font-sans font-normal text-slate-600 dark:text-slate-400 block truncate" title={log.originalPrompt}>
                            {origPreview}
                          </span>
                        </td>

                        {/* Optimized Prompt preview - Clean elegant text */}
                        <td className="py-4 px-4">
                          <span className="text-xs font-sans font-medium text-slate-800 dark:text-slate-200 block truncate" title={log.optimizedPrompt}>
                            {optPreview}
                          </span>
                        </td>

                        {/* Reduction statistics with pill badge and detailed token subtext */}
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`inline-flex items-center text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                              {reductionPercent.toFixed(1)}% Saved
                            </span>
                            <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 tracking-wide">
                              {original} → {optimized} tokens
                            </span>
                          </div>
                        </td>

                        {/* Model requested / used badge */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400">
                            {log.modelUsed}
                          </span>
                        </td>

                        {/* Comparative diff action toggle - aligned pr-8 */}
                        <td className="py-4 pl-3 pr-8 text-center whitespace-nowrap">
                          <button 
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(log.id);
                            }}
                          >
                            <span>{isExpanded ? 'Hide' : 'Compare'}</span>
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        </td>
                      </tr>

                      {/* Side-by-side prompt differential diff pane - aligned with px-8 */}
                      {isExpanded && (
                        <tr className="bg-slate-50/30 dark:bg-slate-950/20">
                          <td colSpan={6} className="px-8 py-6 border-b border-slate-100 dark:border-slate-800">
                            <div className="w-full transition-all duration-300">
                              <PromptDiff
                                original={log.originalPrompt}
                                optimized={log.optimizedPrompt}
                                compressionRatio={log.compressionRatio}
                                tokensSaved={tokensSaved}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </section>

    </div>
  );
};

export default Dashboard;
