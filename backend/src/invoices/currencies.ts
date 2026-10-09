// Small fixed list for now; easy to move into a table if we ever need more.
export const CURRENCY_SYMBOLS = {
  AUD: 'AU$',
  USD: 'US$',
  GBP: '£',
  EUR: '€',
  SGD: 'S$',
  NZD: 'NZ$',
} as const;

export type CurrencyCode = keyof typeof CURRENCY_SYMBOLS;

export const SUPPORTED_CURRENCIES = Object.keys(
  CURRENCY_SYMBOLS,
) as CurrencyCode[];
