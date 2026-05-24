import { useState, useEffect, useCallback } from 'react';

interface WalletBalance {
  userId: string;
  balanceTokens: number;
  usedTokens: number;
  monthlyBudget: number;
}

interface UseWalletReturn {
  balance: WalletBalance | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  topUp: (amount: number) => Promise<void>;
}

const DEFAULT_BALANCE: WalletBalance = {
  userId: '',
  balanceTokens: 0,
  usedTokens: 0,
  monthlyBudget: 1_000_000,
};

export function useWallet(): UseWalletReturn {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/v1/wallet/balance');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data: WalletBalance = await response.json();
      setBalance(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setBalance(DEFAULT_BALANCE);
    } finally {
      setLoading(false);
    }
  }, []);

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
      const data: WalletBalance = await response.json();
      setBalance(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Top-up failed';
      setError(message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, error, refresh, topUp };
}

export default useWallet;
