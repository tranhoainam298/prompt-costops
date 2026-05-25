import React, { useState, useEffect } from 'react';
import { Settings, Send, Loader2, Sparkles, Bot, User, Key, Plus, MessageSquare, X, Clipboard, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
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
    if (!rawPrompt.trim() || isOptimizing || isGenerating) return;
    setIsOptimizing(true);
    setOptimizedPrompt('');
    try {
      const res = await fetch('/v1/prompt/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_prompt: rawPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("DEBUG API Response:", data);
        setOptimizedPrompt(data.optimized_prompt || "ERROR: BACKEND RETURNED EMPTY DATA");
        setOriginalTokens(data.original_tokens ?? null);
        setOptimizedTokens(data.optimized_tokens ?? null);
        setSavingsPercentage(data.savings_percentage ?? null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("GATEWAY ERROR DETAILS:", res.status, errorData);
        setOptimizedPrompt(`⚠️ Error ${res.status}: Optimization failed. Details: ${JSON.stringify(errorData)}`);
      }
    } catch (error: any) {
      console.error("GATEWAY ERROR 422 DETAILS:", error.response?.data || error.message);
      setOptimizedPrompt(`⚠️ Network Error: ${error}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!rawPrompt.trim() || isOptimizing || isGenerating) return;
    setIsGenerating(true);
    setOptimizedPrompt('');
    try {
      const res = await fetch('/v1/prompt/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_prompt: rawPrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setOptimizedPrompt(data.optimized_prompt || data.content || JSON.stringify(data, null, 2));
        setOriginalTokens(data.original_tokens ?? null);
        setOptimizedTokens(data.optimized_tokens ?? null);
        setSavingsPercentage(data.savings_percentage ?? null);
      } else {
        let errStr = `⚠️ Error ${res.status}: Generation failed.`;
        try {
          const errData = await res.json();
          if (errData.detail) errStr = `⚠️ Error: ${errData.detail}`;
        } catch {}
        setOptimizedPrompt(errStr);
      }
    } catch (error) {
      setOptimizedPrompt(`⚠️ Network Error: ${error}`);
    } finally {
      setIsGenerating(false);
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

  const renderStaggeredMarkdown = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="w-full flex-1 bg-slate-950/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 font-mono text-sm text-slate-300 overflow-y-auto whitespace-pre-wrap text-pretty break-words shadow-inner">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } }
          }}
        >
          {lines.map((line, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 150, damping: 25 } }
              }}
              className="min-h-[1.5em]" // ensure empty lines take up vertical space
            >
              {line}
            </motion.div>
          ))}
        </motion.div>
      </div>
    );
  };

  return (
    <div className="flex w-full h-dvh bg-[#030712] text-slate-100 overflow-hidden font-sans relative">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-150%) skewX(-20deg); }
          100% { transform: translateX(150%) skewX(-20deg); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
      
      {/* AMBIENT BACKGROUND */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div 
          animate={{ 
            opacity: [0.15, 0.35, 0.15],
            scale: [1, 1.05, 1],
            rotate: [0, 90, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/10 blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            opacity: [0.1, 0.25, 0.1],
            scale: [1, 1.1, 1],
            rotate: [0, -90, 0]
          }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute top-[40%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-emerald-500/10 blur-[120px]" 
        />
      </div>

      {/* Left Workspace Sidebar */}
      <aside className="w-64 bg-slate-950/80 backdrop-blur-xl border-r border-white/5 p-3 flex flex-col h-full shrink-0 z-20 shadow-2xl">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleNewChat}
          className="w-full py-2.5 bg-slate-900 border border-white/5 rounded-xl hover:bg-slate-800 hover:border-white/10 text-xs font-semibold tracking-wide transition-colors duration-200 flex items-center gap-2 mb-4 px-4 shadow-sm"
        >
          <Plus size={16} /> New Chat
        </motion.button>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1 pb-4">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-2 px-2 pt-2">Recent</span>
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`text-left text-xs p-2 rounded-lg truncate text-pretty transition-all duration-200 flex items-center gap-2 ${
                activeSessionId === s.id ? 'bg-slate-800 text-slate-200 font-medium border border-white/5' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-300 border border-transparent'
              }`}
            >
              <MessageSquare size={14} className="shrink-0" />
              <span className="truncate">{s.title}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open Platform Settings"
            className="w-10 h-10 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors duration-200"
          >
            <Settings size={20} />
          </motion.button>
        </div>
      </aside>

      {/* Main Console Sandbox */}
      <main className="flex-1 flex flex-col h-full relative z-10" aria-label="Interactive Sandbox Console">
        {/* Header */}
        <header className="px-6 py-4 border-b border-white/5 bg-slate-950/60 backdrop-blur-2xl flex justify-between items-center z-20 shrink-0 shadow-lg">
          <div className="flex items-center gap-3">
            <Sparkles size={16} className="text-blue-400" />
            <h1 className="text-sm font-bold font-mono text-slate-300 uppercase tracking-widest">Interactive Console</h1>
            
            <select
              className="ml-4 bg-slate-900 border border-white/5 text-slate-300 text-xs px-3 py-1.5 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono cursor-pointer transition-colors duration-200 shadow-inner"
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

        {/* Animated Tab Switcher Container */}
        <div className="px-6 pt-6 bg-transparent shrink-0">
          <div className="bg-slate-900/40 backdrop-blur-xl p-1.5 rounded-2xl flex border border-white/5 w-fit shadow-xl shadow-black/40">
            {['chat', 'optimizer'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as 'chat' | 'optimizer')}
                className="relative px-5 py-2 text-xs font-bold rounded-xl transition-colors duration-200"
              >
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTabPill"
                    className="absolute inset-0 bg-slate-800 border border-white/10 rounded-xl shadow-md"
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  />
                )}
                <span className={`relative z-10 ${activeTab === tab ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>
                  {tab === 'chat' ? '💬 Live Agent Chat' : '⚡ Prompt Optimizer Studio'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            /* =========================================
               TAB 1: LIVE AGENT CHAT
               ========================================= */
            <motion.div 
              key="chat-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="flex-1 overflow-hidden flex flex-col relative z-10"
            >
              {/* Messaging Stream */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                {messages.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.1 }}
                    className="m-auto text-center max-w-sm flex flex-col items-center gap-4 mt-32"
                  >
                    <div className="w-16 h-16 rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                      <Bot size={32} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-200 font-mono uppercase tracking-wider">Console Sandbox</p>
                      <p className="text-xs text-slate-500 mt-2 text-pretty leading-relaxed">
                        Submit a prompt to test dynamic contextual compression. Output statistics will reflect real-time budget optimization.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 150, damping: 20 }}
                      key={idx}
                      className={`flex gap-4 max-w-3xl ${
                        msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'
                      }`}
                    >
                      <div className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center shadow-lg border border-white/5 ${
                        msg.role === 'user' ? 'bg-blue-600/20 backdrop-blur-md text-blue-300' : 'bg-slate-800/60 backdrop-blur-md text-slate-300'
                      }`}>
                        {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                      </div>
                      <div
                        className={`px-5 py-4 rounded-3xl text-sm leading-relaxed shadow-xl backdrop-blur-xl border border-white/5 ${
                          msg.role === 'user'
                            ? 'bg-blue-900/30 text-blue-100 rounded-tr-sm'
                            : 'bg-slate-900/40 text-slate-200 rounded-tl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-pretty">{msg.content}</p>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Token Usage Badge Strip */}
              <AnimatePresence>
                {usage && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-6 py-3 border-t border-white/5 bg-slate-900/30 backdrop-blur-xl flex flex-wrap gap-3 overflow-hidden" 
                    aria-label="Completion metadata stats"
                  >
                    <span className="font-mono text-[10px] font-bold px-3 py-1 rounded-lg bg-slate-950/80 border border-white/5 text-slate-400 tabular-nums shadow-inner">
                      Prompt: {usage.prompt_tokens}
                    </span>
                    <span className="font-mono text-[10px] font-bold px-3 py-1 rounded-lg bg-slate-950/80 border border-white/5 text-slate-400 tabular-nums shadow-inner">
                      Completion: {usage.completion_tokens}
                    </span>
                    <span className="font-mono text-[10px] font-bold px-3 py-1 rounded-lg bg-emerald-950/30 border border-emerald-900/30 text-emerald-400 tabular-nums shadow-inner">
                      Saved: {usage.tokens_saved}
                    </span>
                    <span className="font-mono text-[10px] font-bold px-3 py-1 rounded-lg bg-amber-950/30 border border-amber-900/30 text-amber-400 tabular-nums shadow-inner">
                      Saved Ratio: {(usage.compression_ratio * 100).toFixed(1)}%
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Code Input Form */}
              <div className="p-6 bg-slate-950/60 backdrop-blur-2xl border-t border-white/5 shrink-0 z-20">
                <form 
                  className="max-w-4xl mx-auto bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl flex gap-2 items-end p-2 shadow-2xl focus-within:ring-2 focus-within:ring-slate-700/50 transition-all duration-300"
                  onSubmit={handleSubmit}
                >
                  <textarea
                    className="flex-1 font-sans bg-transparent border-none p-3 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-0 resize-none min-h-[50px] max-h-[250px]"
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
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="w-11 h-11 mb-1 mr-1 rounded-xl bg-slate-100 hover:bg-white text-slate-900 flex items-center justify-center transition-colors duration-200 shrink-0 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed shadow-lg"
                    disabled={loading || !input.trim()}
                    title="Send completion"
                    aria-label="Send completion"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </motion.button>
                </form>
                <div className="text-center mt-3">
                  <span className="text-[10px] text-slate-500 font-sans text-pretty">
                    CostOps can make mistakes. Consider verifying critical token optimizations.
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            /* =========================================
               TAB 2: PROMPT OPTIMIZER STUDIO
               ========================================= */
            <motion.div 
              key="optimizer-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="flex-1 p-6 overflow-hidden flex flex-col relative z-10"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                
                {/* LEFT STUDIO PANEL (PREMIUM GLASS) */}
                <div className="bg-slate-900/30 backdrop-blur-2xl border border-white/[0.06] shadow-2xl shadow-black/60 p-6 rounded-3xl flex flex-col justify-between transition-all duration-300 hover:border-white/10 overflow-hidden relative">
                  <div className="flex flex-col flex-1 min-h-0">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 shrink-0 flex items-center gap-2">
                      <Sparkles size={14} className="text-blue-400" />
                      Input Raw Prompt
                    </h2>
                    <textarea
                      className="w-full flex-1 bg-slate-950/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 resize-none font-sans text-sm text-pretty shadow-inner"
                      placeholder="Draft your raw instructions here..."
                      value={rawPrompt}
                      onChange={(e) => setRawPrompt(e.target.value)}
                    />
                  </div>
                  
                  <div className="mt-6 shrink-0 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleOptimize}
                        disabled={isOptimizing || isGenerating || !rawPrompt.trim()}
                        className="w-full bg-slate-800/80 hover:bg-slate-700 text-white border border-white/10 px-5 py-3 rounded-xl transition-all text-sm font-medium shadow-md flex justify-center items-center gap-2"
                      >
                        {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : '⚡ Optimize Prompt'}
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleGenerate}
                        disabled={isOptimizing || isGenerating || !rawPrompt.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30 px-5 py-3 rounded-xl transition-all text-sm font-medium shadow-[0_0_20px_rgba(79,70,229,0.3)] flex justify-center items-center gap-2"
                      >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : '✨ Generate Master Prompt'}
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* RIGHT EXPORTER PANEL (PREMIUM GLASS) */}
                <div className="bg-slate-900/30 backdrop-blur-2xl border border-white/[0.06] shadow-2xl shadow-black/60 p-6 rounded-3xl flex flex-col relative transition-all duration-300 hover:border-white/10 overflow-hidden">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 shrink-0">Optimized Canonical Output</h2>
                  
                  <div className="absolute top-6 right-6 flex items-center gap-3 z-20">
                    <AnimatePresence>
                      {optimizedPrompt && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: "spring", stiffness: 200, damping: 20 }}
                          className="flex items-center gap-3"
                        >
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleCopy}
                            aria-label="Copy optimized prompt to clipboard"
                            className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-800/80 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white hover:border-slate-400/50 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-300"
                          >
                            {isCopied ? <Check size={14} className="text-emerald-400" /> : <Clipboard size={14} />}
                          </motion.button>
                          <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="bg-emerald-600/10 backdrop-blur-md text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/20 hover:border-emerald-400/60 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)] font-bold text-xs px-4 py-2 rounded-xl transition-all duration-300"
                          >
                            🚀 Execute Live on Gemini
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {!optimizedPrompt ? (
                    <div className="w-full flex-1 bg-slate-950/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-500 text-sm shadow-inner">
                      <motion.div
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Sparkles size={28} className="mb-4 opacity-20" />
                      </motion.div>
                      <p className="font-medium tracking-wide">Awaiting prompt processing...</p>
                    </div>
                  ) : (
                    <textarea
                      className="w-full flex-1 bg-slate-950/40 backdrop-blur-md border border-white/5 rounded-2xl p-5 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 resize-none font-sans text-sm text-pretty shadow-inner"
                      placeholder="Optimized prompt output..."
                      value={optimizedPrompt}
                      onChange={(e) => setOptimizedPrompt(e.target.value)}
                    />
                  )}

                  <div className="mt-4 shrink-0 flex items-center justify-between">
                    <div className="flex gap-4">
                      <span className="tabular-nums text-xs text-slate-400 font-medium font-mono drop-shadow-md">
                        Original: <span className="text-slate-200">{originalTokens ?? '--'}</span>
                      </span>
                      <span className="tabular-nums text-xs text-slate-400 font-medium font-mono drop-shadow-md">
                        Generated: <span className="text-blue-300">{optimizedTokens ?? '--'}</span>
                      </span>
                      <span className="tabular-nums text-xs text-slate-400 font-medium font-mono drop-shadow-md">
                        Saved: <span className="text-emerald-400">{savingsPercentage !== null ? savingsPercentage.toFixed(1) : '--'}%</span>
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" 
            role="dialog" 
            aria-modal="true" 
            aria-labelledby="settings-title"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-6 py-5 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
                <h2 id="settings-title" className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Settings size={16} className="text-slate-400" />
                  Platform Settings
                </h2>
                <motion.button 
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors"
                  aria-label="Close settings"
                >
                  <X size={16} />
                </motion.button>
              </div>
              
              <div className="p-6 flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                      <Key size={14} className="text-amber-400" />
                      Upstream API Key
                    </h3>
                    {isBound(bindProvider) && (
                      <span className="px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 tabular-nums">
                        Bound Active
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-slate-400 text-pretty leading-relaxed">
                    Connect your personal API keys to run prompts against real models. Keys are encrypted symmetrically in the database.
                  </p>

                  <div className="flex flex-col gap-3 mt-2">
                    <select
                      className="w-full bg-slate-900/60 backdrop-blur-md border border-white/10 text-slate-200 text-sm px-4 py-2.5 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors duration-200"
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
                      className="w-full font-mono bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      aria-label="Enter API Key"
                    />
                    
                    <div className="flex items-center gap-2 mt-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleBindKey}
                        disabled={bindLoading || !apiKey.trim()}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-white text-slate-900 rounded-xl text-xs font-bold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center h-10 shadow-md"
                      >
                        {bindLoading ? <Loader2 size={14} className="animate-spin" /> : 'Verify & Bind'}
                      </motion.button>
                    </div>

                    <AnimatePresence>
                      {bindMessage && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className={`text-[11px] p-3 rounded-xl mt-2 font-mono ${bindMessage.type === 'error' ? 'bg-red-950/40 text-red-400 border border-red-900/50' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'}`}
                        >
                          {bindMessage.text}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Playground;
