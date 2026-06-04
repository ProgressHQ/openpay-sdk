package openpay

import "fmt"

type ErrorCode string

const (
	ErrProviderError           ErrorCode = "PROVIDER_ERROR"
	ErrInvalidAmount           ErrorCode = "INVALID_AMOUNT"
	ErrWebhookSignatureInvalid ErrorCode = "WEBHOOK_SIGNATURE_INVALID"
	ErrWebhookReplayDetected   ErrorCode = "WEBHOOK_REPLAY_DETECTED"
	ErrEntitlementStoreError   ErrorCode = "ENTITLEMENT_STORE_ERROR"
	ErrIdempotencyConflict     ErrorCode = "IDEMPOTENCY_CONFLICT"
)

// Error is returned by all OpenPay operations.
type Error struct {
	Code    ErrorCode
	Message string
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("openpay %s: %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("openpay %s: %s", e.Code, e.Message)
}

func (e *Error) Unwrap() error { return e.Cause }

// NewError constructs an Error. cause is optional.
func NewError(code ErrorCode, msg string, cause ...error) *Error {
	var c error
	if len(cause) > 0 {
		c = cause[0]
	}
	return &Error{Code: code, Message: msg, Cause: c}
}
