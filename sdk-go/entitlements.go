package openpay

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// EntitlementEntry records a granted entitlement.
type EntitlementEntry struct {
	UserID     string
	ResourceID string
	GrantedAt  time.Time
	ExpiresAt  *time.Time // nil = permanent
	PaymentID  string
	Metadata   map[string]string
}

// EntitlementStore is the persistence interface for entitlements.
type EntitlementStore interface {
	Grant(ctx context.Context, entry EntitlementEntry) error
	Check(ctx context.Context, userID, resourceID string) (bool, error)
	Revoke(ctx context.Context, userID, resourceID string) error
	List(ctx context.Context, userID string) ([]EntitlementEntry, error)
}

// MemoryEntitlementStore is an in-memory EntitlementStore for tests and demos.
// Not durable across restarts.
type MemoryEntitlementStore struct {
	mu      sync.RWMutex
	entries map[string]EntitlementEntry
}

func NewMemoryEntitlementStore() *MemoryEntitlementStore {
	return &MemoryEntitlementStore{entries: make(map[string]EntitlementEntry)}
}

func (s *MemoryEntitlementStore) entryKey(userID, resourceID string) string {
	return fmt.Sprintf("%s\x00%s", userID, resourceID)
}

func (s *MemoryEntitlementStore) Grant(_ context.Context, e EntitlementEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[s.entryKey(e.UserID, e.ResourceID)] = e
	return nil
}

func (s *MemoryEntitlementStore) Check(_ context.Context, userID, resourceID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[s.entryKey(userID, resourceID)]
	if !ok {
		return false, nil
	}
	if e.ExpiresAt != nil && e.ExpiresAt.Before(time.Now()) {
		delete(s.entries, s.entryKey(userID, resourceID))
		return false, nil
	}
	return true, nil
}

func (s *MemoryEntitlementStore) Revoke(_ context.Context, userID, resourceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries, s.entryKey(userID, resourceID))
	return nil
}

func (s *MemoryEntitlementStore) List(_ context.Context, userID string) ([]EntitlementEntry, error) {
	now := time.Now()
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []EntitlementEntry
	for _, e := range s.entries {
		if e.UserID == userID && (e.ExpiresAt == nil || e.ExpiresAt.After(now)) {
			result = append(result, e)
		}
	}
	return result, nil
}

// GrantInput is the input to EntitlementManager.Grant.
type GrantInput struct {
	UserID     string
	ResourceID string
	ExpiresAt  *time.Time // nil = permanent
	PaymentID  string
	Metadata   map[string]string
}

// EntitlementManager wraps an EntitlementStore with error normalisation.
type EntitlementManager struct {
	store EntitlementStore
}

func NewEntitlementManager(store EntitlementStore) *EntitlementManager {
	return &EntitlementManager{store: store}
}

func (m *EntitlementManager) Grant(ctx context.Context, input GrantInput) error {
	err := m.store.Grant(ctx, EntitlementEntry{
		UserID:     input.UserID,
		ResourceID: input.ResourceID,
		GrantedAt:  time.Now(),
		ExpiresAt:  input.ExpiresAt,
		PaymentID:  input.PaymentID,
		Metadata:   input.Metadata,
	})
	if err != nil {
		return NewError(ErrEntitlementStoreError, "failed to grant entitlement", err)
	}
	return nil
}

func (m *EntitlementManager) Check(ctx context.Context, userID, resourceID string) (bool, error) {
	ok, err := m.store.Check(ctx, userID, resourceID)
	if err != nil {
		return false, NewError(ErrEntitlementStoreError, "failed to check entitlement", err)
	}
	return ok, nil
}

func (m *EntitlementManager) Revoke(ctx context.Context, userID, resourceID string) error {
	if err := m.store.Revoke(ctx, userID, resourceID); err != nil {
		return NewError(ErrEntitlementStoreError, "failed to revoke entitlement", err)
	}
	return nil
}

func (m *EntitlementManager) List(ctx context.Context, userID string) ([]EntitlementEntry, error) {
	entries, err := m.store.List(ctx, userID)
	if err != nil {
		return nil, NewError(ErrEntitlementStoreError, "failed to list entitlements", err)
	}
	return entries, nil
}
