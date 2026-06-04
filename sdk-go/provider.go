package openpay

import "context"

// Provider is the interface all payment adapters must implement.
type Provider interface {
	Name() string
	CreatePayment(ctx context.Context, input CreatePaymentInput) (*PaymentSession, error)
	GetPaymentStatus(ctx context.Context, paymentID string) (PaymentStatus, error)
}

// Refunder is implemented by providers that support refunds.
type Refunder interface {
	Refund(ctx context.Context, paymentID string, amount *Money) (*RefundResult, error)
}

// WebhookVerifier is implemented by providers that send signed webhooks.
// payload is the raw request body bytes.
type WebhookVerifier interface {
	VerifyWebhook(ctx context.Context, payload []byte, signature string) (*WebhookEvent, error)
}
