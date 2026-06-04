package openpay

// PaymentStatus is the normalised payment status across all providers.
type PaymentStatus string

const (
	StatusCreated        PaymentStatus = "created"
	StatusPending        PaymentStatus = "pending"
	StatusRequiresAction PaymentStatus = "requires_action"
	StatusPaid           PaymentStatus = "paid"
	StatusFailed         PaymentStatus = "failed"
	StatusCancelled      PaymentStatus = "cancelled"
	StatusRefunded       PaymentStatus = "refunded"
)

// CreatePaymentInput is the input to Client.CreatePayment.
type CreatePaymentInput struct {
	Amount         Money
	Description    string
	CustomerID     string
	ResourceID     string
	IdempotencyKey string
	Metadata       map[string]string
}

// PaymentSession is returned by CreatePayment.
type PaymentSession struct {
	Provider    string
	PaymentID   string
	CheckoutURL string // redirect the user here to complete payment, if applicable
	Status      PaymentStatus
	Raw         any // raw provider response — for debugging only
}

// RefundResult is returned by Refunder.Refund.
type RefundResult struct {
	RefundID string
	Status   string // "pending" | "succeeded" | "failed"
	Amount   Money
}

// WebhookEvent is returned by WebhookVerifier.VerifyWebhook.
type WebhookEvent struct {
	Type           string // "payment.paid" | "payment.failed" | "payment.refunded"
	PaymentID      string
	Provider       string
	IdempotencyKey string
	Metadata       map[string]any
}
