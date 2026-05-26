import type { Request, Response, NextFunction } from "express";
import { OpenPayError } from "@openpay/core";
import type { PaymentProvider, WebhookEvent } from "@openpay/core";

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

export interface WebhookMiddlewareOptions {
  /** Header name that carries the provider signature. Defaults to "x-webhook-signature". */
  signatureHeader?: string;
}

/**
 * Mount with express.raw() before this middleware so req.body is a Buffer.
 *
 * Example:
 *   app.post("/webhooks/stripe", express.raw({ type: "application/json" }), webhookMiddleware(stripe, handler));
 */
export function webhookMiddleware(
  provider: PaymentProvider,
  handler: WebhookHandler,
  options: WebhookMiddlewareOptions = {}
) {
  const signatureHeader = options.signatureHeader ?? "x-webhook-signature";

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!provider.verifyWebhook) {
      next(new OpenPayError("PROVIDER_ERROR", `Provider ${provider.name} does not support webhooks`));
      return;
    }

    const signature = (req.headers[signatureHeader] ?? "") as string;

    try {
      const event = await provider.verifyWebhook(req.body as unknown, signature);
      await handler(event);
      res.status(200).json({ received: true });
    } catch (err) {
      if (err instanceof OpenPayError && err.code === "WEBHOOK_SIGNATURE_INVALID") {
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
      if (err instanceof OpenPayError && err.code === "WEBHOOK_REPLAY_DETECTED") {
        // Acknowledge replays silently so the provider stops retrying.
        res.status(200).json({ received: true, replayed: true });
        return;
      }
      next(err);
    }
  };
}
