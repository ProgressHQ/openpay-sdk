import React, { useState } from "react";
import type { Money, PaymentSession } from "@openpay/core";

export interface PayButtonProps {
  amount: Money;
  resourceId: string;
  description?: string;
  /** Backend endpoint to POST to. Defaults to "/api/payments". */
  endpoint?: string;
  onSuccess?: (session: PaymentSession) => void;
  onError?: (error: Error) => void;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

type State = "idle" | "loading" | "redirecting" | "error";

export function PayButton({
  amount,
  resourceId,
  description,
  endpoint = "/api/payments",
  onSuccess,
  onError,
  className,
  disabled,
  children,
}: PayButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setState("loading");
    setErrorMessage(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, resourceId, description }),
      });

      if (!res.ok) throw new Error(`Payment request failed: ${res.statusText}`);

      const session = (await res.json()) as PaymentSession;

      if (session.checkoutUrl) {
        setState("redirecting");
        window.location.href = session.checkoutUrl;
      } else {
        setState("idle");
        onSuccess?.(session);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setState("error");
      setErrorMessage(e.message);
      onError?.(e);
    }
  };

  const label =
    state === "loading" ? "Processing…"
    : state === "redirecting" ? "Redirecting…"
    : state === "error" ? (errorMessage ?? "Error")
    : children ?? "Pay now";

  return (
    <button
      onClick={handleClick}
      disabled={disabled === true || state === "loading" || state === "redirecting"}
      className={className}
      aria-busy={state === "loading" || state === "redirecting"}
      aria-live="polite"
    >
      {label}
    </button>
  );
}
