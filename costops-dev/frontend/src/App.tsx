import React, { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Playground from './pages/Playground';
import TokenBar from './components/TokenBar';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'playground'>('dashboard');

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
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'dashboard' ? <Dashboard /> : <Playground />}
      </main>

      <footer className="app-footer">
        <p>CostOps Dev — AI Prompt Optimization & Cost Management Gateway</p>
      </footer>
    </div>
  );
};

export default App;
