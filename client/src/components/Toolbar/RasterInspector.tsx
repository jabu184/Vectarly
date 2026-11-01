import React, { useState, useEffect } from 'react';
import {
  Wand2,
  Scissors,
  Sliders,
  Sparkles,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { CropType } from '../../hooks/useFabricCanvas';

interface RasterInspectorProps {
  onRemoveBackground: () => Promise<void>;
  isRemovingBg: boolean;
  bgProgress: number;
  bgStatusText: string;
  // Cropping Suite (Optional / handled via top Action Bar)
  activeCropType?: CropType;
  lassoPointsCount?: number;
  onStartRectCrop?: (ratio?: 'free' | '1:1' | '4:5' | '16:9') => void;
  onStartCircleCrop?: () => void;
  onStartLassoCrop?: (type: 'lasso-freehand' | 'lasso-polygon') => void;
  onApplyCrop?: (action?: 'crop' | 'erase') => void;
  onCancelCrop?: () => void;
  onVectorize: (options: {
    mode: 'spline' | 'polygon';
    hierarchical: 'cutout' | 'stacked';
    filterSpeckle: number;
    colorPrecision: number;
    maxColors: number;
    simplify: number;
  }) => void;
  isVectorizing: boolean;
  hasImage: boolean;
  onResetArtwork?: () => void;
}

export const RasterInspector: React.FC<RasterInspectorProps> = ({
  onRemoveBackground,
  isRemovingBg,
  bgProgress,
  bgStatusText,
  activeCropType = 'none',
  onVectorize,
  isVectorizing,
  hasImage,
  onResetArtwork
}) => {
  const [mode, setMode] = useState<'spline' | 'polygon'>('spline');
  const [hierarchical, setHierarchical] = useState<'cutout' | 'stacked'>('cutout');
  const [filterSpeckle, setFilterSpeckle] = useState<number>(4);
  const [colorPrecision, setColorPrecision] = useState<number>(7);
  const [maxColors] = useState<number>(12);
  const [simplify] = useState<number>(1.5);

  // Nestable / Collapsible RHS Cards: default nested (collapsed)
  const [isBgStripperOpen, setIsBgStripperOpen] = useState<boolean>(false);
  const [isVectorParamsOpen, setIsVectorParamsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isRemovingBg) {
      setIsBgStripperOpen(true);
    }
  }, [isRemovingBg]);

  const isCroppingActive = activeCropType !== 'none';

  const handleVectorizeClick = () => {
    onVectorize({
      mode,
      hierarchical,
      filterSpeckle,
      colorPrecision,
      maxColors,
      simplify
    });
  };

  return (
    <div className="w-80 lg:w-96 bg-white border-l border-craft-border h-full flex flex-col justify-between overflow-y-auto p-4 space-y-5">
      <div className="space-y-5">
        {/* Title */}
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Scissors className="w-4 h-4" />
              </span>
              <h3 className="font-extrabold text-sm text-craft-text">Raster Studio &amp; Import</h3>
            </div>
            {onResetArtwork && (
              <button
                onClick={onResetArtwork}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                title="Reset raster image back to original"
              >
                <RotateCcw className="w-3 h-3 text-amber-500" />
                <span>Reset</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-craft-muted mt-0.5">
            Strip backgrounds and tune VTracer vectorization before cutting
          </p>
        </div>

        {/* Phase 2A: Client-Side Background Stripper (Collapsible / Default Nested) */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsBgStripperOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-pink-100/70 text-pink-600">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-craft-text">AI Background Stripper</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] bg-pink-100/70 text-pink-700 px-2 py-0.5 rounded-full font-bold">
                @imgly WASM
              </span>
              {isBgStripperOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isBgStripperOpen && (
            <div className="p-4 pt-0 border-t border-slate-200/60 space-y-3 animate-in fade-in duration-150">
              <p className="text-[11px] text-craft-muted leading-relaxed pt-2">
                Strips solid or complex backgrounds locally in browser using WebAssembly neural inference.
              </p>

              <button
                onClick={onRemoveBackground}
                disabled={isRemovingBg || !hasImage || isCroppingActive}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs shadow-md shadow-pink-100 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isRemovingBg ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Stripping Background ({bgProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>Remove Background Now</span>
                  </>
                )}
              </button>

              {isRemovingBg && (
                <div className="space-y-1.5 pt-1">
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-pink-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${bgProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">{bgStatusText}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Phase 3: VTracer Cricut Cutting Tuning (Collapsible / Default Nested) */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsVectorParamsOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                <Sliders className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-craft-text">Cricut Vector Parameters</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                vtracer WASM
              </span>
              {isVectorParamsOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isVectorParamsOpen && (
            <div className="p-4 pt-0 border-t border-slate-200/60 space-y-3.5 animate-in fade-in duration-150">
              <div className="pt-2">
                {/* Mode: Spline vs Polygon */}
                <div>
                  <div className="flex justify-between text-xs font-medium text-craft-text mb-1">
                    <span>Curve Mode</span>
                    <span className="text-indigo-600 font-mono font-bold capitalize">{mode}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMode('spline')}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        mode === 'spline'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      Spline (Smooth)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('polygon')}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        mode === 'polygon'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      Polygon (Sharp)
                    </button>
                  </div>
                </div>
              </div>

              {/* Hierarchical: Cutout vs Stacked */}
              <div>
                <div className="flex justify-between text-xs font-medium text-craft-text mb-1">
                  <span>Seam Layout</span>
                  <span className="text-emerald-600 font-mono font-bold capitalize">
                    {hierarchical === 'cutout' ? 'Cutout (No Overlaps)' : 'Stacked'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHierarchical('cutout')}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      hierarchical === 'cutout'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Cutout (Cricut)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHierarchical('stacked')}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      hierarchical === 'stacked'
                        ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Stacked
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Cutout generates seam-free, tessellated shapes without overlapping vinyl layers.
                </p>
              </div>

              {/* Filter Speckle Slider */}
              <div>
                <div className="flex justify-between text-xs font-medium text-craft-text mb-1">
                  <span>Filter Speckle (Chad Killer)</span>
                  <span className="text-indigo-600 font-mono font-bold">{filterSpeckle} px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  value={filterSpeckle}
                  onChange={(e) => setFilterSpeckle(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Color Precision Slider */}
              <div>
                <div className="flex justify-between text-xs font-medium text-craft-text mb-1">
                  <span>Color Precision (Vinyl Mats)</span>
                  <span className="text-indigo-600 font-mono font-bold">{colorPrecision} / 10</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="9"
                  value={colorPrecision}
                  onChange={(e) => setColorPrecision(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vectorize Action Button */}
      <div className="pt-3 border-t border-slate-100">
        <button
          onClick={handleVectorizeClick}
          disabled={isVectorizing || !hasImage || isCroppingActive}
          className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isVectorizing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Vectorizing with VTracer...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Convert to SVG Vectors</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
