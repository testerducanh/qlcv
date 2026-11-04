import { describe, expect, it } from "vitest";
import tokens from "./tokens.json";

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const { color } = tokens;
const surfaces = {
  "surface.base": color.surface.base,
  "surface.raised": color.surface.raised,
  "surface.muted": color.surface.muted,
};

describe("tương phản màu của token", () => {
  for (const [name, bg] of Object.entries(surfaces)) {
    it(`text.primary trên ${name} đạt 4,5:1`, () => {
      expect(contrast(color.text.primary, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`text.secondary trên ${name} đạt 4,5:1`, () => {
      expect(contrast(color.text.secondary, bg)).toBeGreaterThanOrEqual(4.5);
    });
    it(`border.strong trên ${name} đạt 3:1`, () => {
      expect(contrast(color.border.strong, bg)).toBeGreaterThanOrEqual(3);
    });
    it(`vòng focus (brand.primary) trên ${name} đạt 3:1`, () => {
      expect(contrast(color.brand.primary, bg)).toBeGreaterThanOrEqual(3);
    });
  }

  for (const [name, fg] of Object.entries(color.status)) {
    it(`status.${name} làm chữ trên surface.raised đạt 4,5:1`, () => {
      expect(contrast(fg, color.surface.raised)).toBeGreaterThanOrEqual(4.5);
    });
  }

  const inverseBackgrounds = {
    "brand.primary": color.brand.primary,
    "brand.primary-hover": color.brand["primary-hover"],
    "brand.primary-active": color.brand["primary-active"],
    "status.danger": color.status.danger,
  };
  for (const [name, bg] of Object.entries(inverseBackgrounds)) {
    it(`text.inverse trên ${name} đạt 4,5:1`, () => {
      expect(contrast(color.text.inverse, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
