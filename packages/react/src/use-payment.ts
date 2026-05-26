import { useState, useCallback } from "react";
import type { Money, PaymentSession } from "@openpay/core";

export interface UsePaymentOptions {
  /** Backend endpoint to POST to. Defaults to "/api/payments". */
  endpoint?: string;
}

export interface UsePaymentState {
  session: PaymentSession | null;
  loading: boolean;
  error: Error | null;
}

export interface UsePaymentActions {
  createPayment(params: {
    amount: Money;
    resourceId: string;
    description?: string;
  }): Promise<PaymentSession | null>;
  reset(): void;
}

export function usePayment(options: UsePaymentOptions = {}): UsePaymentState & UsePaymentActions {
  const endpoint = options.endpoint ?? "/api/payments";

  const [state, setState] = useState<UsePaymentState>({
    session: null,
    loading: false,
    error: null,
  });

  const createPayment = useCallback(
    async (params: { amount: Money; resourceId: string; description?: string }) => {
      setState({ session: null, loading: true, error: null });
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!res.ok) throw new Error(`Payment failed: ${res.statusText}`);
        const session = (await res.json()) as PaymentSession;
        setState({ session, loading: false, error: null });
        return session;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setState({ session: null, loading: false, error: e });
        return null;
      }
    },
    [endpoint]
  );

  const reset = useCallback(() => {
    setState({ session: null, loading: false, error: null });
  }, []);

  return { ...state, createPayment, reset };
}
