/**
 * One geometry for measuring and rendering. Both the off-screen sheet and the
 * real page read these values, so a paragraph never breaks differently than it
 * was measured — regardless of the window width.
 */
const SIZES = {
  spread: {
    padBlock: 26,
    padBottom: 24,
    padInline: 38,
    textSize: 17.6,
    textLine: 31.33,
    topLine: 25,
    footer: 46,
  },
  single: {
    padBlock: 22,
    padBottom: 22,
    padInline: 22,
    textSize: 16.32,
    textLine: 28.4,
    topLine: 25,
    footer: 46,
  },
  compact: {
    padBlock: 18,
    padBottom: 16,
    padInline: 16,
    textSize: 16.32,
    textLine: 28.4,
    topLine: 21,
    footer: 50,
  },
};

export const layoutForWidth = (containerWidth) => {
  const width = Math.max(0, Number(containerWidth) || 0);
  const size = width >= 880 ? 'spread' : width >= 520 ? 'single' : 'compact';
  const { topLine, footer, ...metrics } = SIZES[size];
  return {
    size,
    wide: size === 'spread',
    ...metrics,
    chrome: metrics.padBlock + metrics.padBottom + topLine + footer,
  };
};

/** The footer is reserved on every passage page because the last one carries it. */
export const passageTextHeight = (pageHeight, layout) => (
  Math.max(160, Math.round((Number(pageHeight) || 0) - (layout?.chrome || 0)))
);

export const layoutCssVars = (layout) => ({
  '--book-page-pad-block': `${layout?.padBlock ?? 26}px`,
  '--book-page-pad-bottom': `${layout?.padBottom ?? 24}px`,
  '--book-page-pad-inline': `${layout?.padInline ?? 38}px`,
  '--book-text-size': `${layout?.textSize ?? 17.6}px`,
  '--book-text-line': `${layout?.textLine ?? 31.33}px`,
});
