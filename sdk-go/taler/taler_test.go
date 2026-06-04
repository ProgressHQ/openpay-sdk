package taler

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	openpay "github.com/ProgressHQ/openpay-sdk/sdk-go"
)

const webhookSecret = "super-secret-hmac-key"

func sign(body []byte, secret string) string {
	mac := hmac.New(sha512.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// newTestServer builds a minimal Taler backend stub.
// statusByOrder maps order_id → order_status for GET /orders/{id}.
func newTestServer(t *testing.T, statusByOrder map[string]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/orders"):
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			orderID, _ := body["order_id"].(string)
			if orderID == "" {
				orderID = "ord_gen"
			}
			json.NewEncoder(w).Encode(map[string]string{"order_id": orderID})

		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/orders/"):
			parts := strings.Split(r.URL.Path, "/orders/")
			orderID := parts[len(parts)-1]
			status, ok := statusByOrder[orderID]
			if !ok {
				status = "unpaid"
			}
			json.NewEncoder(w).Encode(map[string]string{
				"order_status": status,
				"taler_pay_uri": "taler://pay/" + orderID,
			})

		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/refund"):
			w.WriteHeader(http.StatusNoContent)

		default:
			http.NotFound(w, r)
		}
	}))
}

func newProvider(t *testing.T, srv *httptest.Server, secret string) *Provider {
	t.Helper()
	return New(Config{
		MerchantBackendURL: srv.URL,
		Instance:           "test",
		APIKey:             "test-key",
		FulfillmentBaseURL: "https://example.com",
		WebhookSecret:      secret,
	})
}

// --- CreatePayment ---

func TestCreatePayment(t *testing.T) {
	srv := newTestServer(t, map[string]string{"ord_idem": "paid"})
	defer srv.Close()
	p := newProvider(t, srv, "")

	session, err := p.CreatePayment(context.Background(), openpay.CreatePaymentInput{
		Amount:         openpay.Money{Amount: 10, Currency: "EUR"},
		Description:    "Test item",
		IdempotencyKey: "ord_idem",
	})
	if err != nil {
		t.Fatal(err)
	}
	if session.PaymentID != "ord_idem" {
		t.Errorf("PaymentID = %q, want %q", session.PaymentID, "ord_idem")
	}
	if session.Status != openpay.StatusPaid {
		t.Errorf("Status = %q, want paid", session.Status)
	}
	if !strings.HasPrefix(session.CheckoutURL, "taler://") {
		t.Errorf("CheckoutURL = %q, expected taler:// prefix", session.CheckoutURL)
	}
}

// --- GetPaymentStatus ---

func TestGetPaymentStatus(t *testing.T) {
	srv := newTestServer(t, map[string]string{"ord_1": "paid", "ord_2": "unpaid", "ord_3": "claimed"})
	defer srv.Close()
	p := newProvider(t, srv, "")

	cases := []struct {
		id   string
		want openpay.PaymentStatus
	}{
		{"ord_1", openpay.StatusPaid},
		{"ord_2", openpay.StatusPending},
		{"ord_3", openpay.StatusRequiresAction},
	}
	for _, c := range cases {
		got, err := p.GetPaymentStatus(context.Background(), c.id)
		if err != nil || got != c.want {
			t.Errorf("GetPaymentStatus(%q) = %q, %v; want %q", c.id, got, err, c.want)
		}
	}
}

// --- Refund ---

func TestRefund(t *testing.T) {
	srv := newTestServer(t, nil)
	defer srv.Close()
	p := newProvider(t, srv, "")

	result, err := p.Refund(context.Background(), "ord_1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "pending" {
		t.Errorf("Status = %q, want pending", result.Status)
	}
}

// --- VerifyWebhook: HMAC ---

