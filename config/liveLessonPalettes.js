/**
 * One palette vocabulary for teaching slides. Both the server-owned designed
 * renderer and AI-authored pages read these values, so a lesson can never show
 * two different color schemes. A palette is colors only: layout, text and
 * structure are owned elsewhere.
 */

export const LIVE_LESSON_PALETTES = Object.freeze([
  {
    id: "navy",
    name: "navy",
    bg: "linear-gradient(135deg, #101b33 0%, #1c3a68 58%, #3a2760 100%)",
    bg2: "linear-gradient(160deg, #1c3a68 0%, #101b33 100%)",
    accent: "#fbbf24",
    accentSoft: "rgba(251, 191, 36, .16)",
    accentLine: "rgba(251, 191, 36, .42)",
    ink: "#f8fafc",
    inkMuted: "#dbe6f7",
  },
  {
    id: "teal",
    name: "teal",
    bg: "linear-gradient(135deg, #062a2c 0%, #0e5854 56%, #123f63 100%)",
    bg2: "linear-gradient(160deg, #0e5854 0%, #062a2c 100%)",
    accent: "#5eead4",
    accentSoft: "rgba(94, 234, 212, .14)",
    accentLine: "rgba(94, 234, 212, .38)",
    ink: "#f2fbfa",
    inkMuted: "#cdeee9",
  },
  {
    id: "plum",
    name: "plum",
    bg: "linear-gradient(135deg, #2a1030 0%, #55205c 55%, #8c2f57 100%)",
    bg2: "linear-gradient(160deg, #55205c 0%, #2a1030 100%)",
    accent: "#f9a8d4",
    accentSoft: "rgba(249, 168, 212, .15)",
    accentLine: "rgba(249, 168, 212, .4)",
    ink: "#fdf4fa",
    inkMuted: "#efd6e8",
  },
  {
    id: "sunset",
    name: "sunset",
    bg: "linear-gradient(135deg, #3a1408 0%, #8a2f16 58%, #a9551c 100%)",
    bg2: "linear-gradient(160deg, #8a2f16 0%, #3a1408 100%)",
    accent: "#fde68a",
    accentSoft: "rgba(253, 230, 138, .16)",
    accentLine: "rgba(253, 230, 138, .4)",
    ink: "#fff8ef",
    inkMuted: "#fbeedd",
  },
  {
    id: "forest",
    name: "forest",
    bg: "linear-gradient(135deg, #0b2418 0%, #14532d 55%, #0f4c5c 100%)",
    bg2: "linear-gradient(160deg, #14532d 0%, #0b2418 100%)",
    accent: "#86efac",
    accentSoft: "rgba(134, 239, 172, .14)",
    accentLine: "rgba(134, 239, 172, .36)",
    ink: "#f4fbf6",
    inkMuted: "#d2ecda",
  },
]);

export const LIVE_LESSON_PALETTE_IDS = Object.freeze(
  LIVE_LESSON_PALETTES.map((palette) => palette.id),
);

/** "auto" keeps today's per-slide variety; every other value is a fixed id. */
export const SETUP_PALETTE_VALUES = Object.freeze(["auto", ...LIVE_LESSON_PALETTE_IDS]);

export const DEFAULT_PALETTE_ID = "navy";
export const DEFAULT_SETUP_PALETTE = "navy";

export const paletteById = (id) =>
  LIVE_LESSON_PALETTES.find((palette) => palette.id === id) || null;

export const normalizeSetupPalette = (value) => {
  const id = String(value || "").trim().toLowerCase();
  return SETUP_PALETTE_VALUES.includes(id) ? id : DEFAULT_SETUP_PALETTE;
};

/**
 * Resolved colors for one slide. `auto` defers to the caller's deterministic
 * choice so legacy drafts keep their look; an explicit id wins for every slide.
 */
export const resolveSlidePalette = ({ setupPalette, fallback }) => {
  const explicit = setupPalette && setupPalette !== "auto" ? paletteById(setupPalette) : null;
  return explicit || fallback || paletteById(DEFAULT_PALETTE_ID);
};

/** The `:root` block the AI slide shell and the tests read. */
export const paletteCssVariables = (palette) => {
  const theme = palette || paletteById(DEFAULT_PALETTE_ID);
  return [
    `--slide-bg:${theme.bg}`,
    `--slide-bg-2:${theme.bg2}`,
    `--slide-accent:${theme.accent}`,
    `--slide-accent-soft:${theme.accentSoft}`,
    `--slide-accent-line:${theme.accentLine}`,
    `--slide-ink:${theme.ink}`,
    `--slide-ink-muted:${theme.inkMuted}`,
    `--slide-palette:"${theme.id}"`,
  ].join(";");
};

/** Client-safe list: no names, no HTML. */
export const paletteSettings = () =>
  LIVE_LESSON_PALETTES.map(({ id, bg, bg2, accent, accentSoft, accentLine, ink, inkMuted }) => ({
    id,
    bg,
    bg2,
    accent,
    accentSoft,
    accentLine,
    ink,
    inkMuted,
  }));

export default LIVE_LESSON_PALETTES;
