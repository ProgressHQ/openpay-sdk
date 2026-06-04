package mock

import (
	"context"
	"fmt"
	"sync"

	openpay "github.com/ProgressHQ/openpay-sdk/sdk-go"
)

// Provider is a deterministic in-memory provider for tests and demos.
type Provider struct {
	mu            sync.Mutex
	defaultStatus openpay.PaymentStatus
	statuses      map[string]openpay.PaymentStatus
	counter       int
}

// New creates a Provider. If defaultStatus is empty it defaults to StatusPaid.
func New(defaultStatus openpay.PaymentStatus) *Provider {
	if defaultStatus == "" {
		defaultStatus = openpay.StatusPaid
	}
	return &Provider{
		defaultStatus: defaultStatus,
		statuses:      make(map[string]openpay.PaymentStatus),
	}
}

func (p *Provider) Name() string { return "mock" }

func (p *Provider) CreatePayment(_ context.Context, input openpay.CreatePaymentInput) (*openpay.PaymentSession, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.counter++
	id := input.IdempotencyKey
	if id == "" {
		id = fmt.Sprintf("mock_%d", p.counter)
	}
	status := p.defaultStatus
	if s, ok := p.statuses[id]; ok {
		status = s
	}
	return &openpay.PaymentSession{
		Provider:  p.Name(),
		PaymentID: id,
		Status:    status,
	}, nil
}

func (p *Provider) GetPaymentStatus(_ context.Context, paymentID string) (openpay.PaymentStatus, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if s, ok := p.statuses[paymentID]; ok {
		return s, nil
	}
	return p.defaultStatus, nil
}

// SetStatus overrides the status returned for a specific payment.
func (p *Provider) SetStatus(paymentID string, status openpay.PaymentStatus) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.statuses[paymentID] = status
}

// Reset clears all overridden statuses and resets the counter.
func (p *Provider) Reset() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.statuses = make(map[string]openpay.PaymentStatus)
	p.counter = 0
}
