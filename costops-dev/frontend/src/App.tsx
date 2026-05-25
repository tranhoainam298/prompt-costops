import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Playground from './pages/Playground';
import History from './pages/History';
import Teams from './pages/Teams';
import TokenBar from './components/TokenBar';
import { useWallet } from './hooks/useWallet';
import { Sun, Moon, Monitor, LayoutDashboard, Terminal, History as HistoryIcon, Zap, Users } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'playground' | 'history' | 'teams'>('dashboard');
  const { balance, loading, error } = useWallet();

  // Theme Sync hook supporting 'light' | 'dark' | 'system'
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('costops-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system'; // Default to system-defined theme
  });

  useEffect(() => {
    const root = document.documentElement;
    
    // Function to apply actual dark/light classes to the document element
    const applyTheme = (t: 'light' | 'dark') => {
      if (t === 'dark') {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      }
    };

    // Store preferred state in localStorage
    localStorage.setItem('costops-theme', theme);

    let cleanup = () => {};

    if (theme === 'system') {
      // Apply current system preference instantly
      const systemPref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemPref);

      // Listen for system configuration adjustments dynamically
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      cleanup = () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else {
      // Statically apply selected theme
      applyTheme(theme);
    }

    return cleanup;
  }, [theme]);

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'playground':
        return <Playground />;
      case 'history':
        return <History />;
      case 'teams':
        return <Teams />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col selection:bg-indigo-500/30 transition-colors duration-300">
      
      {/* Sleek Sticky Navbar in premium Glassmorphism */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-900 shadow-sm dark:shadow-lg dark:shadow-black/20 transition-colors duration-300">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3 select-none">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 shadow-inner">
            <Zap className="w-4 h-4 fill-indigo-500 text-indigo-500 animate-pulse" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-sans bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-350 bg-clip-text text-transparent">
              CostOps
            </span>
            <span className="text-[10px] font-mono font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-500 dark:text-indigo-400 px-1.5 py-0.2 rounded-full tracking-wider uppercase">
              v0.1
            </span>
          </div>
        </div>

        {/* Spacious, Beautifully Aligned Navigation Tabs */}
        <nav className="flex items-center gap-6" aria-label="Main Navigation">
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-all rounded-lg duration-200 cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700/50'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
            }`}
            onClick={() => setActiveTab('dashboard')}
            aria-label="View Dashboard"
          >
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </button>
          
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-all rounded-lg duration-200 cursor-pointer ${
              activeTab === 'playground'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700/50'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
            }`}
            onClick={() => setActiveTab('playground')}
            aria-label="Open Prompt Playground"
          >
            <Terminal size={15} />
            <span>Playground</span>
          </button>
          
          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-all rounded-lg duration-200 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700/50'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
            }`}
            onClick={() => setActiveTab('history')}
            aria-label="View Audit History"
          >
            <HistoryIcon size={15} />
            <span>Audit History</span>
          </button>

          <button
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium tracking-wide transition-all rounded-lg duration-200 cursor-pointer ${
              activeTab === 'teams'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700/50'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-900 border border-transparent'
            }`}
            onClick={() => setActiveTab('teams')}
            aria-label="Manage Workspace Teams"
          >
            <Users size={15} />
            <span>Workspace Teams</span>
          </button>
        </nav>

        {/* Global Premium Segmented Theme Controller: Light, Dark, System */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800/80 shadow-inner transition-colors duration-300">
            <button
              onClick={() => setTheme('light')}
              className={`p-1.5 rounded-md transition-all cursor-pointer duration-200 ${
                theme === 'light'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-sm border border-slate-200/50 dark:border-slate-700/30'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 hover:bg-slate-50/50 dark:hover:bg-slate-850/30'
              }`}
              title="Light Theme"
              aria-label="Switch to Light Theme"
            >
              <Sun size={14} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-md transition-all cursor-pointer duration-200 ${
                theme === 'dark'
                  ? 'bg-white dark:bg-slate-800 text-indigo-500 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-700/30'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 hover:bg-slate-50/50 dark:hover:bg-slate-850/30'
              }`}
              title="Dark Theme"
              aria-label="Switch to Dark Theme"
            >
              <Moon size={14} />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`p-1.5 rounded-md transition-all cursor-pointer duration-200 ${
                theme === 'system'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200/50 dark:border-slate-700/30'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 hover:bg-slate-50/50 dark:hover:bg-slate-850/30'
              }`}
              title="System Theme"
              aria-label="Switch to System Theme"
            >
              <Monitor size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Spacious Frame */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-8 py-8 flex flex-col gap-8 transition-colors duration-300">
        
        {/* Wallet Balance Alerts & Token Budget Bar */}
        {error && (
          <div className="w-full bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-650 dark:text-red-300 text-xs font-mono p-4 rounded-xl shadow-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>{error}</span>
          </div>
        )}
        
        {balance && (
          <div className="w-full">
            <TokenBar
              used={balance.usedTokens}
              total={balance.monthlyBudget}
              saved={balance.savedTokens || 0}
              status={balance.status || 'green'}
            />
          </div>
        )}
        
        {loading && !balance && (
          <div className="w-full flex items-center justify-center gap-3 text-xs font-mono text-slate-500 py-8 border border-dashed border-slate-200 dark:border-slate-900 rounded-2xl bg-slate-50/30 dark:bg-slate-950/40">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Syncing wallet telemetry & budget balance...</span>
          </div>
        )}
        
        {/* Active Content view */}
        <div className="w-full flex-1">
          {renderActiveView()}
        </div>
      </main>

      {/* Clean elegant Vercel footer */}
      <footer className="w-full border-t border-slate-200 dark:border-slate-900 py-8 px-8 flex justify-center items-center text-[11px] font-mono text-slate-500 dark:text-slate-650 bg-slate-50/30 dark:bg-slate-950/40 backdrop-blur-sm mt-auto select-none transition-colors duration-300">
        <p>© {new Date().getFullYear()} CostOps Dev — AI Prompt Optimization & Cost Management Gateway</p>
      </footer>
    </div>
  );
};

export default App;
