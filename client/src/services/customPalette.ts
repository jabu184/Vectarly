const STORAGE_KEY = 'craftly_custom_palette';

export const DEFAULT_CUSTOM_PALETTE: string[] = [
  '#E11D48', // Crimson Rose
  '#2563EB', // Royal Blue
  '#059669', // Emerald Green
  '#D97706', // Amber Gold
  '#7C3AED', // Vivid Violet
  '#0891B2', // Deep Cyan
  '#475569', // Slate
  '#DB2777'  // Magenta Pink
];

/**
 * Retrieves the stored custom color palette from localStorage.
 * Falls back to DEFAULT_CUSTOM_PALETTE on first load.
 */
export function getStoredCustomColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .map((c) => String(c).trim().toUpperCase())
          .filter((c) => /^#[0-9A-F]{6}$/i.test(c));
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Failed to load custom palette from localStorage:', err);
  }
  return [...DEFAULT_CUSTOM_PALETTE];
}

/**
 * Saves the custom color palette to localStorage.
 */
export function setStoredCustomColors(colors: string[]): void {
  try {
    const cleaned = Array.from(
      new Set(
        colors
          .map((c) => String(c).trim().toUpperCase())
          .filter((c) => /^#[0-9A-F]{6}$/i.test(c))
      )
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } catch (err) {
    console.warn('Failed to save custom palette to localStorage:', err);
  }
}
