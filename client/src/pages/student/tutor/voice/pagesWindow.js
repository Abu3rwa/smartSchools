export const PAGE_WINDOW = 6;

/**
 * A long session keeps only its newest pages mounted; the rest collapse into
 * one "earlier" row until the student asks for them. Rows keep their own ids,
 * so expanding does not remount the pages that were already visible.
 */
export const pagesWindow = (pages = [], expanded = false, limit = PAGE_WINDOW) => {
  const list = Array.isArray(pages) ? pages : [];
  const size = Math.max(1, Number(limit) || PAGE_WINDOW);
  if (expanded || list.length <= size) {
    return {
      visible: list,
      hidden: [],
      hiddenCount: 0,
      canExpand: false,
    };
  }
  const hidden = list.slice(0, list.length - size);
  return {
    visible: list.slice(-size),
    hidden,
    hiddenCount: hidden.length,
    canExpand: true,
  };
};
