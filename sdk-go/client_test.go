package openpay

import (
	"context"
	"errors"
	"testing"
)

type stubProvider struct {
	name   string
	status PaymentStatus
}

func (s *stubProvider) Name() string { return s.name }
func (s *stubProvider) CreatePayment(_ context.Context, input CreatePaymentInput) (*PaymentSession, error) {
	return &PaymentSession{Provider: s.name, PaymentID: "pay_1", Status: s.status}, nil
}
func (s *stubProvider) GetPaymentStatus(_ context.Context, _ string) (PaymentStatus, error) {
	return s.status, nil
}

func TestCreatePayment_NegativeAmount(t *testing.T) {
	c := NewClient(&stubProvider{name: "stub", status: StatusPaid})
	_, err := c.CreatePayment(context.Background(), CreatePaymentInput{
		Amount:      Money{Amount: -1, Currency: "EUR"},
		Description: "test",
	})
	var opErr *Error
	if !errors.As(err, &opErr) || opErr.Code != ErrInvalidAmount {
		t.Fatalf("expected ErrInvalidAmount, got %v", err)
	}
}

func TestCreatePayment_Delegates(t *testing.T) {
	c := NewClient(&stubProvider{name: "stub", status: StatusPaid})
	session, err := c.CreatePayment(context.Background(), CreatePaymentInput{
		Amount:      Money{Amount: 100, Currency: "EUR"},
		Description: "test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if session.Status != StatusPaid {
		t.Errorf("expected StatusPaid, got %q", session.Status)
	}
}

func TestRefund_ProviderNotSupported(t *testing.T) {
	c := NewClient(&stubProvider{name: "stub", status: StatusPaid})
	_, err := c.Refund(context.Background(), "pay_1", nil)
	var opErr *Error
	if !errors.As(err, &opErr) || opErr.Code != ErrProviderError {
		t.Fatalf("expected ErrProviderError, got %v", err)
	}
}
