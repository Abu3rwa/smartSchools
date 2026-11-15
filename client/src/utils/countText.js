import i18n from "../i18n/index.js";

/**
 * Arabic changes the noun with the number (كلمة واحدة، كلمتان، ٣ كلمات),
 * and the app never passes `count` to t() because that hands plural
 * resolution to i18next. So the form is picked here and the words still come
 * from the locale file: `<key>.zero|one|two|few|many|other`.
 */
export const pluralForm = (n, lang = i18n.language) => {
  const value = Math.abs(Number(n) || 0);
  try {
    return new Intl.PluralRules(String(lang || "en")).select(value);
  } catch {
    return "other";
  }
};

export const countLabel = (t, key, n, extra = {}) => {
  const value = Math.abs(Number(n) || 0);
  const form = pluralForm(value);
  return t(`${key}.${form}`, {
    ...extra,
    n: value,
    defaultValue: t(`${key}.other`, { ...extra, n: value }),
  });
};
