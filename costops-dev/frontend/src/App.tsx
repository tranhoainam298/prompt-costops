import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Playground from './pages/Playground';
import History from './pages/History';
import TokenBar from './components/TokenBar';
import { useWallet } from './hooks/useWallet';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'playground' | 'history'>('dashboard');
  const { balance, loading, error } = useWallet();

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'playground':
        return <Playground />;
      case 'history':
        return <History />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">⚡</span>
          <span className="brand-name">CostOps</span>
          <span className="brand-tag">v0.1</span>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-link ${activeTab === 'playground' ? 'active' : ''}`}
            onClick={() => setActiveTab('playground')}
          >
            Playground
          </button>
          <button
            className={`nav-link ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Audit History
          </button>
        </nav>
      </header>

      <main className="app-main">
        {error && <div className="wallet-error-banner">{error}</div>}
        {balance && (
          <TokenBar
            used={balance.usedTokens}
            total={balance.monthlyBudget}
            saved={balance.savedTokens || 0}
            status={balance.status || 'green'}
          />
        )}
        {loading && !balance && (
          <div className="wallet-loading-spinner">Syncing wallet balance...</div>
        )}
        
        {renderActiveView()}
      </main>

      <footer className="app-footer">
        <p>CostOps Dev — AI Prompt Optimization & Cost Management Gateway</p>
      </footer>
    </div>
  );
};

export default App;
