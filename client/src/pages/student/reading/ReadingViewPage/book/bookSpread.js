/** The spread always starts on an even index so the left page never moves alone. */
export const spreadStart = (pageIndex, wide) => (
  wide ? pageIndex - (pageIndex % 2) : pageIndex
);

/** The page indexes actually on screen: one in single mode, up to two in a spread. */
export const visiblePageIndexes = (pageIndex, wide, total) => {
  const start = spreadStart(pageIndex, wide);
  const slots = wide ? 2 : 1;
  const indexes = [];
  for (let offset = 0; offset < slots; offset += 1) {
    const index = start + offset;
    if (index >= 0 && index < total) indexes.push(index);
  }
  return indexes;
};
