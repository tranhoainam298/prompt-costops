import React, { useEffect, useState } from 'react';
import PromptDiff from '../components/PromptDiff';

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
    return <div className="dashboard-loading">Loading prompt history logs…</div>;
  }

  return (
    <div className="history-page">
      <h1>Prompt Optimization History Logs</h1>

      {logs.length === 0 ? (
        <div className="empty-history-fallback">
          <p>No prompt logs recorded yet. Try optimizing a prompt in the Playground!</p>
        </div>
      ) : (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Requested Model</th>
                <th>Used Model</th>
                <th>Input Tokens</th>
                <th>Compression Ratio</th>
                <th>Est. Cost</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const date = new Date(log.createdAt).toLocaleString();
                const isExpanded = expandedRowId === log.id;
                const tokensSaved = Math.max(log.originalTokens - log.optimizedTokens, 0);

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`history-row ${isExpanded ? 'row-expanded' : ''}`}
                      onClick={() => toggleRow(log.id)}
                    >
                      <td className="cell-date">{date}</td>
                      <td>
                        <span className="model-badge badge-requested">{log.modelRequested}</span>
                      </td>
                      <td>
                        <span className="model-badge badge-used">{log.modelUsed}</span>
                      </td>
                      <td className="cell-tokens">
                        {log.optimizedTokens.toLocaleString()}
                        <span className="tokens-saved-sub">
                          (-{tokensSaved.toLocaleString()})
                        </span>
                      </td>
                      <td className="cell-compression">
                        {(log.compressionRatio * 100).toFixed(1)}%
                      </td>
                      <td className="cell-cost">${log.estimatedCostUsd.toFixed(4)}</td>
                      <td className="cell-action">
                        <button className="expand-toggle-btn">
                          {isExpanded ? 'Hide Details ▲' : 'Show Details ▼'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="expander-row">
                        <td colSpan={7}>
                          <div className="expander-content-container">
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default History;