func TestVerifyWebhook_ValidHMAC(t *testing.T) {
	srv := newTestServer(t, map[string]string{"ord_1": "paid"})
	defer srv.Close()
	p := newProvider(t, srv, webhookSecret)

	payload := []byte(`{"order_id":"ord_1"}`)
	event, err := p.VerifyWebhook(context.Background(), payload, sign(payload, webhookSecret))
	if err != nil {
		t.Fatal(err)
	}
	if event.Type != "payment.paid" || event.PaymentID != "ord_1" {
		t.Errorf("unexpected event %+v", event)
	}
}

func TestVerifyWebhook_Sha512Prefix(t *testing.T) {
	srv := newTestServer(t, map[string]string{"ord_1": "paid"})
	defer srv.Close()
	p := newProvider(t, srv, webhookSecret)

	payload := []byte(`{"order_id":"ord_1"}`)
	sig := "sha512=" + sign(payload, webhookSecret)
	_, err := p.VerifyWebhook(context.Background(), payload, sig)
	if err != nil {
		t.Errorf("expected success with sha512= prefix, got %v", err)
	}
}

func TestVerifyWebhook_WrongSecret(t *testing.T) {
	srv := newTestServer(t, nil)
	defer srv.Close()
	p := newProvider(t, srv, webhookSecret)

	payload := []byte(`{"order_id":"ord_1"}`)
	_, err := p.VerifyWebhook(context.Background(), payload, sign(payload, "wrong-secret"))
	assertWebhookSigInvalid(t, err)
}

func TestVerifyWebhook_TamperedPayload(t *testing.T) {
	srv := newTestServer(t, nil)
	defer srv.Close()
	p := newProvider(t, srv, webhookSecret)

	payload := []byte(`{"order_id":"ord_1"}`)
	_, err := p.VerifyWebhook(context.Background(), append(payload, "tampered"...), sign(payload, webhookSecret))
	assertWebhookSigInvalid(t, err)
}

func TestVerifyWebhook_EmptySignature(t *testing.T) {
	srv := newTestServer(t, nil)
	defer srv.Close()
	p := newProvider(t, srv, webhookSecret)

	_, err := p.VerifyWebhook(context.Background(), []byte(`{"order_id":"ord_1"}`), "")
	assertWebhookSigInvalid(t, err)
}

func TestVerifyWebhook_MalformedSignature(t *testing.T) {
	srv := newTestServer(t, nil)
	defer srv.Close()
	p := newProvider(t, srv, webhookSecret)

	_, err := p.VerifyWebhook(context.Background(), []byte(`{"order_id":"ord_1"}`), "not-a-hex-value")
	assertWebhookSigInvalid(t, err)
}

// --- VerifyWebhook: re-fetch ---

func TestVerifyWebhook_NoSecret_RefetchWins(t *testing.T) {
	// Payload claims nothing about status; backend says "unpaid" — event must be payment.failed.
	srv := newTestServer(t, map[string]string{"ord_1": "unpaid"})
	defer srv.Close()
	p := newProvider(t, srv, "") // no HMAC secret

	event, err := p.VerifyWebhook(context.Background(), []byte(`{"order_id":"ord_1"}`), "")
	if err != nil {
		t.Fatal(err)
	}
	if event.Type != "payment.failed" {
		t.Errorf("expected payment.failed (re-fetch wins), got %q", event.Type)
	}
}

func TestVerifyWebhook_MissingOrderID(t *testing.T) {
	srv := newTestServer(t, nil)
	defer srv.Close()
	p := newProvider(t, srv, "")

	_, err := p.VerifyWebhook(context.Background(), []byte(`{"no_order_id":true}`), "")
	var opErr *openpay.Error
	if !errors.As(err, &opErr) || opErr.Code != openpay.ErrProviderError {
		t.Fatalf("expected ErrProviderError, got %v", err)
	}
}

// --- helpers ---

func assertWebhookSigInvalid(t *testing.T, err error) {
	t.Helper()
	var opErr *openpay.Error
	if !errors.As(err, &opErr) || opErr.Code != openpay.ErrWebhookSignatureInvalid {
		t.Fatalf("expected ErrWebhookSignatureInvalid, got %v", err)
	}
}
