package openpay

import (
	"context"
	"errors"
)

// Client wraps a Provider with input validation and error normalisation.
type Client struct {
	provider Provider
}

// NewClient creates a Client backed by the given Provider.
func NewClient(provider Provider) *Client {
	return &Client{provider: provider}
}

// CreatePayment validates the input and delegates to the underlying Provider.
func (c *Client) CreatePayment(ctx context.Context, input CreatePaymentInput) (*PaymentSession, error) {
	if input.Amount.Amount < 0 {
		return nil, NewError(ErrInvalidAmount, "amount must be a non-negative integer")
	}
	session, err := c.provider.CreatePayment(ctx, input)
	if err != nil {
		var opErr *Error
		if errors.As(err, &opErr) {
			return nil, err
		}
		return nil, NewError(ErrProviderError, err.Error(), err)
	}
	return session, nil
}

// GetPaymentStatus returns the current status of a payment.
func (c *Client) GetPaymentStatus(ctx context.Context, paymentID string) (PaymentStatus, error) {
	return c.provider.GetPaymentStatus(ctx, paymentID)
}

// Refund initiates a refund. Returns ErrProviderError if the provider does not support refunds.
func (c *Client) Refund(ctx context.Context, paymentID string, amount *Money) (*RefundResult, error) {
	r, ok := c.provider.(Refunder)
	if !ok {
		return nil, NewError(ErrProviderError, c.provider.Name()+" does not support refunds")
	}
	return r.Refund(ctx, paymentID, amount)
}
