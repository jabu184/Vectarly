import React from 'react';
import {
  Undo2,
  Redo2,
  Crop,
  Circle as CircleIcon,
  Scissors,
  Wand2,
  Check,
  X,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Layers,
  PenTool,
  Paintbrush,
  Eraser,
  PaintBucket,
  Columns
} from 'lucide-react';
import type { CanvasMode, CropType, BrushMode } from '../../hooks/useFabricCanvas';
import { areColorsMatching } from '../../services/colorUtils';

interface StudioActionBarProps {
  mode: CanvasMode;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetArtwork?: () => void;
  // Cropping
  activeCropType: CropType;
  lassoPointsCount: number;
  onStartRectCrop: (ratio?: 'free' | '1:1' | '4:5' | '16:9') => void;
  onStartCircleCrop: () => void;
  onStartLassoCrop: (type: 'lasso-freehand' | 'lasso-polygon') => void;
  onApplyCrop: (action?: 'crop' | 'erase') => void;
  onCancelCrop: () => void;
  onRemoveBackground: () => void;
  isRemovingBg: boolean;
  hasImage: boolean;
  hasVector?: boolean;
  // Vector Brush & Eraser
  brushMode?: BrushMode;
  onSetBrushMode?: (mode: BrushMode) => void;
  brushSize?: number;
  onSetBrushSize?: (size: number) => void;
  activeBrushColor?: string;
  onSelectBrushColor?: (color: string) => void;
  colorLayers?: { color: string; count: number; visible: boolean }[];
  // Zoom
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export const StudioActionBar: React.FC<StudioActionBarProps> = ({
  mode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetArtwork,
  activeCropType,
  lassoPointsCount,
  onStartRectCrop,
  onStartCircleCrop,
  onStartLassoCrop,
  onApplyCrop,
  onCancelCrop,
  onRemoveBackground,
  isRemovingBg,
  hasImage,
  hasVector = false,
  brushMode = 'none',
  onSetBrushMode,
  brushSize = 20,
  onSetBrushSize,
  activeBrushColor = '#000000',
  onSelectBrushColor,
  colorLayers = [],
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom
}) => {
  const isCroppingActive = activeCropType !== 'none';
  const isBrushActive = brushMode !== 'none';
  const hasContent = hasImage || hasVector;

  return (
    <div className="h-12 bg-white border-b border-craft-border px-4 flex items-center justify-between text-xs z-20 shrink-0 shadow-2xs">
      {/* Left: Undo / Redo / Reset & Mode Pill */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white hover:text-indigo-600 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
            <kbd className="hidden md:inline text-[9px] bg-slate-200/80 text-slate-500 px-1 rounded font-mono">⌘Z</kbd>
          </button>

          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white hover:text-indigo-600 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Redo</span>
            <kbd className="hidden md:inline text-[9px] bg-slate-200/80 text-slate-500 px-1 rounded font-mono">⌘Y</kbd>
          </button>

          {onResetArtwork && (
            <>
              <div className="h-3 w-px bg-slate-300 mx-0.5" />
              <button
                onClick={onResetArtwork}
                disabled={!hasContent}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white hover:text-amber-600 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Reset artwork back to original unmodified state"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Center: Cropping & Brush Tools or Active Action Strip */}
      <div className="flex items-center gap-2">
        {!isCroppingActive && !isBrushActive && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Cropping Group */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 border-r border-slate-200 hidden md:inline">
                {mode === 'vector' ? 'Vector Crop:' : 'Crop:'}
              </span>

              {/* Rectangle Crop */}
              <button
                onClick={() => onStartRectCrop('free')}
                disabled={!hasContent}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-indigo-600 transition-all disabled:opacity-50 cursor-pointer"
                title="Rectangle Crop Box"
              >
                <Crop className="w-3.5 h-3.5 text-indigo-600" />
                <span>Rectangle</span>
              </button>

              {/* Circle Crop */}
              <button
                onClick={onStartCircleCrop}
                disabled={!hasContent}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-pink-600 transition-all disabled:opacity-50 cursor-pointer"
                title="Round / Circle Mask Crop"
              >
                <CircleIcon className="w-3.5 h-3.5 text-pink-500" />
                <span>Circle</span>
              </button>

              {/* Freehand Lasso */}
              <button
                onClick={() => onStartLassoCrop('lasso-freehand')}
                disabled={!hasContent}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-amber-600 transition-all disabled:opacity-50 cursor-pointer"
                title="Freehand Lasso (Draw custom boundary to isolate or erase)"
              >
                <Scissors className="w-3.5 h-3.5 text-amber-500" />
                <span>Lasso</span>
              </button>

              {/* Polygon Lasso */}
              <button
                onClick={() => onStartLassoCrop('lasso-polygon')}
                disabled={!hasContent}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-emerald-600 transition-all disabled:opacity-50 cursor-pointer"
                title="Polygon Lasso (Click points to define crop shape)"
              >
                <span className="text-emerald-600 font-bold font-mono">⬡</span>
                <span className="hidden xl:inline">Polygon</span>
              </button>

              {mode === 'raster' && (
                <>
                  <div className="h-4 w-px bg-slate-200 mx-0.5"></div>
                  {/* AI Remove BG */}
                  <button
                    onClick={onRemoveBackground}
                    disabled={!hasImage || isRemovingBg}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold bg-pink-500 hover:bg-pink-600 text-white shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                    title="Instant AI Background Stripper"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Remove BG</span>
                  </button>
                </>
              )}
            </div>

            {/* Brush & Eraser Group (Vector Mode) */}
            {mode === 'vector' && onSetBrushMode && (
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 border-r border-slate-200 hidden md:inline">
                  Tools:
                </span>

                <button
                  onClick={() => onSetBrushMode('paint')}
                  disabled={!hasVector}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-indigo-600 transition-all disabled:opacity-50 cursor-pointer"
                  title="Paint Brush: Add vector areas to active vinyl mat"
                >
                  <Paintbrush className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Paint</span>
                </button>

                <button
                  onClick={() => onSetBrushMode('erase')}
                  disabled={!hasVector}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-rose-600 transition-all disabled:opacity-50 cursor-pointer"
                  title="Eraser Brush: Erase vector cuts from active vinyl mat"
                >
                  <Eraser className="w-3.5 h-3.5 text-rose-500" />
                  <span>Erase</span>
                </button>

                <button
                  onClick={() => onSetBrushMode('fill')}
                  disabled={!hasVector}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-slate-700 hover:bg-white hover:text-amber-600 transition-all disabled:opacity-50 cursor-pointer"
                  title="Fill Tool: Fill closed vector loops on the selected layer"
                >
                  <PaintBucket className="w-3.5 h-3.5 text-amber-500" />
                  <span>Fill</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* When Brush Tool is Active: Dedicated High-Visibility Brush Control Strip */}
        {isBrushActive && (
          <div className="flex items-center gap-2 bg-indigo-50/95 border border-indigo-200 px-3 py-1 rounded-xl animate-in zoom-in-95 shadow-xs">
            {/* Paint / Erase / Fill Toggle */}
            <div className="flex items-center bg-white p-0.5 rounded-lg border border-indigo-200 shadow-2xs">
              <button
                onClick={() => onSetBrushMode && onSetBrushMode('paint')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  brushMode === 'paint'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-indigo-600'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Paint</span>
              </button>
              <button
                onClick={() => onSetBrushMode && onSetBrushMode('erase')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  brushMode === 'erase'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-rose-600'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>
              <button
                onClick={() => onSetBrushMode && onSetBrushMode('fill')}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  brushMode === 'fill'
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-amber-600'
                }`}
                title="Fill closed vector loops"
              >
                <PaintBucket className="w-3.5 h-3.5" />
                <span>Fill</span>
              </button>
            </div>

            {brushMode === 'fill' ? (
              <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs">
                <PaintBucket className="w-3.5 h-3.5 text-amber-600" />
                <span>Click any closed vector loop on the selected layer to fill</span>
              </span>
            ) : (
              <>
                <div className="h-4 w-px bg-indigo-200"></div>

                {/* Adjustable Brush Size Slider */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-900 uppercase">Size:</span>
                  <input
                    type="range"
                    min={4}
                    max={100}
                    step={2}
                    value={brushSize}
                    onChange={(e) => onSetBrushSize && onSetBrushSize(Number(e.target.value))}
                    className="w-16 sm:w-24 h-1.5 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    title="Adjust Brush Diameter ([ to decrease, ] to increase)"
                  />
                  <span className="text-[10px] font-mono font-bold bg-white text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded min-w-[34px] text-center shadow-2xs">
                    {brushSize}px
                  </span>
                </div>

                {/* Quick Size Presets */}
                <div className="hidden md:flex items-center gap-1">
                  {[8, 20, 40, 70].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => onSetBrushSize && onSetBrushSize(sz)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded font-bold transition-all cursor-pointer ${
                        brushSize === sz
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-indigo-100 hover:text-indigo-800 border border-slate-200'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="h-4 w-px bg-indigo-200"></div>

            {/* Active Mat Swatch Selector */}
            {colorLayers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">Layer:</span>
                <div className="flex items-center gap-1">
                  {colorLayers.map((l) => {
                    const isSelected = areColorsMatching(activeBrushColor, l.color);
                    return (
                      <button
                        key={l.color}
                        onClick={() => onSelectBrushColor && onSelectBrushColor(l.color)}
                        className={`w-4 h-4 rounded-full border transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-indigo-500 ring-offset-1 scale-110 border-white'
                            : 'border-slate-300 opacity-60 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: l.color }}
                        title={`Select Layer ${l.color}`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="h-4 w-px bg-indigo-200"></div>

            {/* Done / Exit Brush Mode */}
            <button
              onClick={() => onSetBrushMode && onSetBrushMode('none')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
              title="Done / Exit Brush Mode (Esc)"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
          </div>
        )}

        {/* When Cropping is Active: High-Visibility Non-Overlapping Action Strip */}
        {isCroppingActive && (
          <div className="flex items-center gap-2 bg-indigo-50/90 border border-indigo-200 px-3 py-1 rounded-xl animate-in zoom-in-95">
            <div className="flex items-center gap-1.5 text-indigo-900 font-bold">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
              <span className="capitalize">{activeCropType.replace('-', ' ')} Active</span>
              {activeCropType.startsWith('lasso') && (
                <span className="text-[10px] bg-white text-indigo-700 px-1.5 rounded font-mono font-normal">
                  {lassoPointsCount} pts
                </span>
              )}
            </div>

            <div className="h-4 w-px bg-indigo-200"></div>

            {/* Apply Crop */}
            <button
              onClick={() => onApplyCrop('crop')}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition-all active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Crop</span>
            </button>

            {/* If Lasso, Erase Selection */}
            {activeCropType.startsWith('lasso') && (
              <button
                onClick={() => onApplyCrop('erase')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-pink-50 text-pink-700 border border-pink-200 font-bold transition-all"
                title="Erase pixels inside lasso"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Erase Selection</span>
              </button>
            )}

            {/* Cancel Crop */}
            <button
              onClick={onCancelCrop}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white transition-colors"
              title="Cancel crop"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right: Zoom Controls */}
      <div className="flex items-center gap-1">
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <button
            onClick={onZoomOut}
            className="p-1 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-white font-mono rounded-md transition-colors"
            title="Reset zoom to 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            className="p-1 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
