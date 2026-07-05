/**
 * currencies.ts — the dataset behind the Primary Currency combobox.
 * Flags are emoji glyphs (spec: each row shows flag + code + name).
 * Searchable by code, name, or country keywords.
 */

export interface Currency {
  code: string;
  name: string;
  flag: string;
  keywords: string; // extra search terms
}

export const CURRENCIES: Currency[] = [
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦", keywords: "canada" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸", keywords: "united states america" },
  { code: "EUR", name: "Euro", flag: "🇪🇺", keywords: "europe eurozone germany france spain italy" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧", keywords: "united kingdom britain england sterling" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺", keywords: "australia" },
  { code: "NZD", name: "New Zealand Dollar", flag: "🇳🇿", keywords: "new zealand" },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵", keywords: "japan" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳", keywords: "china renminbi rmb" },
  { code: "INR", name: "Indian Rupee", flag: "🇮🇳", keywords: "india" },
  { code: "CHF", name: "Swiss Franc", flag: "🇨🇭", keywords: "switzerland" },
  { code: "SEK", name: "Swedish Krona", flag: "🇸🇪", keywords: "sweden" },
  { code: "NOK", name: "Norwegian Krone", flag: "🇳🇴", keywords: "norway" },
  { code: "DKK", name: "Danish Krone", flag: "🇩🇰", keywords: "denmark" },
  { code: "SGD", name: "Singapore Dollar", flag: "🇸🇬", keywords: "singapore" },
  { code: "HKD", name: "Hong Kong Dollar", flag: "🇭🇰", keywords: "hong kong" },
  { code: "KRW", name: "South Korean Won", flag: "🇰🇷", keywords: "korea" },
  { code: "MXN", name: "Mexican Peso", flag: "🇲🇽", keywords: "mexico" },
  { code: "BRL", name: "Brazilian Real", flag: "🇧🇷", keywords: "brazil" },
  { code: "ZAR", name: "South African Rand", flag: "🇿🇦", keywords: "south africa" },
  { code: "AED", name: "UAE Dirham", flag: "🇦🇪", keywords: "emirates dubai" },
  { code: "SAR", name: "Saudi Riyal", flag: "🇸🇦", keywords: "saudi arabia" },
  { code: "TRY", name: "Turkish Lira", flag: "🇹🇷", keywords: "turkey" },
  { code: "PLN", name: "Polish Złoty", flag: "🇵🇱", keywords: "poland" },
  { code: "CZK", name: "Czech Koruna", flag: "🇨🇿", keywords: "czechia" },
  { code: "HUF", name: "Hungarian Forint", flag: "🇭🇺", keywords: "hungary" },
  { code: "ILS", name: "Israeli New Shekel", flag: "🇮🇱", keywords: "israel" },
  { code: "THB", name: "Thai Baht", flag: "🇹🇭", keywords: "thailand" },
  { code: "PHP", name: "Philippine Peso", flag: "🇵🇭", keywords: "philippines" },
  { code: "IDR", name: "Indonesian Rupiah", flag: "🇮🇩", keywords: "indonesia" },
  { code: "MYR", name: "Malaysian Ringgit", flag: "🇲🇾", keywords: "malaysia" },
  { code: "VND", name: "Vietnamese Đồng", flag: "🇻🇳", keywords: "vietnam" },
  { code: "ARS", name: "Argentine Peso", flag: "🇦🇷", keywords: "argentina" },
  { code: "CLP", name: "Chilean Peso", flag: "🇨🇱", keywords: "chile" },
  { code: "COP", name: "Colombian Peso", flag: "🇨🇴", keywords: "colombia" },
  { code: "NGN", name: "Nigerian Naira", flag: "🇳🇬", keywords: "nigeria" },
  { code: "KES", name: "Kenyan Shilling", flag: "🇰🇪", keywords: "kenya" },
];

export function searchCurrencies(query: string): Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURRENCIES;
  return CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.keywords.includes(q)
  );
}
