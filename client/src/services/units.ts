/**
 * Units & Measurement Conversion Utilities for Craftly Cricut Studio
 *
 * Screen standard: 96 CSS pixels = 1 inch
 * 1 inch = 2.54 centimeters
 * 1 cm = 37.79527559 pixels
 */

export type MeasurementUnit = 'in' | 'cm';
export const MeasurementUnit = {
  INCH: 'in' as const,
  CM: 'cm' as const
};

export const PIXELS_PER_INCH = 96;
export const PIXELS_PER_CM = 96 / 2.54; // ~37.795

export function getStoredUnits(): MeasurementUnit {
  try {
    const val = localStorage.getItem('craftly_measurement_units');
    if (val === 'cm' || val === 'in') return val;
  } catch (e) {
    // Ignore storage errors
  }
  return 'in';
}

export function setStoredUnits(unit: MeasurementUnit): void {
  try {
    localStorage.setItem('craftly_measurement_units', unit);
  } catch (e) {
    // Ignore storage errors
  }
}

export function pxToUnits(px: number, unit: MeasurementUnit, precision = 2): number {
  if (unit === 'cm') {
    return Number((px / PIXELS_PER_CM).toFixed(precision));
  }
  return Number((px / PIXELS_PER_INCH).toFixed(precision));
}

export function formatDimension(px: number, unit: MeasurementUnit): string {
  const val = pxToUnits(px, unit);
  return `${val}${unit === 'in' ? '"' : ' cm'}`;
}
