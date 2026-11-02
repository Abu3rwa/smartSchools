const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export const isArabicLanguage = (language) => {
  const value = String(language || '').trim().toLowerCase();
  if (!value) return false;
  return value === 'arabic' || /^ar(?:[-_]|$)/.test(value) || ARABIC_SCRIPT.test(value);
};

/** The book turns right-to-left when either the interface or the passage is Arabic. */
export const bookDirection = ({ uiLanguage, textLanguage } = {}) => (
  isArabicLanguage(uiLanguage) || isArabicLanguage(textLanguage) ? 'rtl' : 'ltr'
);

/** Translate an arrow key into a page turn, mirrored for right-to-left reading. */
export const arrowAction = (key, direction) => {
  if (direction === 'rtl') {
    if (key === 'ArrowLeft') return 'next';
    if (key === 'ArrowRight') return 'prev';
  } else {
    if (key === 'ArrowRight') return 'next';
    if (key === 'ArrowLeft') return 'prev';
  }
  if (key === 'PageDown') return 'next';
  if (key === 'PageUp') return 'prev';
  return null;
};
