import { formatNumber } from "./builder/liveLessonBuilderForm.js";

/**
 * Non-interactive labels for the source chip. Accepts the draft's
 * `setup` shape or a live session's `sourceMeta`; both carry names,
 * page metadata and counts, never source text.
 */
export const sourceChips = (source, t, locale) => {
  const files = Array.isArray(source?.files) ? source.files : [];
  const pastedChars = Number(source?.pastedChars) || 0;
  const chips = files
    .map((file) => {
      const name = String(file?.name || "").trim();
      if (!name) return "";
      const pageCount = Number(file?.pageCount) || 0;
      const first = Number(file?.pages?.first) || 0;
      const last = Number(file?.pages?.last) || 0;
      if (first > 0 && last > 0 && pageCount > 0) {
        return t("sourceChip.pagesRange", {
          name,
          first: formatNumber(first, locale),
          last: formatNumber(last, locale),
          count: formatNumber(pageCount, locale),
        });
      }
      if (pageCount > 0) {
        return t("sourceChip.pagesCount", {
          name,
          count: formatNumber(pageCount, locale),
        });
      }
      return t("sourceChip.characters", {
        name,
        count: formatNumber(Number(file?.chars) || 0, locale),
      });
    })
    .filter(Boolean);
  if (pastedChars > 0) {
    chips.push(
      t("sourceChip.pasted", { count: formatNumber(pastedChars, locale) }),
    );
  }
  return chips;
};
