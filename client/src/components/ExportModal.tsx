import React, { useState } from 'react';
import {
  X,
  FileCode2,
  Image as ImageIcon,
  FileText,
  PenTool,
  Sliders,
  CheckCircle2,
  Info,
  Sparkles,
  Download,
  Layers,
  Scissors,
  Wand2,
  ShieldCheck
} from 'lucide-react';
import {
  type PenSizePreset,
  type PenInfillOptions,
  getEffectivePenWidthMm,
  getEffectivePenWidthPx,
  PEN_PRESET_LABELS,
  MM_TO_PX
} from '../services/penInfill';
import {
  type VinylCutSettings,
  getStoredVinylSettings
} from '../services/vinylCutSettings';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportSvg: (options?: {
    isLineArt?: boolean;
    groupColorsIntoMats?: boolean;
    penInfill?: PenInfillOptions;
    vinylRemediation?: {
      enabled: boolean;
      settings?: VinylCutSettings;
    };
  }) => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  isLineArtActive?: boolean;
  matsCount?: number;
  vinylSettings?: VinylCutSettings;
}

export type ExportFormat = 'cricut-svg' | 'pen-draw' | 'png' | 'pdf';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExportSvg,
  onExportPng,
  onExportPdf,
  isLineArtActive = false,
  matsCount = 1,
  vinylSettings: propVinylSettings
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('cricut-svg');

  // Vinyl Optimization State
  const [remediateVinyl, setRemediateVinyl] = useState<boolean>(true);
  const activeVinylSettings = propVinylSettings || getStoredVinylSettings();

  // Pen Infill UI State
  const [generateInfill, setGenerateInfill] = useState<boolean>(false);
  const [penSizePreset, setPenSizePreset] = useState<PenSizePreset>('0.4mm');
  const [customPenWidthMm, setCustomPenWidthMm] = useState<number>(0.4);
  const [overlapFactor, setOverlapFactor] = useState<number>(0.92);
  const [showAdvancedOverlap, setShowAdvancedOverlap] = useState<boolean>(false);
  const [separateColorsByMat, setSeparateColorsByMat] = useState<boolean>(true);

  if (!isOpen) return null;

  const effectiveMm = getEffectivePenWidthMm(penSizePreset, customPenWidthMm);
  const effectivePx = getEffectivePenWidthPx(penSizePreset, customPenWidthMm);
  const hatchSpacingMm = effectiveMm * overlapFactor;
  const hatchSpacingPx = effectivePx * overlapFactor;
  const overlapPercent = Math.round((1 - overlapFactor) * 100);

  const handleDownload = () => {
    if (selectedFormat === 'cricut-svg') {
      onExportSvg({
        isLineArt: false,
        groupColorsIntoMats: true,
        vinylRemediation: {
          enabled: remediateVinyl,
          settings: activeVinylSettings
        },
        penInfill: {
          enabled: generateInfill,
          penSizePreset,
          customPenWidthMm,
          overlapFactor
        }
      });
    } else if (selectedFormat === 'pen-draw') {
      onExportSvg({
        isLineArt: !separateColorsByMat,
        groupColorsIntoMats: separateColorsByMat,
        vinylRemediation: {
          enabled: false
        },
        penInfill: {
          enabled: generateInfill,
          penSizePreset,
          customPenWidthMm,
          overlapFactor
        }
      });
    } else if (selectedFormat === 'png') {
      onExportPng();
    } else if (selectedFormat === 'pdf') {
      onExportPdf();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Download className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-base text-craft-text">Export Production Files</h3>
              <p className="text-xs text-craft-muted">
                100% verified Cricut Design Space &amp; Craft Studio formats
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Format Selection Cards */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 block">
              1. Choose Export Format
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* Cricut SVG Cut */}
              <button
                type="button"
                onClick={() => setSelectedFormat('cricut-svg')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  selectedFormat === 'cricut-svg'
                    ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    selectedFormat === 'cricut-svg' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <FileCode2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-xs text-craft-text">Cricut SVG Vector</p>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                      Standard
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Separated into {matsCount} cutting mats
                  </p>
                </div>
              </button>

              {/* Cricut Pen Draw (Line Art) */}
              <button
                type="button"
                onClick={() => {
                  setSelectedFormat('pen-draw');
                  setGenerateInfill(true); // Default infill on for pen drawing!
                }}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  selectedFormat === 'pen-draw'
                    ? 'border-amber-600 bg-amber-50/60 ring-2 ring-amber-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    selectedFormat === 'pen-draw' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <PenTool className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-xs text-craft-text">Cricut Pen Draw</p>
                    <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                      Pen Tool
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Outlines + Hatch Infill for Cricut Pens
                  </p>
                </div>
              </button>

              {/* 300 DPI PNG */}
              <button
                type="button"
                onClick={() => setSelectedFormat('png')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  selectedFormat === 'png'
                    ? 'border-pink-600 bg-pink-50/60 ring-2 ring-pink-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    selectedFormat === 'png' ? 'bg-pink-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-craft-text">Print Then Cut PNG</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">High-Res 300 DPI (Transparent)</p>
                </div>
              </button>

              {/* 300 DPI PDF */}
              <button
                type="button"
                onClick={() => setSelectedFormat('pdf')}
                className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  selectedFormat === 'pdf'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-200'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-2 rounded-xl ${
                    selectedFormat === 'pdf' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-craft-text">Print &amp; Cut PDF</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">12&quot;x12&quot; Cricut Mat Template</p>
                </div>
              </button>
            </div>
          </div>

          {/* Vinyl Cutting Detail Validation & Remediation Options */}
          {selectedFormat === 'cricut-svg' && (
            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-600 text-white mt-0.5">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <div>
                    <label
                      htmlFor="remediateVinylToggle"
                      className="font-bold text-xs text-indigo-950 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Vinyl Cutting Geometry Remediation</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded font-mono">
                        {activeVinylSettings.preset.replace('_', ' ').toUpperCase()}
                      </span>
                    </label>
                    <p className="text-[11px] text-indigo-900/80 leading-tight mt-0.5">
                      Prunes loose specks, bridges tight weeding gaps, and fillets sharp corners for clean blade cuts.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    id="remediateVinylToggle"
                    type="checkbox"
                    checked={remediateVinyl}
                    onChange={(e) => setRemediateVinyl(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {remediateVinyl && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-indigo-200/60 text-[10px] text-indigo-900">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Drop specks &lt; {activeVinylSettings.minAreaMm2} mm²</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Bridge gaps &lt; {activeVinylSettings.minGapSizeMm} mm</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Dilate thin lines &lt; {activeVinylSettings.minFeatureSizeMm} mm</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>Fillet corners (r = {activeVinylSettings.cornerFilletRadiusMm} mm)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pen Color Layer Mode (Multi-Color Pens vs Single Black Layer) */}
          {selectedFormat === 'pen-draw' && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-2 text-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-950 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pen Drawing Layers</span>
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                  {separateColorsByMat ? `${matsCount} Color Layers` : '1 Monochrome Layer'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setSeparateColorsByMat(true)}
                  className={`py-2 px-3 rounded-xl text-left border text-xs transition-all cursor-pointer ${
                    separateColorsByMat
                      ? 'bg-white border-amber-500 text-amber-950 shadow-xs ring-1 ring-amber-300'
                      : 'bg-white/60 border-slate-200 text-slate-500 hover:bg-white'
                  }`}
                >
                  <p className="font-bold">Multi-Color Pens</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">1 layer for each color ({matsCount} mats)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setSeparateColorsByMat(false)}
                  className={`py-2 px-3 rounded-xl text-left border text-xs transition-all cursor-pointer ${
                    !separateColorsByMat
                      ? 'bg-white border-amber-500 text-amber-950 shadow-xs ring-1 ring-amber-300'
                      : 'bg-white/60 border-slate-200 text-slate-500 hover:bg-white'
                  }`}
                >
                  <p className="font-bold">Single Black Pen</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">1 single black ink layer</p>
                </button>
              </div>
            </div>
          )}

          {/* Pen Size & Infill Overlap Ratio Settings (Available for SVG & Pen formats) */}
          {(selectedFormat === 'cricut-svg' || selectedFormat === 'pen-draw') && (
            <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-4.5 space-y-4">
              {/* Toggle Generate Pen Infill */}
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-100/70 text-amber-700 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <label
                      htmlFor="penInfillToggle"
                      className="font-bold text-xs text-craft-text cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Generate Pen Infill</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-1.5 py-0.2 rounded">
                        Solid Ink Hatching
                      </span>
                    </label>
                    <p className="text-[11px] text-craft-muted leading-tight mt-0.5">
                      Fills closed shapes with vector hatch lines so your Cricut pen colors in solid artwork.
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    id="penInfillToggle"
                    type="checkbox"
                    checked={generateInfill}
                    onChange={(e) => setGenerateInfill(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Infill Controls (Active when toggle is checked) */}
              {generateInfill && (
                <div className="pt-3 border-t border-slate-200/80 space-y-4 animate-in fade-in slide-in-from-top-1">
                  {/* Pen Size Preset Dropdown */}
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-craft-text mb-1.5">
                      <span>Pen Tip Diameter (`penSizePreset`)</span>
                      <span className="font-mono text-indigo-600 font-bold">
                        {effectiveMm.toFixed(2)} mm ({effectivePx.toFixed(2)} px)
                      </span>
                    </div>

                    <select
                      value={penSizePreset}
                      onChange={(e) => setPenSizePreset(e.target.value as PenSizePreset)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:outline-indigo-500 cursor-pointer"
                    >
                      <option value="0.3mm">0.3mm (Extra Fine Point)</option>
                      <option value="0.4mm">0.4mm (Fine Point - Default Cricut Pen)</option>
                      <option value="0.8mm">0.8mm (Gel Pen)</option>
                      <option value="1.0mm">1.0mm (Marker / Felt Tip)</option>
                      <option value="custom">Custom (Manual Tip Diameter)</option>
                    </select>
                  </div>

                  {/* Custom Pen Width Slider (When preset === 'custom') */}
                  {penSizePreset === 'custom' && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5 animate-in fade-in">
                      <div className="flex justify-between text-xs font-medium text-slate-700">
                        <span>Custom Pen Width (`customPenWidthMm`)</span>
                        <span className="font-mono font-bold text-indigo-600">
                          {customPenWidthMm.toFixed(2)} mm
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.20"
                        max="2.50"
                        step="0.05"
                        value={customPenWidthMm}
                        onChange={(e) => setCustomPenWidthMm(parseFloat(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>0.20 mm</span>
                        <span>1.35 mm</span>
                        <span>2.50 mm</span>
                      </div>
                    </div>
                  )}

                  {/* Overlap Factor & Formula Breakdown */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-craft-text flex items-center gap-1">
                        <span>Infill Overlap Factor (`overlapFactor`)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedOverlap(!showAdvancedOverlap)}
                        className="text-[11px] text-indigo-600 hover:underline font-bold flex items-center gap-1"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>{showAdvancedOverlap ? 'Hide Details' : 'Adjust (0.90–0.95)'}</span>
                      </button>
                    </div>

                    {showAdvancedOverlap && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1.5 animate-in fade-in">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Overlap Ratio</span>
                          <span className="font-mono font-bold text-indigo-600">
                            {overlapFactor.toFixed(2)} ({overlapPercent}% Overlap)
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.70"
                          max="1.00"
                          step="0.01"
                          value={overlapFactor}
                          onChange={(e) => setOverlapFactor(parseFloat(e.target.value))}
                          className="w-full accent-indigo-600 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                          <span>0.70 (30% Dense)</span>
                          <span>0.92 (Recommended)</span>
                          <span>1.00 (Zero Overlap)</span>
                        </div>
                      </div>
                    )}

                    {/* Explanatory Spec Note & Formula Banner */}
                    <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-100 text-[11px] text-indigo-900/90 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1.5 font-bold text-indigo-950">
                          <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Formula: hatchSpacing = penWidth × overlapFactor</span>
                        </p>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded flex items-center gap-1">
                          ⚡ Continuous Pen-Down
                        </span>
                      </div>
                      <p className="text-[10px] text-indigo-800/80 leading-relaxed">
                        Continuous serpentine plotting keeps the pen <strong>down on the paper</strong> across row turns,
                        eliminating 95%+ of mechanical servo pen lifts for much faster and quieter drawing.
                      </p>
                      <div className="pt-1 border-t border-indigo-200/60 flex items-center justify-between text-[10px] font-mono text-indigo-900">
                        <span>Hatch Spacing: <strong>{hatchSpacingMm.toFixed(2)}mm</strong> ({hatchSpacingPx.toFixed(1)}px)</span>
                        <span>SVG stroke-width: <strong>{effectivePx.toFixed(2)}px</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-100 transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>
              {selectedFormat === 'cricut-svg'
                ? generateInfill
                  ? 'Download SVG (with Infill)'
                  : 'Download Cricut SVG'
                : selectedFormat === 'pen-draw'
                ? generateInfill
                  ? 'Download Pen SVG (with Infill)'
                  : 'Download Pen Line Art'
                : selectedFormat === 'png'
                ? 'Download 300 DPI PNG'
                : 'Download Print PDF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
