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
  CheckCircle2,
  ShieldAlert,
  Terminal
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
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

  // Mock telemetry state for Pre-Crime predictor
  const [interceptedLoops, setInterceptedLoops] = useState<number>(23);
  const [tokensSavedByPrecrime, setTokensSavedByPrecrime] = useState<number>(23 * 4500);

  // --- Agentic Loop Monitor Mock Data ---
  const [loopFeed] = useState([
    { id: 1, time: '11:42:01', agent: 'Agent-0x4F', score: 92, status: 'KILLED' },
    { id: 2, time: '11:41:59', agent: 'Agent-0x4F', score: 91, status: 'KILLED' },
    { id: 3, time: '11:41:57', agent: 'Agent-0x4F', score: 90, status: 'KILLED' },
    { id: 4, time: '11:30:15', agent: 'CodeGen-Alpha', score: 85, status: 'WATCHING' },
    { id: 5, time: '11:28:44', agent: 'Summary-Bot', score: 45, status: 'RESOLVED' },
    { id: 6, time: '10:15:02', agent: 'Agent-0x4F', score: 88, status: 'WATCHING' },
    { id: 7, time: '09:05:11', agent: 'Data-Sync', score: 12, status: 'RESOLVED' },
  ]);

  const sparklineData = [
    { val: 10 }, { val: 12 }, { val: 15 }, { val: 14 }, { val: 20 },
    { val: 22 }, { val: 40 }, { val: 35 }, { val: 50 }, { val: 80 }, { val: 92 }
  ];

  const heatmapAgents = ['Agent-A', 'Agent-B', 'Agent-C', 'Agent-D', 'Agent-E'];
  const heatmapData = Array.from({ length: 10 }).map((_, i) => ({
    req: `T-${10 - i}`,
    'Agent-A': Math.floor(Math.random() * 20),
    'Agent-B': i > 6 ? 90 + Math.random() * 10 : Math.floor(Math.random() * 30),
    'Agent-C': Math.floor(Math.random() * 40),
    'Agent-D': Math.floor(Math.random() * 10),
    'Agent-E': Math.floor(Math.random() * 50)
  }));

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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
          <div className="h-36 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl" />
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
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8" aria-label="Overview KPI Metrics">
        
        {/* KPI 1: Requests */}
        <div className="h-full backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
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
        <div className="h-full backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
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
        <div className="h-full backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
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
        <div className="h-full backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
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
        <div className="h-full backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md shadow-slate-100/50 dark:shadow-black/20 duration-300">
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

        {/* KPI 6: Agentic Loops Intercepted (Premium Pre-Crime Card) */}
        <div className="h-full backdrop-blur-md bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 p-6 rounded-2xl flex flex-col justify-between hover:border-rose-300 dark:hover:border-rose-800 hover:translate-y-[-2px] transition-all shadow-lg shadow-rose-100/50 dark:shadow-rose-900/20 duration-300 overflow-hidden relative isolate">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-400/20 rounded-full blur-3xl -mr-10 -mt-10 -z-10 pointer-events-none"></div>
          <div className="flex items-center justify-between gap-2 relative z-10">
            <span className="text-[11px] xl:text-xs uppercase tracking-widest text-rose-600 dark:text-rose-400 font-bold font-sans flex items-center gap-1.5 whitespace-nowrap">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              Intercepts
            </span>
            <span className="text-rose-600 dark:text-rose-400 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20"><ShieldAlert size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-6 relative z-10">
            <span className="font-mono text-3xl font-black text-rose-700 dark:text-rose-400 tracking-tighter leading-none drop-shadow-sm">
              {interceptedLoops}
            </span>
            <div className="flex flex-col items-end">
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                <Flame size={10} />
                <span>Blast Radius</span>
              </span>
              <span className="text-[9px] font-mono font-semibold text-rose-500 dark:text-rose-400/80 mt-1 uppercase tracking-wider">
                -{tokensSavedByPrecrime.toLocaleString()} Tkns
              </span>
            </div>
          </div>
        </div>

      </section>

      {/* --- NEW FEATURE: Agentic Loop Monitor --- */}
      <div className="flex items-center gap-2 mb-4 mt-8">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
        </span>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-sans tracking-tight">Agentic Loop Monitor</h2>
      </div>

      <section className="flex flex-col gap-8 mb-8" aria-label="Agentic Loop Monitor">
        <div className="flex flex-col xl:flex-row gap-8">
          
          {/* 1. Live Loop Detection Feed */}
          <div className="w-full xl:w-[60%] backdrop-blur-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-[350px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-mono text-slate-400 font-bold tracking-widest uppercase flex items-center gap-2">
                <Terminal size={14} className="text-slate-500" /> Live Feed
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">CONNECTED</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-1">
              {loopFeed.map((event, idx) => (
                <div 
                  key={event.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border border-transparent font-mono text-[11px] transition-all ${
                    event.status === 'KILLED' 
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-200' 
                      : event.status === 'WATCHING'
                        ? 'hover:bg-slate-800/50 text-amber-200/80'
                        : 'hover:bg-slate-800/50 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="opacity-50">[{event.time}]</span>
                    <span className={event.status === 'KILLED' ? 'text-rose-400 font-bold' : 'text-slate-300'}>{event.agent}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="opacity-70">Sim: {event.score}%</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider ${
                      event.status === 'KILLED' ? 'bg-rose-500 text-white' : 
                      event.status === 'WATCHING' ? 'bg-amber-500/20 text-amber-400' : 
                      'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Blast Radius Calculator */}
          <div className="w-full xl:w-[40%] backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl flex flex-col justify-between shadow-md shadow-slate-100/50 dark:shadow-black/20 h-[350px]">
            <h3 className="text-xs font-sans text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase mb-4 flex items-center gap-2">
              <ShieldAlert size={14} className="text-rose-500" /> Blast Radius Prevented
            </h3>
            
            <div className="mb-6">
              <span className="block text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-rose-500 drop-shadow-sm mb-1">
                $1,402.50
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estimated Financial Damage Saved</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mb-1">Loops Killed</span>
                <span className="text-lg font-mono font-bold text-rose-500">23</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mb-1">Tokens Blocked</span>
                <span className="text-lg font-mono font-bold text-emerald-500">103,500</span>
              </div>
            </div>
            
            <div className="mt-auto h-16 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line type="monotone" dataKey="val" stroke="#f43f5e" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] font-mono text-slate-400 uppercase mt-1 px-1">
                <span>24h Ago</span>
                <span className="text-rose-500 font-bold">Severity: Critical</span>
                <span>Now</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Agent Similarity Heatmap */}
        <div className="w-full backdrop-blur-md bg-white/70 dark:bg-slate-900/45 border border-slate-200/60 dark:border-slate-800/80 p-6 rounded-2xl shadow-md shadow-slate-100/50 dark:shadow-black/20 overflow-x-auto">
          <div className="flex items-center justify-between mb-6 min-w-[600px]">
            <h3 className="text-xs font-sans text-slate-500 dark:text-slate-400 font-bold tracking-widest uppercase flex items-center gap-2">
              <Activity size={14} className="text-indigo-500" /> Agent Similarity Heatmap (Last 10 Req)
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-slate-500"><div className="w-3 h-3 bg-slate-100 dark:bg-slate-800 rounded"></div> 0%</span>
              <span className="flex items-center gap-1 text-rose-300"><div className="w-3 h-3 bg-rose-500/40 rounded"></div> 50%</span>
              <span className="flex items-center gap-1 text-rose-500"><div className="w-3 h-3 bg-rose-600 rounded"></div> 90%+</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-1 min-w-[600px]">
            {heatmapAgents.map((agent) => (
              <div key={agent} className="flex items-center gap-2">
                <div className="w-20 text-[10px] font-mono text-slate-500 dark:text-slate-400 text-right pr-2 truncate">{agent}</div>
                <div className="flex-1 flex gap-1">
                  {heatmapData.map((d, i) => {
                    const score = d[agent as keyof typeof d] as number;
                    let bg = 'bg-slate-100 dark:bg-slate-800/50';
                    let text = 'text-transparent';
                    if (score > 90) { bg = 'bg-rose-600'; text = 'text-white'; }
                    else if (score > 70) { bg = 'bg-rose-500/70'; text = 'text-white/80'; }
                    else if (score > 40) { bg = 'bg-rose-500/40'; text = 'text-rose-900/50 dark:text-white/50'; }
                    else if (score > 10) { bg = 'bg-rose-500/20'; }
                    
                    return (
                      <div 
                        key={i} 
                        className={`flex-1 h-6 rounded flex items-center justify-center text-[8px] font-bold font-mono transition-colors cursor-crosshair group relative ${bg} ${text}`}
                      >
                        {score > 10 ? score : ''}
                        
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:block w-max bg-slate-800 text-white text-[10px] p-2 rounded shadow-xl z-50 pointer-events-none">
                          <div className="font-bold text-rose-400 mb-1">{agent} @ {d.req}</div>
                          <div>Similarity: {score}%</div>
                          <div>Hash: abc123x{i}</div>
                          <div className="mt-1 font-bold">Action: {score >= 90 ? 'KILLED' : 'PASS'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            
            <div className="flex items-center gap-2 mt-2">
              <div className="w-20"></div>
              <div className="flex-1 flex gap-1">
                {heatmapData.map((d, i) => (
                  <div key={i} className="flex-1 text-center text-[9px] font-mono text-slate-400 dark:text-slate-500">{d.req}</div>
                ))}
              </div>
            </div>
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
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 font-mono select-none">
                <th className="py-4 pl-8 pr-4 whitespace-nowrap">Timestamp</th>
                <th className="py-4 px-4 w-[25%]">Original Prompt</th>
                <th className="py-4 px-4 w-[35%]">Optimized Prompt</th>
                <th className="py-4 px-4 whitespace-nowrap text-right">Reduction (%)</th>
                <th className="py-4 px-4 whitespace-nowrap">Model Used</th>
                <th className="py-4 pl-4 pr-8 whitespace-nowrap text-right">Action</th>
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
                        <td className="py-5 pl-8 pr-4 text-xs text-slate-450 dark:text-slate-500 whitespace-nowrap font-mono">
                          {dateStr}
                        </td>

                        {/* Original Prompt preview - Clean elegant text */}
                        <td className="py-5 px-4">
                          <span className="text-xs font-sans font-normal text-slate-600 dark:text-slate-400 block truncate max-w-[200px] xl:max-w-xs" title={log.originalPrompt}>
                            {origPreview}
                          </span>
                        </td>

                        {/* Optimized Prompt preview - Clean elegant text */}
                        <td className="py-5 px-4">
                          <span className="text-xs font-sans font-medium text-slate-800 dark:text-slate-200 block truncate max-w-[250px] xl:max-w-sm" title={log.optimizedPrompt}>
                            {optPreview}
                          </span>
                        </td>

                        {/* Reduction statistics with pill badge and detailed token subtext */}
                        <td className="py-5 px-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end justify-center gap-1">
                            <span className={`inline-flex items-center justify-center min-w-[70px] whitespace-nowrap flex-shrink-0 text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                              {reductionPercent.toFixed(1)}% Saved
                            </span>
                            <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 tracking-wide whitespace-nowrap">
                              {original} → {optimized} tokens
                            </span>
                          </div>
                        </td>

                        {/* Model requested / used badge */}
                        <td className="py-5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center text-[10px] font-bold font-mono px-2.5 py-1 rounded-md border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400">
                            {log.modelUsed}
                          </span>
                        </td>

                        {/* Comparative diff action toggle - aligned pr-8 */}
                        <td className="py-5 pl-4 pr-8 text-right whitespace-nowrap">
                          <button 
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:text-indigo-300 dark:hover:bg-indigo-900/30 transition-all duration-200 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(log.id);
                            }}
                          >
                            <span>{isExpanded ? 'Hide' : 'Compare'}</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
