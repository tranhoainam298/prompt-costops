import React, { useState, useEffect } from 'react';
import { Settings, Send, Loader2, Sparkles, Bot, User, Key, Plus, MessageSquare, X, Clipboard, Check } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tokens_saved: number;
  compression_ratio: number;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface WalletStatus {
  gemini_bound: boolean;
  openai_bound: boolean;
  anthropic_bound: boolean;
}

const Playground: React.FC = () => {
  const [model, setModel] = useState<string>('gemini-2.5-flash');
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'chat' | 'optimizer'>('chat');

  // Chat History State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Chat State
  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usage, setUsage] = useState<CompletionUsage | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  
  const [bindProvider, setBindProvider] = useState<string>('gemini');
  const [apiKey, setApiKey] = useState<string>('');
  const [bindLoading, setBindLoading] = useState<boolean>(false);
  const [bindMessage, setBindMessage] = useState<{type: 'error'|'success', text: string} | null>(null);

  // Two-Panel Workspace State
  const [rawPrompt, setRawPrompt] = useState<string>('');
  const [optimizedPrompt, setOptimizedPrompt] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Telemetry State
  const [originalTokens, setOriginalTokens] = useState<number | null>(null);
  const [optimizedTokens, setOptimizedTokens] = useState<number | null>(null);
  const [savingsPercentage, setSavingsPercentage] = useState<number | null>(null);

  // Initial Fetch
  useEffect(() => {
    fetchConversations();
    fetchWalletStatus();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/v1/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWalletStatus = async () => {
    try {
      const res = await fetch('/v1/wallet/status');
      if (res.ok) {
        const data = await res.json();
        setWalletStatus(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setLoading(true);
    setUsage(null);
    try {
      const res = await fetch(`/v1/chat/conversations/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedMessages: ChatMessage[] = [];
        data.messages.forEach((msg: any) => {
          loadedMessages.push({ role: 'user', content: msg.original_prompt });
          loadedMessages.push({ role: 'assistant', content: `[Response historically delivered by ${msg.model_used}]` });
        });
        setMessages(loadedMessages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setUsage(null);
    setInput('');
    setRawPrompt('');
    setOptimizedPrompt('');
    setOriginalTokens(null);
    setOptimizedTokens(null);
    setSavingsPercentage(null);
  };

  const handleBindKey = async () => {
    if (!apiKey.trim()) return;
    setBindLoading(true);
    setBindMessage(null);
    try {
      const response = await fetch('/v1/wallet/bind-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: bindProvider, api_key: apiKey }),
      });
      if (response.ok) {
        setBindMessage({ type: 'success', text: 'API Key bound successfully' });
        setApiKey('');
        fetchWalletStatus(); // refresh badges
      } else {
        const errorData = await response.json();
        setBindMessage({ type: 'error', text: errorData?.detail || 'Binding failed' });
      }
    } catch (err) {
      setBindMessage({ type: 'error', text: 'Network error occurred' });
    } finally {
      setBindLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: currentInput }],
          session_id: activeSessionId
        }),
      });

      const sessionIdHeader = response.headers.get('X-CostOps-Session-Id');
      if (sessionIdHeader && sessionIdHeader !== activeSessionId) {
        setActiveSessionId(sessionIdHeader);
        fetchConversations();
      }

      if (response.ok) {
        const data = await response.json();
        const assistantContent: string =
          data.choices?.[0]?.message?.content ?? '';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent },
        ]);
        setUsage(data.usage ?? null);
      } else {
        let errorMessage = `Error ${response.status}: Request failed.`;
        try {
          const errorData = await response.json();
          errorMessage = errorData?.detail || errorData?.error?.message || errorMessage;
        } catch {}
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠️ ${errorMessage}` },
        ]);
      }
    } catch (error) {
      const networkError = error instanceof Error ? error.message : 'Unknown network error';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ Connection Error: ${networkError}` },
      ]);
      console.error('Completion request failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!rawPrompt.trim() || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const res = await fetch('/v1/prompt/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_prompt: rawPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        // Bind the structured response string gracefully to the right panel state
        setOptimizedPrompt(data.optimized_prompt || data.content || JSON.stringify(data, null, 2));
        setOriginalTokens(data.original_tokens ?? null);
        setOptimizedTokens(data.optimized_tokens ?? null);
        setSavingsPercentage(data.savings_percentage ?? null);
      } else {
        setOptimizedPrompt(`⚠️ Error ${res.status}: Optimization failed.`);
      }
    } catch (error) {
      setOptimizedPrompt(`⚠️ Network Error: ${error}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleCopy = async () => {
    if (!optimizedPrompt) return;
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const isBound = (provider: string) => {
    if (!walletStatus) return false;
    if (provider === 'gemini') return walletStatus.gemini_bound;
    if (provider === 'openai') return walletStatus.openai_bound;
    if (provider === 'anthropic') return walletStatus.anthropic_bound;
    return false;
  };

  return (
    <div className="flex w-full h-dvh bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* Left Workspace Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 p-3 flex flex-col h-full shrink-0 z-10">
        <button 
          onClick={handleNewChat}
          className="w-full py-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 mb-4 px-4 shadow-sm"
        >
          <Plus size={16} /> New Chat
        </button>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1 pb-4">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-2 px-2 pt-2">Recent</span>
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`text-left text-xs p-2 rounded-lg truncate text-pretty transition-colors duration-200 flex items-center gap-2 ${
                activeSessionId === s.id ? 'bg-slate-800 text-slate-200 font-medium' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-300'
              }`}
            >
              <MessageSquare size={14} className="shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-3 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open Platform Settings"
            className="w-10 h-10 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors duration-200"
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>

      {/* Main Console Sandbox */}
      <main className="flex-1 flex flex-col h-full relative" aria-label="Interactive Sandbox Console">
        {/* Header */}
        <header className="px-5 py-3 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles size={16} className="text-blue-400" />
            <h1 className="text-sm font-bold font-mono text-slate-300 uppercase tracking-widest">Interactive Console</h1>
            
            <select
              className="ml-4 bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono cursor-pointer transition-colors duration-200"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="claude-sonnet-4-20250514">claude-sonnet</option>
              <option value="deepseek-chat">deepseek-chat</option>
            </select>
          </div>
        </header>

        {/* Tab Switcher Container */}
        <div className="px-5 pt-4 bg-slate-950 shrink-0">
          <div className="bg-slate-900/60 p-1 rounded-xl flex border border-slate-800/60 w-fit">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'chat'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              💬 Live Agent Chat
            </button>
            <button
              onClick={() => setActiveTab('optimizer')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                activeTab === 'optimizer'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              ⚡ Prompt Optimizer Studio
            </button>
          </div>
        </div>

        {activeTab === 'chat' ? (
          /* =========================================
             TAB 1: LIVE AGENT CHAT
             ========================================= */
          <>
            {/* Messaging Stream */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
              {messages.length === 0 ? (
                <div className="m-auto text-center max-w-sm flex flex-col items-center gap-4 mt-32">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
                    <Bot size={32} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-200 font-mono uppercase tracking-wider">Console Sandbox</p>
                    <p className="text-xs text-slate-500 mt-2 text-pretty leading-relaxed">
                      Submit a prompt to test dynamic contextual compression. Output statistics will reflect real-time budget optimization.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-4 max-w-3xl ${
                      msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
                    }`}
                  >
                    <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${
                      msg.role === 'user' ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-950/40 border border-blue-900/30 text-blue-100 rounded-tr-sm'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 rounded-tl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-pretty">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Token Usage Badge Strip */}
            {usage && (
              <div className="px-5 py-2 border-t border-slate-800/50 bg-slate-900/50 flex flex-wrap gap-2" aria-label="Completion metadata stats">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 tabular-nums">
                  Prompt: {usage.prompt_tokens}
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 tabular-nums">
                  Completion: {usage.completion_tokens}
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-900/30 text-emerald-400 tabular-nums">
                  Saved: {usage.tokens_saved}
                </span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/30 border border-amber-900/30 text-amber-400 tabular-nums">
                  Saved Ratio: {(usage.compression_ratio * 100).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Code Input Form */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 shrink-0">
              <form 
                className="max-w-4xl mx-auto bg-slate-900 border border-slate-700 rounded-xl flex gap-2 items-end p-2 shadow-sm focus-within:ring-1 focus-within:ring-slate-600 transition-shadow duration-200"
                onSubmit={handleSubmit}
              >
                <textarea
                  className="flex-1 font-sans bg-transparent border-none p-2 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-0 resize-none min-h-[44px] max-h-[200px]"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message CostOps..."
                  disabled={loading}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="w-9 h-9 mb-0.5 mr-0.5 rounded-lg bg-slate-100 hover:bg-white text-slate-900 flex items-center justify-center transition-colors duration-200 shrink-0 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
                  disabled={loading || !input.trim()}
                  title="Send completion"
                  aria-label="Send completion"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
              <div className="text-center mt-2">
                <span className="text-[10px] text-slate-500 font-sans text-pretty">
                  CostOps can make mistakes. Consider verifying critical token optimizations.
                </span>
              </div>
            </div>
          </>
        ) : (
          /* =========================================
             TAB 2: PROMPT OPTIMIZER STUDIO
             ========================================= */
          <div className="flex-1 p-5 overflow-hidden flex flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
              
              {/* LEFT STUDIO PANEL */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between transition-all duration-200 hover:border-slate-700/60 overflow-hidden">
                <div className="flex flex-col flex-1 min-h-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 shrink-0">Input Raw Prompt</h2>
                  <textarea
                    className="w-full flex-1 bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-none font-sans text-sm text-pretty"
                    placeholder="Draft your raw instructions here..."
                    value={rawPrompt}
                    onChange={(e) => setRawPrompt(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between mt-4 shrink-0">
                  <div className="flex flex-col gap-1">
                    <span className="tabular-nums text-xs text-slate-400 font-medium font-mono">
                      Original Tokens: {originalTokens ?? '--'}
                    </span>
                    <span className="tabular-nums text-xs text-slate-400 font-medium font-mono">
                      Optimized Tokens: {optimizedTokens ?? '--'}
                    </span>
                    <span className="tabular-nums text-xs text-slate-400 font-medium font-mono">
                      Saved: {savingsPercentage !== null ? savingsPercentage.toFixed(1) : '--'}%
                    </span>
                  </div>
                  <button
                    onClick={handleOptimize}
                    disabled={isOptimizing || !rawPrompt.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-blue-800 text-white font-medium text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center gap-2"
                  >
                    {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : '⚡ Optimize & Structure Prompt'}
                  </button>
                </div>
              </div>

              {/* RIGHT EXPORTER PANEL */}
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl flex flex-col relative transition-all duration-200 overflow-hidden">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 shrink-0">Optimized Canonical Output</h2>
                
                <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                  {optimizedPrompt && (
                    <>
                      <button 
                        onClick={handleCopy}
                        aria-label="Copy optimized prompt to clipboard"
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all duration-200"
                      >
                        {isCopied ? <Check size={14} className="text-emerald-400" /> : <Clipboard size={14} />}
                      </button>
                      <button className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-medium text-xs px-3 py-1.5 rounded-lg transition-all">
                        🚀 Execute Live on Gemini
                      </button>
                    </>
                  )}
                </div>

                {!optimizedPrompt ? (
                  <div className="w-full flex-1 bg-slate-900/20 border border-slate-800/50 rounded-xl p-4 flex flex-col items-center justify-center text-slate-500 text-sm">
                    <Sparkles size={24} className="mb-3 opacity-20" />
                    <p>Awaiting prompt optimization...</p>
                  </div>
                ) : (
                  <div className="w-full flex-1 bg-slate-900/20 border border-slate-800/50 rounded-xl p-4 font-mono text-sm text-slate-300 overflow-y-auto whitespace-pre-wrap text-pretty break-words">
                    {optimizedPrompt}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="bg-slate-950 border border-slate-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col transform opacity-100 scale-100 transition-all duration-200">
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 id="settings-title" className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Settings size={16} className="text-slate-400" />
                Platform Settings
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-md transition-colors"
                aria-label="Close settings"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <Key size={14} className="text-amber-400" />
                    Upstream API Key
                  </h3>
                  {isBound(bindProvider) && (
                    <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 tabular-nums">
                      Bound Active
                    </span>
                  )}
                </div>
                
                <p className="text-xs text-slate-400 text-pretty">
                  Connect your personal API keys to run prompts against real models. Keys are encrypted symmetrically in the database.
                </p>

                <div className="flex flex-col gap-2 mt-2">
                  <select
                    className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded-md focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors duration-200"
                    value={bindProvider}
                    onChange={(e) => setBindProvider(e.target.value)}
                    aria-label="Select provider"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                  
                  <input
                    type="password"
                    placeholder="Paste API Key (sk-...)"
                    className="w-full font-mono bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    aria-label="Enter API Key"
                  />
                  
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={handleBindKey}
                      disabled={bindLoading || !apiKey.trim()}
                      className="flex-1 py-2 bg-slate-100 hover:bg-white text-slate-900 rounded-md text-xs font-bold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center h-9"
                    >
                      {bindLoading ? <Loader2 size={14} className="animate-spin" /> : 'Verify & Bind'}
                    </button>
                  </div>

                  {bindMessage && (
                    <div className={`text-[11px] p-2 rounded mt-2 font-mono ${bindMessage.type === 'error' ? 'bg-red-950/40 text-red-400 border border-red-900/50' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'}`}>
                      {bindMessage.text}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Playground;
