package openpay

import (
	"context"
	"testing"
	"time"
)

func TestEntitlements_GrantAndCheck(t *testing.T) {
	store := NewMemoryEntitlementStore()
	m := NewEntitlementManager(store)
	ctx := context.Background()

	if err := m.Grant(ctx, GrantInput{UserID: "u1", ResourceID: "r1", ExpiresAt: nil}); err != nil {
		t.Fatal(err)
	}
	ok, err := m.Check(ctx, "u1", "r1")
	if err != nil || !ok {
		t.Fatalf("expected granted, got ok=%v err=%v", ok, err)
	}
}

func TestEntitlements_CheckMissing(t *testing.T) {
	m := NewEntitlementManager(NewMemoryEntitlementStore())
	ok, err := m.Check(context.Background(), "u1", "r1")
	if err != nil || ok {
		t.Fatalf("expected not granted, got ok=%v err=%v", ok, err)
	}
}

func TestEntitlements_Revoke(t *testing.T) {
	store := NewMemoryEntitlementStore()
	m := NewEntitlementManager(store)
	ctx := context.Background()

	_ = m.Grant(ctx, GrantInput{UserID: "u1", ResourceID: "r1"})
	_ = m.Revoke(ctx, "u1", "r1")

	ok, _ := m.Check(ctx, "u1", "r1")
	if ok {
		t.Fatal("expected entitlement revoked")
	}
}

func TestEntitlements_Expiry(t *testing.T) {
	store := NewMemoryEntitlementStore()
	m := NewEntitlementManager(store)
	ctx := context.Background()

	past := time.Now().Add(-time.Second)
	_ = m.Grant(ctx, GrantInput{UserID: "u1", ResourceID: "r1", ExpiresAt: &past})

	ok, _ := m.Check(ctx, "u1", "r1")
	if ok {
		t.Fatal("expected expired entitlement to be denied")
	}
}

func TestEntitlements_List(t *testing.T) {
	store := NewMemoryEntitlementStore()
	m := NewEntitlementManager(store)
	ctx := context.Background()

	_ = m.Grant(ctx, GrantInput{UserID: "u1", ResourceID: "r1"})
	_ = m.Grant(ctx, GrantInput{UserID: "u1", ResourceID: "r2"})
	past := time.Now().Add(-time.Second)
	_ = m.Grant(ctx, GrantInput{UserID: "u1", ResourceID: "r3", ExpiresAt: &past})

	entries, err := m.List(ctx, "u1")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Errorf("expected 2 active entitlements, got %d", len(entries))
	}
}
