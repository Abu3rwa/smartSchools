export const CREDIT_ERROR_CODES = ["AI_CREDIT_REQUIRED", "AI_CREDIT_PAUSED", "AI_CREDIT_PRICING_REQUIRED"];

export const formatUsd = (cents, locale = "en", maximumFractionDigits = 2) => new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits,
}).format((Number(cents) || 0) / 100);

/** Balances never read below zero; a last request can overshoot by a fraction of a cent. */
export const formatBalance = (cents, locale = "en") => formatUsd(Math.max(0, Number(cents) || 0), locale);

export const formatCents = (cents, locale = "en") => `${new Intl.NumberFormat(locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
}).format(Number(cents) || 0)}¢`;

export const formatTokens = (count, locale = "en") => new Intl.NumberFormat(locale).format(Number(count) || 0);

/** Same math as the server: selling price = provider cost × (1 + markup%). */
export const applyMarkupCents = (providerCents, markupPercent = 0) => {
  const cost = Number(providerCents) || 0;
  const percent = Number(markupPercent) || 0;
  return Math.round(cost * (1 + percent / 100) * 10000) / 10000;
};

/** "5", "5.5", "$5.50" → cents; anything else → NaN. */
export const dollarsToCents = (input) => {
  const cleaned = String(input ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  return Math.round(Number(cleaned) * 100);
};

export const centsToDollarsInput = (cents) => {
  const value = (Number(cents) || 0) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

export const creditState = ({ paused, balanceCents = 0, lowBalanceCents = 0 } = {}) => {
  if (paused) return "paused";
  if (balanceCents <= 0) return "empty";
  if (balanceCents <= lowBalanceCents) return "low";
  return "ok";
};

export const isCreditError = (error) => CREDIT_ERROR_CODES.includes(error?.response?.data?.code);

/** Translated message for a credit refusal, or "" when the error is something else. */
export const creditErrorMessage = (error, t) => {
  const code = error?.response?.data?.code;
  if (code === "AI_CREDIT_PAUSED") return t("aiCredit:errors.paused");
  if (code === "AI_CREDIT_REQUIRED") return t("aiCredit:errors.required");
  if (code === "AI_CREDIT_PRICING_REQUIRED") return t("aiCredit:errors.pricing");
  return "";
};
