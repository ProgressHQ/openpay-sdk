package taler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"

	openpay "github.com/ProgressHQ/openpay-sdk/sdk-go"
)

// Config holds the configuration for the Taler Merchant Backend.
type Config struct {
	// MerchantBackendURL is the base URL, e.g. "https://backend.demo.taler.net".
	MerchantBackendURL string
	// Instance is the merchant instance name, e.g. "default".
	Instance string
	// APIKey is used for all authenticated calls.
	APIKey string
	// FulfillmentBaseURL is where users land after completing or abandoning payment.
	FulfillmentBaseURL string
	// WebhookSecret is the optional HMAC-SHA512 signing secret.
	// When set, VerifyWebhook checks HMAC-SHA512 before proceeding.
	// When omitted, authenticity relies solely on the authenticated re-fetch.
	WebhookSecret string
}

// Provider implements openpay.Provider for the GNU Taler Merchant Backend.
type Provider struct {
	config Config
	client *http.Client
}

// New creates a Provider with the given Config.
func New(config Config) *Provider {
	return &Provider{config: config, client: &http.Client{}}
}

func (p *Provider) Name() string { return "taler" }

func (p *Provider) base() string {
	return fmt.Sprintf("%s/instances/%s/private", p.config.MerchantBackendURL, p.config.Instance)
}

func (p *Provider) doJSON(ctx context.Context, method, url string, body, out any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return openpay.NewError(openpay.ErrProviderError, "failed to marshal request body", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return openpay.NewError(openpay.ErrProviderError, "failed to build request", err)
	}
	req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return openpay.NewError(openpay.ErrProviderError, "could not reach Taler merchant backend", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return openpay.NewError(openpay.ErrProviderError, fmt.Sprintf("Taler responded %d: %s", resp.StatusCode, string(b)))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// toTalerAmount converts a Money value to Taler wire format: "EUR:0.10".
func toTalerAmount(m openpay.Money) string {
	exp := openpay.CurrencyExponent(m.Currency)
	if exp == 0 {
		return fmt.Sprintf("%s:%d", m.Currency, m.Amount)
	}
	decimal := float64(m.Amount) / math.Pow10(exp)
	return fmt.Sprintf("%s:%.*f", m.Currency, exp, decimal)
}

func mapStatus(talerStatus string) openpay.PaymentStatus {
	switch talerStatus {
	case "paid":
		return openpay.StatusPaid
	case "unpaid":
		return openpay.StatusPending
	case "claimed":
		return openpay.StatusRequiresAction
	default:
		return openpay.StatusPending
	}
}

type orderResponse struct {
	OrderStatus string `json:"order_status"`
	TalerPayURI string `json:"taler_pay_uri"`
}

func (p *Provider) CreatePayment(ctx context.Context, input openpay.CreatePaymentInput) (*openpay.PaymentSession, error) {
	body := map[string]any{
		"amount":          toTalerAmount(input.Amount),
		"summary":         input.Description,
		"fulfillment_url": p.config.FulfillmentBaseURL + "/payment/complete",
	}
	if input.IdempotencyKey != "" {
		body["order_id"] = input.IdempotencyKey
	}

	var created struct {
		OrderID string `json:"order_id"`
	}
	if err := p.doJSON(ctx, http.MethodPost, p.base()+"/orders", body, &created); err != nil {
		return nil, err
	}

	var order orderResponse
	if err := p.doJSON(ctx, http.MethodGet, p.base()+"/orders/"+created.OrderID, nil, &order); err != nil {
		return nil, err
	}

	return &openpay.PaymentSession{
		Provider:    p.Name(),
		PaymentID:   created.OrderID,
		CheckoutURL: order.TalerPayURI,
		Status:      mapStatus(order.OrderStatus),
		Raw:         order,
	}, nil
}

func (p *Provider) GetPaymentStatus(ctx context.Context, paymentID string) (openpay.PaymentStatus, error) {
	var order orderResponse
	if err := p.doJSON(ctx, http.MethodGet, p.base()+"/orders/"+paymentID, nil, &order); err != nil {
		return "", err
	}
	return mapStatus(order.OrderStatus), nil
}

func (p *Provider) Refund(ctx context.Context, paymentID string, amount *openpay.Money) (*openpay.RefundResult, error) {
	body := map[string]any{"reason": "Customer refund request"}
	if amount != nil {
		body["refund"] = toTalerAmount(*amount)
	}
	if err := p.doJSON(ctx, http.MethodPost, p.base()+"/orders/"+paymentID+"/refund", body, nil); err != nil {
		return nil, err
	}
	refundAmount := openpay.Money{Amount: 0, Currency: "EUR"}
	if amount != nil {
		refundAmount = *amount
	}
	return &openpay.RefundResult{
		RefundID: paymentID + "-refund",
		Status:   "pending",
		Amount:   refundAmount,
	}, nil
}

// VerifyWebhook verifies a Taler webhook notification and returns a normalised WebhookEvent.
//
// Security model (two independent layers):
//
//  1. HMAC-SHA512 (when Config.WebhookSecret is set): the raw payload bytes are
//     authenticated with constant-time comparison before any fields are trusted.
//
//  2. Authenticated re-fetch (always applied): the order status is re-fetched from
//     the Merchant Backend using the API key. The returned event reflects this
//     authoritative status — not any field in the payload.
func (p *Provider) VerifyWebhook(ctx context.Context, payload []byte, signature string) (*openpay.WebhookEvent, error) {
	if p.config.WebhookSecret != "" {
		if err := checkHMAC(payload, signature, p.config.WebhookSecret); err != nil {
			return nil, err
		}
	}

	var parsed map[string]any
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return nil, openpay.NewError(openpay.ErrProviderError, "taler webhook: payload is not valid JSON", err)
	}

	orderID, _ := parsed["order_id"].(string)
	if orderID == "" {
		return nil, openpay.NewError(openpay.ErrProviderError, "taler webhook: missing order_id in payload")
	}

	// Re-fetch from the authenticated API — this is the authoritative confirmation.
	status, err := p.GetPaymentStatus(ctx, orderID)
	if err != nil {
		return nil, err
	}

	eventType := "payment.failed"
	switch status {
	case openpay.StatusPaid:
		eventType = "payment.paid"
	case openpay.StatusRefunded:
		eventType = "payment.refunded"
	}

	return &openpay.WebhookEvent{
		Type:      eventType,
		PaymentID: orderID,
		Provider:  p.Name(),
		Metadata:  parsed,
	}, nil
}

// checkHMAC verifies HMAC-SHA512 of body against signature using constant-time comparison.
// Accepts both plain hex and "sha512=<hex>" formats.
func checkHMAC(body []byte, signature, secret string) error {
	if signature == "" {
		return openpay.NewError(openpay.ErrWebhookSignatureInvalid, "taler webhook: missing signature")
	}
	sig := signature
	if strings.HasPrefix(sig, "sha512=") {
		sig = sig[7:]
	}
	// SHA-512 hex digest is always 128 characters.
	if len(sig) != 128 {
		return openpay.NewError(openpay.ErrWebhookSignatureInvalid, "taler webhook: malformed signature (expected 128-char hex)")
	}
	actual, err := hex.DecodeString(sig)
	if err != nil {
		return openpay.NewError(openpay.ErrWebhookSignatureInvalid, "taler webhook: malformed signature (invalid hex)")
	}
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(body)
	expected := mac.Sum(nil)
	if subtle.ConstantTimeCompare(expected, actual) != 1 {
		return openpay.NewError(openpay.ErrWebhookSignatureInvalid, "taler webhook: HMAC-SHA512 signature mismatch")
	}
	return nil
}
