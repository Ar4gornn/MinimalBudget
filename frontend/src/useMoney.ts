import { useCallback } from "react";

import { useOptionalAuth } from "./auth/AuthContext";
import { currencySymbol, formatAmount, formatMoney } from "./money";
import type { Currency, Money } from "./api/types";

/**
 * Formatting bound to the signed-in account's currency.
 *
 * A hook rather than threading `currency` through every component, and rather than a
 * module-level global — the latter would be read during render while being written by
 * auth, which is exactly the kind of thing that shows one family member another's symbol
 * for a frame after signing in.
 */
export function useMoney(): {
  /** With the account's symbol: "$1,200.00". For anything a person reads as money. */
  amount: (value: Money) => string;
  /** Bare digits: "1,200.00". For table columns where the symbol sits in the header. */
  plain: (value: Money) => string;
  symbol: string;
  currency: Currency;
} {
  const auth = useOptionalAuth();
  const currency: Currency = auth?.user?.currency ?? "USD";

  const amount = useCallback((value: Money) => formatAmount(value, currency), [currency]);
  const plain = useCallback((value: Money) => formatMoney(value), []);

  return { amount, plain, symbol: currencySymbol(currency), currency };
}
