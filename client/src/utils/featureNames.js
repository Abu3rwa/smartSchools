/** Turn a camelCase feature key into readable text when no label exists. */
export const humanizeFeatureKey = (featureKey) => String(featureKey || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

/**
 * Prefer the translated feature name, then the plan catalogue label from the
 * server, then the humanized key, so a screen never prints `gradebookSpreadsheet`.
 */
export const resolveFeatureLabel = (t, featureKey, metadataLabel) => {
  const fallback = metadataLabel || humanizeFeatureKey(featureKey);
  if (!featureKey || typeof t !== 'function') return fallback;
  return t(`settings:featureLabels.${featureKey}`, { defaultValue: fallback });
};
