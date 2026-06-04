package openpay

import (
	"testing"
)

func TestToMinorUnits(t *testing.T) {
	cases := []struct {
		decimal  float64
		currency string
		want     int64
	}{
		{0.10, "EUR", 10},
		{9.99, "EUR", 999},
		{1.00, "USD", 100},
		{100, "JPY", 100}, // zero decimal
		{1.500, "KWD", 1500}, // three decimals
		{0.001, "KWD", 1},
	}
	for _, c := range cases {
		got := ToMinorUnits(c.decimal, c.currency)
		if got != c.want {
			t.Errorf("ToMinorUnits(%v, %q) = %d, want %d", c.decimal, c.currency, got, c.want)
		}
	}
}

func TestFromMinorUnits(t *testing.T) {
	if got := FromMinorUnits(10, "EUR"); got != 0.10 {
		t.Errorf("FromMinorUnits(10, EUR) = %v, want 0.10", got)
	}
	if got := FromMinorUnits(100, "JPY"); got != 100 {
		t.Errorf("FromMinorUnits(100, JPY) = %v, want 100", got)
	}
}

func TestFormatMoney(t *testing.T) {
	cases := []struct {
		m    Money
		want string
	}{
		{Money{10, "EUR"}, "EUR 0.10"},
		{Money{100, "JPY"}, "JPY 100"},
		{Money{1500, "KWD"}, "KWD 1.500"},
	}
	for _, c := range cases {
		if got := FormatMoney(c.m); got != c.want {
			t.Errorf("FormatMoney(%+v) = %q, want %q", c.m, got, c.want)
		}
	}
}
