import React, { useEffect, useState } from 'react';
import PromptDiff from '../components/PromptDiff';
import { FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';

export interface HistoryLogItem {
  id: string;
  createdAt: string;
  modelRequested: string;
  modelUsed: string;
  originalTokens: number;
  optimizedTokens: number;
  compressionRatio: number;
  estimatedCostUsd: number;
  originalPrompt: string;
  optimizedPrompt: string;
}

export const History: React.FC = () => {
  const [logs, setLogs] = useState<HistoryLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const fetchHistory = async (): Promise<void> => {
    try {
      const response = await fetch('/v1/usage/history');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to retrieve prompt history logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const toggleRow = (id: string): void => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse w-full">
        <div>
          <div className="h-9 w-64 bg-slate-900 border border-slate-800 rounded mb-2" />
          <div className="h-5 w-[420px] bg-slate-900 border border-slate-800 rounded" />
        </div>
        <div className="h-64 bg-slate-900/50 border border-slate-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
          Prompt Optimization History Logs
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Historical registry of optimization requests, estimated cost metrics, and differential prompt audits.
        </p>
      </div>

      {/* Structured developer-grade dense table wrapper */}
      <div className="w-full bg-white dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-lg dark:shadow-2xl">
        <table className="w-full text-sm text-left border-collapse">
          
          {/* Dense Headers Enforcing uppercase monospace */}
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-bold tracking-widest text-slate-555 dark:text-slate-400 font-mono">
              <th className="py-3.5 px-5 select-none">Request ID</th>
              <th className="py-3.5 px-5 select-none">Timestamp</th>
              <th className="py-3.5 px-5 select-none">Model</th>
              <th className="py-3.5 px-5 select-none text-right">Original Tokens</th>
              <th className="py-3.5 px-5 select-none text-right">Compressed Tokens</th>
              <th className="py-3.5 px-5 select-none text-right">Saved (%)</th>
              <th className="py-3.5 px-5 select-none text-right">Est. Cost</th>
              <th className="py-3.5 px-5 select-none text-center">Action</th>
            </tr>
          </thead>

          <tbody>
            {logs.length === 0 ? (
              
              /* Elegant empty-state rendered inside the table body shell */
              <tr>
                <td colSpan={8} className="py-16 text-center text-slate-400 dark:text-slate-500 font-mono">
                  <div className="flex flex-col items-center gap-3 justify-center">
                    <FileSpreadsheet size={32} className="text-slate-300 dark:text-slate-700 animate-pulse-glow" />
                    <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 font-bold">No Audit Logs Recorded</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs leading-normal">
                      Historical optimization logs will appear here once executions are submitted in the Playground.
                    </span>
                  </div>
                </td>
              </tr>

            ) : (
              logs.map((log) => {
                const date = new Date(log.createdAt).toLocaleString();
                const isExpanded = expandedRowId === log.id;
                const tokensSaved = Math.max(log.originalTokens - log.optimizedTokens, 0);

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`border-b border-slate-150 dark:border-slate-800/80 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors duration-150 ${
                        isExpanded ? 'bg-indigo-50/50 dark:bg-indigo-950/10' : ''
                      }`}
                      onClick={() => toggleRow(log.id)}
                    >
                      
                      {/* Compact Monospace Request ID */}
                      <td className="py-3.5 px-5 font-mono text-xs text-blue-600 dark:text-blue-400 font-bold">
                        {log.id.slice(0, 8)}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {date}
                      </td>

                      {/* Model with Semantic Badges */}
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400">
                          {log.modelUsed}
                        </span>
                      </td>

                      {/* Original Tokens */}
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-600 dark:text-slate-300 text-right">
                        {log.originalTokens.toLocaleString()}
                      </td>

                      {/* Compressed Tokens */}
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-800 dark:text-slate-200 font-semibold text-right">
                        {log.optimizedTokens.toLocaleString()}
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 ml-1 font-semibold">
                          (-{tokensSaved.toLocaleString()})
                        </span>
                      </td>

                      {/* Saved (%) */}
                      <td className="py-3.5 px-5 font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold text-right">
                        {(log.compressionRatio * 100).toFixed(1)}%
                      </td>

                      {/* Est. Cost */}
                      <td className="py-3.5 px-5 font-mono text-xs text-purple-600 dark:text-purple-400 font-bold text-right">
                        ${log.estimatedCostUsd.toFixed(4)}
                      </td>

                      {/* Action toggle trigger */}
                      <td className="py-3.5 px-5 text-center">
                        <button className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-700/80 px-2.5 py-1 rounded transition-colors">
                          <span>{isExpanded ? 'Hide' : 'View'}</span>
                          {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                      </td>

                    </tr>

                    {/* Expandable row content */}
                    {isExpanded && (
                      <tr className="bg-slate-50/50 dark:bg-slate-950/40">
                        <td colSpan={8} className="p-5 border-b border-slate-150 dark:border-slate-800">
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
    </div>
  );
};

export default History;
