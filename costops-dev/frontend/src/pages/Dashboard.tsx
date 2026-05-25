import React, { useEffect, useState } from 'react';
import UsageChart, { DailyUsageData } from '../components/UsageChart';
import LeakDiag from '../components/LeakDiag';
import { Activity, Cpu, PiggyBank, Percent, DollarSign, ArrowUpRight, TrendingDown } from 'lucide-react';

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
        const summaryResp = await fetch('/v1/usage/summary');
        if (summaryResp.ok) {
          const summaryData = await summaryResp.json();
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
    return (
      <div className="flex flex-col gap-8 animate-pulse w-full">
        <div>
          <div className="h-9 w-64 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg mb-2" />
          <div className="h-5 w-96 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="h-32 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-850 rounded-xl" />
          <div className="h-32 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-855 rounded-xl" />
          <div className="h-32 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-855 rounded-xl" />
          <div className="h-32 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-855 rounded-xl" />
          <div className="h-32 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-855 rounded-xl" />
        </div>
        <div className="h-[420px] bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-850 rounded-2xl p-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent select-none font-sans">
          CostOps Analytics
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-sans leading-relaxed">
          Real-time prompt compression insights, cumulative token savings, and active leak warnings.
        </p>
      </div>

      {/* Anomaly banner warnings alerts */}
      <LeakDiag />

      {/* Developer-focused Bento Grid of tight KPI Cards with theme-switching attributes */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-2" aria-label="Overview KPI Metrics">
        
        {/* KPI 1: Requests */}
        <div className="bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md dark:shadow-xl dark:shadow-black/10 duration-300">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">Total Requests</span>
            <span className="text-blue-500 dark:text-blue-400 bg-blue-500/10 p-1.5 rounded-lg border border-blue-500/10"><Activity size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">{summary.totalRequests.toLocaleString()}</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>8.2%</span>
            </span>
          </div>
        </div>

        {/* KPI 2: Tokens Spent */}
        <div className="bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md dark:shadow-xl dark:shadow-black/10 duration-300">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">Tokens Spent</span>
            <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 p-1.5 rounded-lg border border-indigo-500/10"><Cpu size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">{summary.totalTokens.toLocaleString()}</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>4.1%</span>
            </span>
          </div>
        </div>

        {/* KPI 3: Tokens Saved */}
        <div className="bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md dark:shadow-xl dark:shadow-black/10 duration-300">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">Tokens Saved</span>
            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/10"><PiggyBank size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-2">
            <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-450 tracking-tight leading-none">{summary.totalTokensSaved.toLocaleString()}</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>24.6%</span>
            </span>
          </div>
        </div>

        {/* KPI 4: Avg Compression */}
        <div className="bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md dark:shadow-xl dark:shadow-black/10 duration-300">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">Avg Compression</span>
            <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/10"><Percent size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              {(summary.averageCompressionRatio * 100).toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <ArrowUpRight size={10} />
              <span>1.8%</span>
            </span>
          </div>
        </div>

        {/* KPI 5: Est. Cost */}
        <div className="bg-slate-50/50 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200 dark:border-slate-800 p-6 rounded-xl flex flex-col justify-between hover:border-slate-400 dark:hover:border-slate-700 hover:translate-y-[-2px] transition-all shadow-md dark:shadow-xl dark:shadow-black/10 duration-300">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">Est. Cost</span>
            <span className="text-purple-600 dark:text-purple-400 bg-purple-500/10 p-1.5 rounded-lg border border-purple-500/10"><DollarSign size={14} /></span>
          </div>
          <div className="flex items-baseline justify-between gap-1.5 mt-2">
            <span className="font-mono text-2xl font-bold text-purple-600 dark:text-purple-400 tracking-tight leading-none">
              ${summary.estimatedCostUsd.toFixed(4)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <TrendingDown size={10} />
              <span>5.2%</span>
            </span>
          </div>
        </div>

      </section>

      {/* Historical Usage Graph */}
      <section className="bg-slate-50/20 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 mt-8 shadow-md dark:shadow-2xl flex flex-col gap-6 hover:border-slate-350 dark:hover:border-slate-700/80 transition-all duration-300">
        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-250 mb-1">Historical Optimization Savings vs Spent Cost</h3>
          <p className="text-xs text-slate-500 dark:text-slate-500 font-mono tracking-wide">
            Dual-axis tracker: Area represents optimized saved volume; Line tracks cumulative cost.
          </p>
        </div>
        <div className="w-full">
          <UsageChart data={dailyData} />
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
