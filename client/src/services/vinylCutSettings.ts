/**
 * Vinyl Cutting Settings & Physical Constraints Store
 *
 * Manages physical tolerances and auto-remediation behaviors for blade plotters
 * (Cricut, Silhouette, Roland) cutting adhesive or HTV vinyl.
 */

export type VinylPreset = 'standard_adhesive' | 'htv_iron_on' | 'fine_detail_vinyl' | 'custom';

export interface VinylCutSettings {
  preset: VinylPreset;

  // Physical geometry constraints (in millimeters)
  minFeatureSizeMm: number;     // Minimum diameter/width of an isolated path/cutout (default: 1.5mm)
  minGapSizeMm: number;         // Minimum clearance gap between adjacent cut paths (default: 1.1mm)
  minAreaMm2: number;           // Minimum enclosed polygon surface area (default: 2.25mm²)
  cornerFilletRadiusMm: number; // Corner rounding radius to prevent blade snags (default: 0.25mm)

  // Automated Optimization Options
  autoRemoveSpecks: boolean;    // Prune paths with area < minAreaMm2
  autoBridgeGaps: boolean;      // Close gaps narrower than minGapSizeMm
  autoThickenThinLines: boolean;// Dilate narrow strokes to satisfy minFeatureSizeMm
  autoFilletCorners: boolean;   // Convert sharp corners into tangent arcs

  // Viewport / Feedback
  enableWeedCheckOverlay: boolean; // Show canvas diagnostic heatmap overlay
}

export interface PresetDetails {
  name: string;
  badge: string;
  description: string;
  bladeType: string;
  settings: Omit<VinylCutSettings, 'preset' | 'enableWeedCheckOverlay'>;
}

export const VINYL_PRESETS: Record<Exclude<VinylPreset, 'custom'>, PresetDetails> = {
  standard_adhesive: {
    name: 'Standard Adhesive Vinyl',
    badge: 'Oracal 651 / Cricut Premium',
    description: 'Standard 3mil permanent or removable craft vinyl for car decals, mugs, and signs.',
    bladeType: 'Fine Point 45° Blade',
    settings: {
      minFeatureSizeMm: 1.5,
      minGapSizeMm: 1.1,
      minAreaMm2: 2.25,
      cornerFilletRadiusMm: 0.25,
      autoRemoveSpecks: true,
      autoBridgeGaps: true,
      autoThickenThinLines: true,
      autoFilletCorners: true
    }
  },
  htv_iron_on: {
    name: 'HTV Iron-On Vinyl',
    badge: 'Heat Transfer / Apparel',
    description: 'Iron-on vinyl for t-shirts & fabrics. Requires sturdy features to prevent peel in laundry wash cycles.',
    bladeType: 'Fine Point 45° Blade',
    settings: {
      minFeatureSizeMm: 1.8,
      minGapSizeMm: 1.3,
      minAreaMm2: 3.24,
      cornerFilletRadiusMm: 0.30,
      autoRemoveSpecks: true,
      autoBridgeGaps: true,
      autoThickenThinLines: true,
      autoFilletCorners: true
    }
  },
  fine_detail_vinyl: {
    name: 'Fine Detail Vinyl',
    badge: 'Cast Vinyl / 60° Blade',
    description: 'High-performance cast vinyl with a steep 60° deep-point blade for intricate mandala or micro-letter cuts.',
    bladeType: 'Deep Point 60° Blade',
    settings: {
      minFeatureSizeMm: 0.8,
      minGapSizeMm: 0.7,
      minAreaMm2: 0.80,
      cornerFilletRadiusMm: 0.15,
      autoRemoveSpecks: true,
      autoBridgeGaps: true,
      autoThickenThinLines: true,
      autoFilletCorners: true
    }
  }
};

export const DEFAULT_VINYL_SETTINGS: VinylCutSettings = {
  preset: 'standard_adhesive',
  minFeatureSizeMm: 1.5,
  minGapSizeMm: 1.1,
  minAreaMm2: 2.25,
  cornerFilletRadiusMm: 0.25,
  autoRemoveSpecks: true,
  autoBridgeGaps: true,
  autoThickenThinLines: true,
  autoFilletCorners: true,
  enableWeedCheckOverlay: false
};

const STORAGE_KEY = 'craftly_vinyl_cut_settings';

export function getStoredVinylSettings(): VinylCutSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_VINYL_SETTINGS,
        ...parsed
      };
    }
  } catch (err) {
    console.warn('[VinylCutSettings] Failed to parse stored settings:', err);
  }
  return { ...DEFAULT_VINYL_SETTINGS };
}

export function setStoredVinylSettings(settings: VinylCutSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('craftly:vinyl-settings-changed', { detail: settings }));
  } catch (err) {
    console.warn('[VinylCutSettings] Failed to persist settings:', err);
  }
}
