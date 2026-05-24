import { useState, useEffect, useCallback, useRef } from 'react';

export interface WalletBalance {
  userId: string;
  balanceTokens: number;
  usedTokens: number;
  monthlyBudget: number;
  savedTokens?: number; // Optional premium field
  status?: 'green' | 'yellow' | 'red'; // Color transition status
}

interface UseWalletReturn {
  balance: WalletBalance | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  topUp: (amount: number) => Promise<void>;
}

const DEFAULT_BALANCE: WalletBalance = {
  userId: '',
  balanceTokens: 1_000_000,
  usedTokens: 0,
  monthlyBudget: 1_000_000,
  savedTokens: 0,
  status: 'green',
};

export function useWallet(): UseWalletReturn {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Dynamic WebSocket URL resolution for Nginx vs direct local dev proxy
  const getWsUrl = (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (window.location.port === '3000' || window.location.port === '5173') {
      return `${protocol}//localhost:8000/ws/quota`;
    }
    return `${protocol}//${window.location.host}/ws/quota`;
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setLoading(true);
    const wsUrl = getWsUrl();
    console.log(`Connecting to quota WebSocket: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Quota WebSocket connection established');
      setError(null);
      setLoading(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Map raw database attributes to camelCase
        const userId = data.userId || '';
        const usedTokens = data.usedTokens || 0;
        const balanceTokens = data.balanceTokens || 0;
        const monthlyBudget = data.monthlyBudget || 1_000_000;
        const savedTokens = data.savedTokens || 0;

        // Calculate visual transition color status (Green -> Yellow -> Red pulse)
        const usageRatio = monthlyBudget > 0 ? usedTokens / monthlyBudget : 0;
        let status: 'green' | 'yellow' | 'red' = 'green';
        if (usageRatio >= 0.85) {
          status = 'red';
        } else if (usageRatio >= 0.60) {
          status = 'yellow';
        }

        setBalance({
          userId,
          balanceTokens,
          usedTokens,
          monthlyBudget,
          savedTokens,
          status,
        });
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket connection error:', err);
      setError('Live quota sync disconnected. Attempting reconnect...');
      setLoading(false);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed. Retrying...');
      
      // Auto-reconnect with exponential backoff (max 30s)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
      reconnectAttemptsRef.current += 1;
      
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectWebSocket();
      }, delay);
    };
  }, []);

  const refresh = useCallback(() => {
    console.log('Manually triggering WebSocket connection reset...');
    connectWebSocket();
  }, [connectWebSocket]);

  const topUp = useCallback(async (amount: number): Promise<void> => {
    setError(null);
    try {
      const response = await fetch('/v1/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      
      // Update local state directly (the WS server will also broadcast an update)
      const used = data.used_tokens || 0;
      const budget = data.monthly_budget || 1_000_000;
      const usageRatio = budget > 0 ? used / budget : 0;
      let status: 'green' | 'yellow' | 'red' = 'green';
      if (usageRatio >= 0.85) {
        status = 'red';
      } else if (usageRatio >= 0.60) {
        status = 'yellow';
      }

      setBalance({
        userId: data.user_id || '',
        balanceTokens: data.balance_tokens || 0,
        usedTokens: used,
        monthlyBudget: budget,
        savedTokens: 0,
        status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Top-up failed';
      setError(message);
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        // Remove onclose listener first to avoid reconnect loops on clean unmount
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  return { balance, loading, error, refresh, topUp };
}

export default useWallet;
