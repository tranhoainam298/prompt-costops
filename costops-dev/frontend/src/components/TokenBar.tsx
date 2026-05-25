import React from 'react';

interface TokenBarProps {
  used: number;
  total: number;
  saved: number;
  label?: string;
  status?: 'green' | 'yellow' | 'red';
}

const TokenBar: React.FC<TokenBarProps> = ({
  used,
  total,
  saved,
  label = 'Monthly Budget',
  status = 'green',
}) => {
  const usedPercent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const savedPercent = total > 0 ? Math.min((saved / total) * 100, 100) : 0;

  // Determine glowing color thumb styles
  const glowColor =
    status === 'red' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' :
    status === 'yellow' ? 'bg-amber-500 shadow-[0_0_10px_#f59e0b]' :
    'bg-blue-500 shadow-[0_0_10px_#3b82f6]';

  return (
    <div className="w-full bg-white dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-md dark:shadow-lg" aria-label="Token budget status bar">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-blue-650 dark:text-blue-400 font-bold">{usedPercent.toFixed(1)}%</span>
      </div>

      <div className="flex-1 relative w-full my-2 md:my-0">
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden flex">
          {/* Used bar progress */}
          <div
            className={`h-full transition-all duration-500 ${
              status === 'red' ? 'bg-red-500' : status === 'yellow' ? 'bg-amber-500' : 'bg-blue-500'
            }`}
            style={{ width: `${usedPercent}%` }}
          />
          {/* Saved bar progress overlay */}
          {saved > 0 && (
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(savedPercent, 100 - usedPercent)}%` }}
            />
          )}
        </div>
        {/* Sleek indicator glowing cursor thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full -translate-x-1/2 transition-all duration-500 ${glowColor}`}
          style={{ left: `${usedPercent}%` }}
        />
      </div>

      <div className="font-mono text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 justify-end">
        <span className="text-slate-800 dark:text-slate-200 font-bold">{used.toLocaleString()}</span>
        <span className="text-slate-400 dark:text-slate-650">/</span>
        <span>{total.toLocaleString()} tokens</span>
        {saved > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold ml-1.5">({saved.toLocaleString()} saved)</span>
        )}
      </div>
    </div>
  );
};

export default TokenBar;
