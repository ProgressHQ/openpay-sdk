package openpay

import (
	"fmt"
	"math"
)

// currencyExponents holds ISO 4217 currencies with non-standard decimal exponents.
// Currencies not listed default to 2 (cents).
var currencyExponents = map[string]int{
	// Zero decimal places
	"BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0,
	"KMF": 0, "KRW": 0, "MGA": 0, "PYG": 0, "RWF": 0, "UGX": 0,
	"VND": 0, "VUV": 0, "XAF": 0, "XOF": 0, "XPF": 0,
	// Three decimal places
	"BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
}

// Money represents a monetary value as integer minor units (e.g. cents for EUR/USD).
// Never store or pass floats — use ToMinorUnits only at system boundaries.
type Money struct {
	Amount   int64  // non-negative integer in minor units
	Currency string // ISO 4217 currency code
}

// CurrencyExponent returns the number of decimal places for the given currency (defaults to 2).
func CurrencyExponent(currency string) int {
	if exp, ok := currencyExponents[currency]; ok {
		return exp
	}
	return 2
}

// ToMinorUnits converts a human-readable decimal to integer minor units.
// Use only at system boundaries (e.g. parsing user input or config files).
func ToMinorUnits(decimal float64, currency string) int64 {
	exp := CurrencyExponent(currency)
	return int64(math.Round(decimal * math.Pow10(exp)))
}

// FromMinorUnits converts integer minor units back to a decimal. Use only for display.
func FromMinorUnits(minorUnits int64, currency string) float64 {
	exp := CurrencyExponent(currency)
	return float64(minorUnits) / math.Pow10(exp)
}

// FormatMoney returns a simple decimal string like "EUR 1.00".
func FormatMoney(m Money) string {
	exp := CurrencyExponent(m.Currency)
	if exp == 0 {
		return fmt.Sprintf("%s %d", m.Currency, m.Amount)
	}
	return fmt.Sprintf("%s %.*f", m.Currency, exp, FromMinorUnits(m.Amount, m.Currency))
}
