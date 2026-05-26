export type OpenPayErrorCode =
  | "PROVIDER_ERROR"
  | "INVALID_AMOUNT"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "WEBHOOK_REPLAY_DETECTED"
  | "ENTITLEMENT_STORE_ERROR"
  | "IDEMPOTENCY_CONFLICT";

export class OpenPayError extends Error {
  readonly code: OpenPayErrorCode;

  constructor(code: OpenPayErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "OpenPayError";
    this.code = code;
  }
}
