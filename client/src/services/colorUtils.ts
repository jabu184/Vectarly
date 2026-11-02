/**
 * Color Normalization and Comparison Utilities
 *
 * Normalizes all color formats (HTML color names, 3-digit hex, 6-digit hex,
 * 8-digit hex, rgb(), rgba()) into standard uppercase 6-digit hex (#RRGGBB) or 'transparent'.
 * Prevents color mismatch bugs between Fabric canvas objects and color layer palettes.
 */

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  yellow: '#FFFF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  silver: '#C0C0C0',
  gray: '#808080',
  grey: '#808080',
  maroon: '#800000',
  olive: '#808000',
  purple: '#800080',
  teal: '#008080',
  navy: '#000080',
  orange: '#FFA500',
  pink: '#FFC0CB',
  brown: '#A52A2A',
  gold: '#FFD700',
  coral: '#FF7F50',
  lime: '#00FF00',
  khaki: '#F0E68C',
  indigo: '#4B0082',
  tan: '#D2B48C',
  azure: '#F0FFFF',
  beige: '#F5F5DC',
  salmon: '#FA8072',
  violet: '#EE82EE',
  turquoise: '#40E0D0',
  crimson: '#DC143C',
  darkblue: '#00008B',
  lightblue: '#ADD8E6',
  darkgreen: '#006400',
  lightgreen: '#90EE90',
  darkgray: '#A9A9A9',
  lightgray: '#D3D3D3',
  darkgrey: '#A9A9A9',
  lightgrey: '#D3D3D3'
};

export function normalizeHexColor(rawColor: any): string {
  if (rawColor === undefined || rawColor === null) return 'transparent';
  if (typeof rawColor !== 'string') return 'transparent';

  const c = rawColor.trim();
  if (!c || c.toLowerCase() === 'none' || c.toLowerCase() === 'transparent') {
    return 'transparent';
  }

  const lower = c.toLowerCase();
  if (NAMED_COLORS[lower]) {
    return NAMED_COLORS[lower];
  }

  // 6-digit hex: #RRGGBB
  const match6 = /^#([0-9a-fA-F]{6})$/.exec(c);
  if (match6) {
    return c.toUpperCase();
  }

  // 3-digit hex: #RGB -> #RRGGBB
  const match3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(c);
  if (match3) {
    return `#${match3[1]}${match3[1]}${match3[2]}${match3[2]}${match3[3]}${match3[3]}`.toUpperCase();
  }

  // 8-digit hex: #RRGGBBAA
  const match8 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(c);
  if (match8) {
    const alpha = parseInt(match8[2], 16);
    if (alpha <= 12) return 'transparent';
    return `#${match8[1]}`.toUpperCase();
  }

  // 4-digit hex: #RGBA
  const match4 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(c);
  if (match4) {
    const alpha = parseInt(match4[4], 16);
    if (alpha === 0) return 'transparent';
    return `#${match4[1]}${match4[1]}${match4[2]}${match4[2]}${match4[3]}${match4[3]}`.toUpperCase();
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i.exec(c);
  if (rgbMatch) {
    if (rgbMatch[4] !== undefined) {
      const alpha = parseFloat(rgbMatch[4]);
      if (alpha <= 0.05) return 'transparent';
    }
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10))).toString(16).padStart(2, '0');
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10))).toString(16).padStart(2, '0');
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10))).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`.toUpperCase();
  }

  return c.toUpperCase();
}

export function areColorsMatching(c1: any, c2: any): boolean {
  if (!c1 && !c2) return true;
  if (!c1 || !c2) return false;
  return normalizeHexColor(c1) === normalizeHexColor(c2);
}
