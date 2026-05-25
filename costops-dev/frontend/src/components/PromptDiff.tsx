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
    <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 shadow-inner">
      
      {/* Diff Header */}
      <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex flex-wrap gap-2 items-center justify-between">
        <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Semantic Prompt Optimization Diff
        </span>
        <div className="flex gap-2">
          <span className="inline-flex items-center text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-emerald-900/50 bg-emerald-950/20 text-emerald-400">
            {(compressionRatio * 100).toFixed(1)}% compressed
          </span>
          <span className="inline-flex items-center text-[10px] font-bold font-mono px-2 py-0.5 rounded border border-amber-900/50 bg-amber-950/20 text-amber-400">
            {tokensSaved.toLocaleString()} tokens saved
          </span>
        </div>
      </div>

      {/* Side-by-Side Split Mono panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        
        {/* Original prompt removed redundant content panel */}
        <div className="p-4 bg-red-950/5 text-xs font-mono overflow-x-auto leading-relaxed">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5 select-none">
            Original Context (Removable syntax highlighted in red)
          </h4>
          <pre className="text-red-400/90 whitespace-pre-wrap word-break-all select-all font-mono">
            {original.split('\n').map((line, idx) => (
              <span key={idx} className="block hover:bg-red-500/5 px-1 rounded-sm">
                <span className="text-red-650 opacity-40 select-none mr-2 font-bold">-</span>
                {line}
              </span>
            ))}
          </pre>
        </div>

        {/* Optimized prompt consolidated panel */}
        <div className="p-4 bg-emerald-950/5 text-xs font-mono overflow-x-auto leading-relaxed">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2.5 select-none">
            Optimized Content (Consolidated prompt context in green)
          </h4>
          <pre className="text-emerald-400/90 whitespace-pre-wrap word-break-all select-all font-mono">
            {optimized.split('\n').map((line, idx) => (
              <span key={idx} className="block hover:bg-emerald-500/5 px-1 rounded-sm">
                <span className="text-emerald-650 opacity-40 select-none mr-2 font-bold">+</span>
                {line}
              </span>
            ))}
          </pre>
        </div>

      </div>

    </div>
  );
};

export default PromptDiff;
