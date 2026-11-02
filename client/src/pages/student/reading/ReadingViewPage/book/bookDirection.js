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

export const SWIPE_MIN_DISTANCE = 48;

/**
 * A page turn from a horizontal gesture. Mouse drags are text selection, not
 * swipes, so only touch and pen qualify.
 */
export const swipeDirection = ({ dx = 0, dy = 0, direction = 'ltr', pointerType } = {}) => {
  if (pointerType !== 'touch' && pointerType !== 'pen') return null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy)) return null;
  const forward = direction === 'rtl' ? dx > 0 : dx < 0;
  return forward ? 'next' : 'prev';
};

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
