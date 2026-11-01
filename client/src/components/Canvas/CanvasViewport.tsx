import React, { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Scissors,
  Move,
  Ruler,
  Maximize2
} from 'lucide-react';
import type { CanvasMode, ContextMenuState, SelectionBounds } from '../../hooks/useFabricCanvas';
import { GenerationProgressOverlay } from './GenerationProgressOverlay';
import { CanvasRulers } from './CanvasRulers';
import { WeedCheckOverlay } from './WeedCheckOverlay';
import { CompareView } from '../Compare/CompareView';
import { type MeasurementUnit, formatDimension } from '../../services/units';
import { type VinylCutSettings, getStoredVinylSettings } from '../../services/vinylCutSettings';
import type { WeedCheckReport } from '../../services/vinylRemediation';

interface CanvasViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mode: CanvasMode;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  hasImage: boolean;
  hasVector: boolean;
  statusBanner?: {
    type: 'info' | 'warning' | 'success';
    message: string;
  } | null;
  onDismissBanner?: () => void;
  isLassoActive?: boolean;
  isGenerating?: boolean;
  activePrompt?: string;
  onInstantSample?: () => void;
  // Context Menu Props
  contextMenuState?: ContextMenuState;
  onCloseContextMenu?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onDeleteSelected?: () => void;
  onDuplicateSelected?: () => void;
  selectedColor?: string | null;
  selectedColors?: string[];
  onChangeSelectedColor?: (color: string) => void;
  onCombineSelected?: (targetColor?: string) => void;
  onSelectThisLayer?: (color: string) => void;
  onSelectSimilarColor?: (color: string) => void;
  onClearSelection?: () => void;
  // Live Bounding Box & Dimensions
  selectionBounds?: SelectionBounds | null;
  onSelectAllVectors?: () => void;
  // Measurement Units & Rulers
  units?: MeasurementUnit;
  onToggleUnits?: () => void;
  showRulers?: boolean;
  onToggleRulers?: () => void;
  cursorPos?: { x: number; y: number } | null;
  // Mat Background Preview (Display Only)
  matBackground?: 'transparent' | 'white' | 'black';
  onChangeMatBackground?: (bg: 'transparent' | 'white' | 'black') => void;
  // Vinyl Cutting Readiness & Weed Check Engine
  isWeedCheckActive?: boolean;
  onToggleWeedCheck?: () => void;
  weedCheckReport?: WeedCheckReport | null;
  onRemediateVinyl?: () => void;
  isRemediating?: boolean;
  vinylSettings?: VinylCutSettings;
  onOpenSettings?: () => void;
  viewportInfo?: {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
    vpt: number[];
  };
  // Vector Brush & Eraser & Fill
  brushMode?: 'none' | 'paint' | 'erase' | 'fill';
  brushSize?: number;
  activeBrushColor?: string;
  isResizingBrush?: boolean;
  brushResizePos?: { x: number; y: number } | null;
  compareData?: { rasterUrl: string | null; svgString: string | null };
  onSwitchToRaster?: () => void;
  onSwitchToVector?: () => void;
  onTriggerVectorize?: () => void;
  isVectorizing?: boolean;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  canvasRef,
  containerRef,
  mode = 'raster',
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  hasImage,
  hasVector,
  statusBanner,
  onDismissBanner,
  isLassoActive,
  isGenerating = false,
  activePrompt = '',
  onInstantSample,
  contextMenuState,
  onCloseContextMenu,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  onDeleteSelected,
  onDuplicateSelected,
  selectedColor,
  selectedColors,
  onChangeSelectedColor,
  onCombineSelected,
  onSelectThisLayer,
  onSelectSimilarColor,
  onClearSelection,
  selectionBounds,
  onSelectAllVectors,
  units = 'in',
  onToggleUnits,
  showRulers = true,
  onToggleRulers,
  cursorPos = null,
  matBackground = 'transparent',
  onChangeMatBackground,
  isWeedCheckActive = false,
  onToggleWeedCheck,
  weedCheckReport = null,
  onRemediateVinyl,
  isRemediating = false,
  vinylSettings,
  onOpenSettings,
  viewportInfo,
  brushMode = 'none',
  brushSize = 20,
  activeBrushColor = '#000000',
  isResizingBrush = false,
  brushResizePos = null,
  compareData,
  onSwitchToRaster,
  onSwitchToVector,
  onTriggerVectorize,
  isVectorizing = false
}) => {
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 700, height: 600 });
  const [brushPointerPos, setBrushPointerPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerDims({
          width: entry.contentRect.width || 700,
          height: entry.contentRect.height || 600
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef]);

  return (
    <div className="relative flex-1 h-full w-full overflow-hidden flex flex-col bg-slate-100">
      {/* Scale Bar Rulers (Top & Left) */}
      <CanvasRulers
        isVisible={showRulers}
        unit={units}
        onToggleUnit={onToggleUnits || (() => {})}
        zoomLevel={zoomLevel}
        canvasWidth={containerDims.width}
        canvasHeight={containerDims.height}
        cursorPos={cursorPos}
      />

      {/* Live AI Generation Progress Modal / Feedback */}
      <GenerationProgressOverlay
        isGenerating={isGenerating}
        prompt={activePrompt}
        onInstantSample={onInstantSample}
      />

      {/* Optional Top Toast / Notification */}
      {statusBanner && (
        <div className={`px-4 py-1.5 text-xs flex items-center justify-between z-20 shadow-2xs border-b transition-all ${
          statusBanner.type === 'warning'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : statusBanner.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-indigo-50 border-indigo-200 text-indigo-900'
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium">{statusBanner.message}</span>
          </div>
          {onDismissBanner && (
            <button
              onClick={onDismissBanner}
              className="font-bold opacity-60 hover:opacity-100 text-sm px-1.5 ml-2 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Live Measurement Floating Pill on Active Selection / Bounding Box / Resizing */}
      {selectionBounds && mode !== 'compare' && (
        <div
          style={{
            left: `${(showRulers ? 22 : 0) + selectionBounds.left + selectionBounds.width / 2}px`,
            top: `${
              selectionBounds.top < 38
                ? (showRulers ? 22 : 0) + selectionBounds.top + selectionBounds.height + 12
                : (showRulers ? 22 : 0) + selectionBounds.top - 28
            }px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none'
          }}
          className={`absolute z-30 font-mono text-[11px] font-bold px-3 py-1 rounded-full shadow-xl backdrop-blur-md flex items-center gap-2 border select-none transition-all duration-75 ${
            selectionBounds.isScaling
              ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/50 scale-105 shadow-indigo-500/30'
              : 'bg-slate-900/90 text-white border-slate-700/60 shadow-black/30'
          }`}
        >
          {selectionBounds.label && (
            <span
              className={`text-[10px] font-sans font-extrabold uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                selectionBounds.isScaling ? 'bg-indigo-700/80 text-indigo-100' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {selectionBounds.label}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="text-slate-400 font-sans text-[10px]">W:</span>
            <span>{formatDimension(selectionBounds.width, units)}</span>
          </span>
          <span className="opacity-40">&times;</span>
          <span className="flex items-center gap-1">
            <span className="text-slate-400 font-sans text-[10px]">H:</span>
            <span>{formatDimension(selectionBounds.height, units)}</span>
          </span>
        </div>
      )}

      {/* Floating Viewport & Display Controls (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-md p-1 gap-1 select-none">
        {/* Background Preview Mode Toggle (Display Only) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 mr-1">
          <button
            onClick={() => onChangeMatBackground && onChangeMatBackground('transparent')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              matBackground === 'transparent'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Transparent Background (Checkerboard preview)"
          >
            <span className="w-2.5 h-2.5 rounded-full border border-slate-300 cricut-grid-bg inline-block" />
            <span className="hidden sm:inline">Transp</span>
          </button>
          <button
            onClick={() => onChangeMatBackground && onChangeMatBackground('white')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              matBackground === 'white'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Solid White Mat Preview"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300 inline-block" />
            <span className="hidden sm:inline">White</span>
          </button>
          <button
            onClick={() => onChangeMatBackground && onChangeMatBackground('black')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              matBackground === 'black'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Solid Black Mat Preview (Ideal for white vinyl & line art)"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700 inline-block" />
            <span className="hidden sm:inline">Black</span>
          </button>
        </div>

        {/* Move Whole Vector / Select All */}
        {hasVector && onSelectAllVectors && (
          <button
            onClick={onSelectAllVectors}
            className="flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer mr-1"
            title="Select & move whole vector design (resizes all in proportion)"
          >
            <Move className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden md:inline">Move All</span>
          </button>
        )}

        {/* Weed Check Diagnostic Overlay Toggle */}
        {hasVector && onToggleWeedCheck && (
          <button
            onClick={onToggleWeedCheck}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer mr-1 ${
              isWeedCheckActive
                ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-400'
                : 'text-slate-700 hover:bg-rose-50 hover:text-rose-600'
            }`}
            title="Toggle Weed Check diagnostic heatmap overlay"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Weed Check</span>
            {weedCheckReport && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  weedCheckReport.isCutReady
                    ? 'bg-emerald-500 text-white'
                    : 'bg-rose-500 text-white'
                }`}
              >
                {weedCheckReport.isCutReady ? '100%' : `${weedCheckReport.totalIssues}`}
              </span>
            )}
          </button>
        )}

        {/* Toggle Scale Rulers */}
        {onToggleRulers && (
          <button
            onClick={onToggleRulers}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              showRulers
                ? 'text-indigo-600 bg-indigo-50 font-bold'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title={showRulers ? 'Hide Scale Bar Rulers' : 'Show Scale Bar Rulers'}
          >
            <Ruler className="w-4 h-4" />
          </button>
        )}

        {/* Units Switcher (in / cm) */}
        {onToggleUnits && (
          <button
            onClick={onToggleUnits}
            className="px-2 py-1 rounded-xl text-[10px] font-bold font-mono text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title={`Current units: ${units.toUpperCase()}. Click to switch to ${units === 'in' ? 'cm' : 'inches'}.`}
          >
            {units.toUpperCase()}
          </button>
        )}

        <div className="h-4 w-px bg-slate-200 mx-0.5" />

        {/* Zoom Controls */}
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={onResetZoom}
          className="px-2 py-1 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 font-mono transition-colors cursor-pointer"
          title="Reset zoom to 100%"
        >
          {Math.round(zoomLevel * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Empty State Overlay */}
      {!hasImage && (
        <div className="absolute inset-0 z-5 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-sm">
            <Scissors className="w-8 h-8 -rotate-45" />
          </div>
          <h3 className="font-extrabold text-lg text-craft-text">Ready to Craft</h3>
          <p className="text-xs text-craft-muted max-w-sm mt-1">
            Click <strong>&quot;Generate Concept&quot;</strong> above, or upload an image to start cleaning &amp; vectorizing for Cricut!
          </p>
        </div>
      )}

      {/* Center Stage: Display Mat Background (Transparent / White / Black) */}
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onPointerMove={(e) => {
          if (brushMode === 'none') {
            if (brushPointerPos !== null) setBrushPointerPos(null);
            return;
          }
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setBrushPointerPos({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
            });
          }
        }}
        onPointerLeave={() => setBrushPointerPos(null)}
        className={`flex-1 w-full h-full relative flex items-center justify-center overflow-hidden transition-colors duration-200 ${
          matBackground === 'transparent'
            ? 'cricut-grid-bg'
            : matBackground === 'white'
            ? 'bg-white'
            : 'bg-slate-950'
        } ${isLassoActive || brushMode === 'paint' || brushMode === 'erase' ? 'cursor-crosshair' : brushMode === 'fill' ? 'cursor-cell' : 'cursor-default'}`}
        style={showRulers ? { paddingLeft: 22, paddingTop: 22 } : undefined}
      >
        <canvas ref={canvasRef} className={mode === 'compare' ? 'hidden' : 'max-w-full max-h-full'} />

        {/* Side-by-Side Comparison Workspace */}
        {mode === 'compare' && (
          <div className="absolute inset-0 z-20">
            <CompareView
              rasterUrl={compareData?.rasterUrl || null}
              svgString={compareData?.svgString || null}
              matBackground={matBackground}
              onSwitchToRaster={onSwitchToRaster}
              onSwitchToVector={onSwitchToVector}
              onTriggerVectorize={onTriggerVectorize}
              isVectorizing={isVectorizing}
            />
          </div>
        )}

        {/* Dynamic Scaled Brush Preview Cursor Ring */}
        {brushMode !== 'none' && brushMode !== 'fill' && brushPointerPos && (
          <div
            className="pointer-events-none absolute z-30 rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{
              left: brushPointerPos.x,
              top: brushPointerPos.y,
              width: Math.max(brushSize * zoomLevel, 6),
              height: Math.max(brushSize * zoomLevel, 6),
              border: brushMode === 'erase' ? '2px dashed #F43F5E' : '2px solid #4F46E5',
              backgroundColor:
                brushMode === 'erase'
                  ? 'rgba(244, 63, 94, 0.15)'
                  : activeBrushColor && activeBrushColor !== 'transparent'
                  ? `${activeBrushColor}33`
                  : 'rgba(79, 70, 229, 0.2)',
              boxShadow: '0 0 0 1.5px rgba(255, 255, 255, 0.85)'
            }}
          >
            {/* Center target dot */}
            <div
              className={`w-1 h-1 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${
                brushMode === 'erase' ? 'bg-rose-500' : 'bg-indigo-600'
              }`}
            />
          </div>
        )}

        {/* Dynamic Fill Mode Cursor Indicator */}
        {brushMode === 'fill' && brushPointerPos && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{
              left: brushPointerPos.x,
              top: brushPointerPos.y
            }}
          >
            <div
              className="w-5 h-5 rounded-full border-2 border-white shadow-lg flex items-center justify-center ring-2 ring-black/20"
              style={{ backgroundColor: activeBrushColor || '#4F46E5' }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
            </div>
          </div>
        )}

        {/* Right-Click Drag Brush Size Quick Adjustment HUD (Positioned directly below cursor) */}
        {isResizingBrush && brushPointerPos && (
          <div
            className="pointer-events-none absolute z-40 -translate-x-1/2 flex flex-col items-center bg-slate-900/95 backdrop-blur-md border border-white/25 text-white px-3.5 py-2 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-75 select-none"
            style={{
              left: brushPointerPos.x,
              top: brushPointerPos.y + Math.max((brushSize * zoomLevel) / 2, 6) + 16
            }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Brush Size
              </span>
              <span className="text-sm font-extrabold font-mono text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-lg border border-indigo-500/40">
                {brushSize}px
              </span>
            </div>

            {/* Visual Bar Indicator */}
            <div className="w-28 h-1.5 bg-slate-700/80 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-75"
                style={{ width: `${Math.round(((brushSize - 4) / (100 - 4)) * 100)}%` }}
              />
            </div>

            <div className="text-[9px] font-medium text-slate-400 flex items-center gap-1 mt-1">
              <span>◄ Drag Left / Right to Adjust ►</span>
            </div>
          </div>
        )}

        {/* Vinyl Cutting Readiness & Weed Check Heatmap Overlay */}
        {hasVector && (
          <WeedCheckOverlay
            isVisible={Boolean(isWeedCheckActive)}
            report={weedCheckReport || null}
            settings={vinylSettings || getStoredVinylSettings()}
            zoomLevel={zoomLevel}
            viewportInfo={viewportInfo}
            onRemediate={onRemediateVinyl || (() => {})}
            onClose={onToggleWeedCheck || (() => {})}
            onOpenSettings={onOpenSettings}
            isRemediating={isRemediating}
          />
        )}
      </div>
    </div>
  );
};
