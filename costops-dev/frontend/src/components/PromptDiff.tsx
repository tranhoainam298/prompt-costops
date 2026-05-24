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
    <div className="prompt-diff">
      <div className="prompt-diff-header">
        <h3>Prompt Optimization Diff</h3>
        <div className="prompt-diff-stats">
          <span className="stat-badge stat-compression">
            {(compressionRatio * 100).toFixed(1)}% compressed
          </span>
          <span className="stat-badge stat-saved">
            {tokensSaved.toLocaleString()} tokens saved
          </span>
        </div>
      </div>

      <div className="prompt-diff-panels">
        <div className="prompt-diff-panel prompt-diff-original">
          <h4>Original</h4>
          <pre>{original}</pre>
        </div>
        <div className="prompt-diff-panel prompt-diff-optimized">
          <h4>Optimized</h4>
          <pre>{optimized}</pre>
        </div>
      </div>
    </div>
  );
};

export default PromptDiff;
