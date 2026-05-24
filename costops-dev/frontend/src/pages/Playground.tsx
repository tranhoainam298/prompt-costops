import React, { useState } from 'react';

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

const Playground: React.FC = () => {
  const [input, setInput] = useState<string>('');
  const [model, setModel] = useState<string>('gpt-4o');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usage, setUsage] = useState<CompletionUsage | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: input }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantContent: string =
          data.choices?.[0]?.message?.content ?? '';
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent },
        ]);
        setUsage(data.usage ?? null);
      }
    } catch (error) {
      console.error('Completion request failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="playground">
      <h1>Prompt Playground</h1>

      <div className="model-selector">
        <label htmlFor="model-select">Model:</label>
        <select
          id="model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="claude-sonnet-4-20250514">Claude Sonnet</option>
          <option value="deepseek-chat">DeepSeek Chat</option>
        </select>
      </div>

      <div className="messages-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <strong>{msg.role}:</strong>
            <p>{msg.content}</p>
          </div>
        ))}
      </div>

      {usage && (
        <div className="usage-panel">
          <span>Prompt: {usage.prompt_tokens}</span>
          <span>Completion: {usage.completion_tokens}</span>
          <span>Saved: {usage.tokens_saved}</span>
          <span>Compression: {(usage.compression_ratio * 100).toFixed(1)}%</span>
        </div>
      )}

      <form className="prompt-form" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter your prompt…"
          rows={4}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Optimizing…' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default Playground;
