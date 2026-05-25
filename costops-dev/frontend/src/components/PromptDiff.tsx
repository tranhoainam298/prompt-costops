import React from 'react';

interface PromptDiffProps {
  original: string;
  optimized: string;
  compressionRatio: number;
  tokensSaved: number;
}

const PromptDiff: React.FC<PromptDiffProps> = ({
  original,
  optimized,
  compressionRatio,
  tokensSaved,
}) => {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/40 p-8 flex flex-col gap-6 shadow-md dark:shadow-inner">
      
      {/* Diff Header */}
      <div className="flex flex-wrap gap-4 items-center justify-between border-b border-slate-150 dark:border-slate-800/80 pb-4 mb-2">
        <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Semantic Prompt Optimization Diff
        </span>
        <div className="flex gap-2">
          <span className="inline-flex items-center text-[10px] font-bold font-mono px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">
            {(compressionRatio * 100).toFixed(1)}% compressed
          </span>
          <span className="inline-flex items-center text-[10px] font-bold font-mono px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400">
            {tokensSaved.toLocaleString()} tokens saved
          </span>
        </div>
      </div>

      {/* Side-by-Side Split panels with gap-8 and mb-6 bottom margin */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
        
        {/* Original prompt removed redundant content panel with p-8 pb-10 */}
        <div className="p-8 pb-10 bg-red-50/15 dark:bg-red-950/5 border border-red-150/40 dark:border-red-900/10 rounded-2xl text-xs font-mono overflow-x-auto shadow-inner">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-500 mb-6 select-none">
            Original Context (Removable syntax highlighted in red)
          </h4>
          <div className="space-y-4 leading-relaxed">
            <pre className="text-red-650 dark:text-red-400/90 whitespace-pre-wrap word-break-all select-all font-mono leading-relaxed">
              {original.split('\n').map((line, idx) => (
                <span key={idx} className="block hover:bg-red-500/5 dark:hover:bg-red-500/5 px-1 py-0.5 rounded-sm">
                  <span className="text-red-600 dark:text-red-655 opacity-40 select-none mr-2 font-bold">-</span>
                  {line}
                </span>
              ))}
            </pre>
          </div>
        </div>

        {/* Optimized prompt consolidated panel with p-8 pb-10 */}
        <div className="p-8 pb-10 bg-emerald-50/15 dark:bg-emerald-950/5 border border-emerald-150/40 dark:border-emerald-900/10 rounded-2xl text-xs font-mono overflow-x-auto shadow-inner">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-500 mb-6 select-none">
            Optimized Content (Consolidated prompt context in green)
          </h4>
          <div className="space-y-4 leading-relaxed">
            <pre className="text-emerald-650 dark:text-emerald-400/90 whitespace-pre-wrap word-break-all select-all font-mono leading-relaxed">
              {optimized.split('\n').map((line, idx) => (
                <span key={idx} className="block hover:bg-emerald-500/5 dark:hover:bg-emerald-500/5 px-1 py-0.5 rounded-sm">
                  <span className="text-emerald-600 dark:text-emerald-655 opacity-40 select-none mr-2 font-bold">+</span>
                  {line}
                </span>
              ))}
            </pre>
          </div>
        </div>

      </div>

    </div>
  );
};

export default PromptDiff;
