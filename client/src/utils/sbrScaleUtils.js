/**
 * Shared SBR Scale Utilities (Client-Side)
 * Unified 0–4 standards-based grading scale.
 */

export const SCALE_LEVELS = [
  { value: 4, label: 'Exceeds Standard', labelAr: 'يتجاوز المعيار', color: 'var(--sbr-scale-4-text, #1a7a1a)' },
  { value: 3, label: 'Meets Standard', labelAr: 'يلبّي المعيار', color: 'var(--sbr-scale-3-text, #2f855a)' },
  { value: 2, label: 'Approaching Standard', labelAr: 'يقترب من المعيار', color: 'var(--sbr-scale-2-text, #b7791f)' },
  { value: 1, label: 'Below Standard', labelAr: 'دون المعيار', color: 'var(--sbr-scale-1-text, #c53030)' },
  { value: 0, label: 'Not Demonstrated', labelAr: 'لم يُظهر أي أداء', color: 'var(--sbr-scale-0-text, #718096)' },
];

export const SCALE_OPTIONS = [4, 3, 2, 1, 0];

/**
 * Get display info for a scale value.
 * @param {number|null} value - 0–4 or null
 * @returns {{ label: string, labelAr: string, color: string }}
 */
export const getScaleLevelInfo = (value) => {
  if (value === null || value === undefined) {
    return { label: 'Not Assessed', labelAr: 'لم يُقيّم', color: 'var(--sbr-scale-na-text, #a0aec0)' };
  }
  const level = SCALE_LEVELS.find((l) => l.value === Number(value));
  return level || { label: '--', labelAr: '--', color: 'var(--sbr-scale-fallback-text, #e2e8f0)' };
};

/**
 * Get background color for a scale value.
 * @param {number|null} value
 * @returns {string}
 */
export const getScaleColor = (value) => getScaleLevelInfo(value).color;

/**
 * Get a lighter background variant for table cells.
 * @param {number|null} value
 * @returns {string}
 */
export const getScaleBgColor = (value) => {
  const map = {
    4: 'var(--sbr-scale-4-bg, #e6f4e6)',
    3: 'var(--sbr-scale-3-bg, #edf7ed)',
    2: 'var(--sbr-scale-2-bg, #fef3e2)',
    1: 'var(--sbr-scale-1-bg, #fde8e8)',
    0: 'var(--sbr-scale-0-bg, #edf2f7)',
  };
  return map[value] ?? 'transparent';
};
