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
  label = 'Token Usage',
  status = 'green',
}) => {
  const usedPercent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const savedPercent = total > 0 ? Math.min((saved / total) * 100, 100) : 0;

  return (
    <div className={`token-bar token-bar-${status}`}>
      <div className="token-bar-header">
        <span className="token-bar-label">{label}</span>
        <span className="token-bar-stats">
          {used.toLocaleString()} / {total.toLocaleString()} tokens
          {saved > 0 && (
            <span className="token-bar-saved"> ({saved.toLocaleString()} saved)</span>
          )}
        </span>
      </div>
      <div className="token-bar-track">
        <div
          className={`token-bar-fill token-bar-fill-used token-bar-fill-${status}`}
          style={{ width: `${usedPercent}%` }}
        />
        <div
          className="token-bar-fill token-bar-fill-saved"
          style={{ width: `${savedPercent}%`, left: `${usedPercent}%` }}
        />
      </div>
    </div>
  );
};

export default TokenBar;
