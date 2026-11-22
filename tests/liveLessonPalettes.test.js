import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETUP_PALETTE,
  LIVE_LESSON_PALETTES,
  LIVE_LESSON_PALETTE_IDS,
  SETUP_PALETTE_VALUES,
  normalizeSetupPalette,
  paletteById,
  paletteCssVariables,
  resolveSlidePalette,
} from "../config/liveLessonPalettes.js";
import {
  buildDesignedSlide,
  paletteFor,
} from "../services/liveLessonDesignedSlideService.js";

const TOKENS = ["bg", "bg2", "accent", "accentSoft", "accentLine", "ink", "inkMuted"];

const channelToLinear = (channel) => {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  );
};

const contrast = (first, second) => {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const gradientStops = (value) => [
  ...String(value).matchAll(/#[0-9a-f]{6}\b/gi),
].map((match) => match[0]);

test("every palette is complete and uniquely identified", () => {
  assert.ok(LIVE_LESSON_PALETTES.length >= 5);
  assert.equal(LIVE_LESSON_PALETTE_IDS.length, LIVE_LESSON_PALETTES.length);
  assert.equal(new Set(LIVE_LESSON_PALETTE_IDS).size, LIVE_LESSON_PALETTE_IDS.length);
  for (const palette of LIVE_LESSON_PALETTES) {
    assert.equal(palette.id, palette.name);
    for (const token of TOKENS) {
      assert.ok(palette[token], `${palette.id} is missing ${token}`);
    }
    assert.ok(gradientStops(palette.bg).length >= 2, `${palette.id} bg is not a gradient`);
    assert.ok(gradientStops(palette.bg2).length >= 2, `${palette.id} bg2 is not a gradient`);
  }
});

test("palette ink stays readable on every background stop", () => {
  for (const palette of LIVE_LESSON_PALETTES) {
    const stops = [
      ...new Set([...gradientStops(palette.bg), ...gradientStops(palette.bg2)]),
    ];
    for (const stop of stops) {
      assert.ok(
        contrast(palette.ink, stop) >= 4.5,
        `${palette.id} ink on ${stop} is ${contrast(palette.ink, stop).toFixed(2)}`,
      );
      assert.ok(
        contrast(palette.inkMuted, stop) >= 4.5,
        `${palette.id} inkMuted on ${stop} is ${contrast(palette.inkMuted, stop).toFixed(2)}`,
      );
      assert.ok(
        contrast(palette.accent, stop) >= 3,
        `${palette.id} accent on ${stop} is ${contrast(palette.accent, stop).toFixed(2)}`,
      );
    }
  }
});

test("setup palette normalization keeps known values and falls back to the default", () => {
  for (const value of SETUP_PALETTE_VALUES) {
    assert.equal(normalizeSetupPalette(value), value);
  }
  assert.equal(normalizeSetupPalette(" Navy "), "navy");
  assert.equal(normalizeSetupPalette("purple"), DEFAULT_SETUP_PALETTE);
  assert.equal(normalizeSetupPalette(undefined), DEFAULT_SETUP_PALETTE);
  assert.equal(paletteById("teal").accent, "#5eead4");
  assert.equal(paletteById("nope"), null);
});

test("an explicit setup palette wins over the deterministic auto choice", () => {
  const fallback = paletteFor({ slideType: "content", seed: "Water cycle" });
  assert.equal(resolveSlidePalette({ setupPalette: "plum", fallback }), paletteById("plum"));
  assert.equal(resolveSlidePalette({ setupPalette: "auto", fallback }), fallback);
  assert.equal(resolveSlidePalette({ setupPalette: "", fallback }), fallback);
  assert.equal(
    resolveSlidePalette({ setupPalette: "", fallback: null }),
    paletteById(DEFAULT_SETUP_PALETTE),
  );
});

test("the designed renderer colors every slide with the chosen palette", () => {
  for (const palette of LIVE_LESSON_PALETTES) {
    const slide = buildDesignedSlide({
      slideType: "content",
      title: "The water cycle",
      body: "Evaporation\nCondensation",
      setupPalette: palette.id,
    });
    assert.equal(slide.palette, palette.id);
    assert.match(slide.html, new RegExp(`data-palette="${palette.id}"`));
    assert.ok(slide.html.includes(`--accent:${palette.accent}`));
    assert.ok(slide.html.includes(`--bg:${palette.bg}`));
  }
});

test("auto keeps the deterministic per-slide palette", () => {
  const first = buildDesignedSlide({ slideType: "goals", title: "Today", body: "One" });
  const second = buildDesignedSlide({
    slideType: "goals",
    title: "Today",
    body: "One",
    setupPalette: "auto",
  });
  assert.equal(first.palette, second.palette);
});

test("palette CSS variables carry every token the shell reads", () => {
  const css = paletteCssVariables(paletteById("forest"));
  for (const name of [
    "--slide-bg",
    "--slide-bg-2",
    "--slide-accent",
    "--slide-accent-soft",
    "--slide-accent-line",
    "--slide-ink",
    "--slide-ink-muted",
    "--slide-palette",
  ]) {
    assert.ok(css.includes(`${name}:`), `missing ${name}`);
  }
  assert.ok(css.includes('--slide-palette:"forest"'));
});
