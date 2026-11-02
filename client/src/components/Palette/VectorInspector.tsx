import React, { useState, useEffect, useCallback } from 'react';
import {
  Palette,
  PenTool,
  Eye,
  EyeOff,
  Trash2,
  FileCode2,
  Image as ImageIcon,
  CheckCircle2,
  Sparkles,
  Scissors,
  SlidersHorizontal,
  Layers,
  Wand2,
  RotateCcw,
  FileText,
  Crop,
  Circle as CircleIcon,
  ShieldCheck,
  AlertTriangle,
  ChevronRight,
  Paintbrush,
  Eraser,
  PaintBucket,
  GripVertical,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { VectorStats, VectorLayer } from '../../services/api';
import { areColorsMatching } from '../../services/colorUtils';
import type { FabricObject } from 'fabric';
import type { VinylCutSettings } from '../../services/vinylCutSettings';
import type { WeedCheckReport } from '../../services/vinylRemediation';
import { FlattenModal } from '../FlattenModal';
import type { FlattenMode } from '../../services/booleanUnion';

interface VectorInspectorProps {
  stats: VectorStats | null;
  canvasLayers?: { color: string; count: number; visible: boolean }[];
  onSelectColorLayer?: (color: string) => void;
  onCombineMats?: (colors: string[]) => void;
  onReorderColorLayers?: (colorOrder: string[]) => void;
  onSwapColor: (fromColor: string, toColor: string) => void;
  onToggleLayerVisibility: (color: string, visible?: boolean) => void;
  onDeleteColorLayer: (color: string) => void;
  selectedObject: FabricObject | null;
  selectedColor: string | null;
  selectedMatColors?: string[];
  onSelectMatColors?: (colors: string[]) => void;
  onChangeSelectedColor: (color: string) => void;
  onDeleteSelectedObject: () => void;
  isLineArt: boolean;
  lineArtPenWidth?: number;
  lineArtColorMode?: 'black' | 'color';
  onChangeLineArtPenWidth?: (width: number) => void;
  onChangeLineArtColorMode?: (mode: 'black' | 'color') => void;
  onToggleLineArt: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportPdf?: () => void;
  onExportLineArt: () => void;
  onOpenExportModal?: () => void;
  onResetArtwork?: () => void;
  onOpenMatContextMenu?: (colors: string[], clientPos: { x: number; y: number }) => void;
  // Vector Cropping
  onStartRectCrop?: (ratio?: 'free' | '1:1' | '4:5' | '16:9') => void;
  onStartCircleCrop?: () => void;
  onStartLassoCrop?: (type: 'lasso-freehand' | 'lasso-polygon') => void;
  // On-the-Fly Simplification
  maxColorCount: number;
  activeColorCount: number;
  activeDetailPercent: number;
  onSimplifyColors: (count: number) => void;
  onSimplifyDetails: (percent: number) => void;
  onFlattenArtwork?: (mode: FlattenMode, activeOrder?: string[]) => void;
  // Vinyl Cutting Readiness & Weed Check Engine
  isWeedCheckActive?: boolean;
  onToggleWeedCheck?: () => void;
  weedCheckReport?: WeedCheckReport | null;
  onRemediateVinyl?: () => void;
  isRemediating?: boolean;
  vinylSettings?: VinylCutSettings;
  onOpenSettings?: () => void;
  // Vector Brush & Eraser & Fill
  brushMode?: 'none' | 'paint' | 'erase' | 'fill';
  onSetBrushMode?: (mode: 'none' | 'paint' | 'erase' | 'fill') => void;
  activeBrushColor?: string;
  onSelectBrushColor?: (color: string) => void;
  // Vector Outline Smoothing
  outlineSmoothing?: number;
  isSmoothing?: boolean;
  onSmoothOutlines?: (percent: number, targetColor?: string | null) => void;
  // Outer Perimeter & Sticker Cut
  isPerimeterHighlightActive?: boolean;
  onTogglePerimeterHighlight?: () => void;
  perimeterColor?: string;
  onChangePerimeterColor?: (color: string) => void;
}

export const VectorInspector: React.FC<VectorInspectorProps> = ({
  stats,
  canvasLayers,
  onSelectColorLayer,
  onCombineMats,
  onSwapColor,
  onToggleLayerVisibility,
  onDeleteColorLayer,
  selectedObject,
  selectedColor,
  selectedMatColors: selectedMatColorsProp,
  onSelectMatColors,
  onChangeSelectedColor,
  onDeleteSelectedObject,
  isLineArt,
  lineArtPenWidth = 2,
  lineArtColorMode = 'black',
  onChangeLineArtPenWidth,
  onChangeLineArtColorMode,
  onToggleLineArt,
  onExportSvg,
  onExportPng,
  onExportPdf,
  onOpenExportModal,
  onResetArtwork,
  onOpenMatContextMenu,
  onStartRectCrop,
  onStartCircleCrop,
  onStartLassoCrop,
  maxColorCount,
  activeColorCount,
  activeDetailPercent,
  onSimplifyColors,
  onSimplifyDetails,
  onFlattenArtwork,
  isWeedCheckActive = false,
  onToggleWeedCheck,
  weedCheckReport,
  onRemediateVinyl,
  isRemediating = false,
  vinylSettings,
  onOpenSettings,
  brushMode = 'none',
  onSetBrushMode,
  activeBrushColor,
  onSelectBrushColor,
  outlineSmoothing = 0,
  isSmoothing = false,
  onSmoothOutlines,
  onReorderColorLayers,
  isPerimeterHighlightActive = false,
  onTogglePerimeterHighlight,
  perimeterColor = '#06b6d4',
  onChangePerimeterColor
}) => {
  const [localSmoothing, setLocalSmoothing] = useState<number>(outlineSmoothing);

  useEffect(() => {
    setLocalSmoothing(outlineSmoothing);
  }, [outlineSmoothing]);

  const handleCommitSmoothing = (val: number, targetColor?: string | null) => {
    if (val === outlineSmoothing) return;
    if (onSmoothOutlines) {
      onSmoothOutlines(val, targetColor !== undefined ? targetColor : 'ALL');
    }
  };

  const [hiddenLayers, setHiddenLayers] = useState<Record<string, boolean>>({});
  const [internalSelectedMatColors, setInternalSelectedMatColors] = useState<string[]>([]);
  const selectedMatColors = selectedMatColorsProp !== undefined ? selectedMatColorsProp : internalSelectedMatColors;
  const setSelectedMatColors = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      const next = typeof updater === 'function' ? updater(selectedMatColors) : updater;
      if (onSelectMatColors) {
        onSelectMatColors(next);
      } else {
        setInternalSelectedMatColors(next);
      }
    },
    [onSelectMatColors, selectedMatColors]
  );
  const [isFlattenModalOpen, setIsFlattenModalOpen] = useState(false);
  const [draggedMatIndex, setDraggedMatIndex] = useState<number | null>(null);
  const [dragOverMatIndex, setDragOverMatIndex] = useState<number | null>(null);

  // Nestable / Collapsible RHS Cards: Layers is un-nested by default, others are nested
  const [isLayersOpen, setIsLayersOpen] = useState<boolean>(true);
  const [isSimplificationOpen, setIsSimplificationOpen] = useState<boolean>(false);
  const [isPerimeterOpen, setIsPerimeterOpen] = useState<boolean>(false);
  const [isReadinessOpen, setIsReadinessOpen] = useState<boolean>(false);
  const [isLineArtOpen, setIsLineArtOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isLineArt) {
      setIsLineArtOpen(true);
    }
  }, [isLineArt]);
  const [draggedSwatchColor, setDraggedSwatchColor] = useState<string | null>(null);
  const [dragOverSwatchColor, setDragOverSwatchColor] = useState<string | null>(null);

  const toggleLayer = (color: string) => {
    const currentlyHidden = hiddenLayers[color] !== undefined ? hiddenLayers[color] : (layers.find((l) => l.color === color)?.visible === false);
    const nextHidden = !currentlyHidden;
    setHiddenLayers((prev) => ({ ...prev, [color]: nextHidden }));
    onToggleLayerVisibility(color, !nextHidden);
  };

  const layers: { color: string; count: number; visible?: boolean }[] =
    canvasLayers && canvasLayers.length > 0
      ? canvasLayers
      : stats?.colorLayers || [];

  const moveLayer = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= layers.length) return;
    if (toIndex < 0 || toIndex >= layers.length) return;
    if (fromIndex === toIndex) return;

    const newOrder = layers.map((l) => l.color);
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    if (onReorderColorLayers) {
      onReorderColorLayers(newOrder);
    }
  };

  const currentLayerCount = layers.length > 0 ? layers.length : (activeColorCount || 1);
  const maxColors = Math.max(maxColorCount, layers.length, 1);
  const sliderValue = Math.min(Math.max(activeColorCount || currentLayerCount, 1), maxColors);

  return (
    <div className="w-80 lg:w-96 bg-white border-l border-craft-border h-full flex flex-col justify-between overflow-y-auto p-4 space-y-5">
      <div className="space-y-5">
        {/* Title & Cricut Badge */}
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <PenTool className="w-4 h-4" />
              </span>
              <h3 className="font-extrabold text-sm text-craft-text">Vector Studio &amp; Layers</h3>
            </div>
            <div className="flex items-center gap-1.5">
              {onResetArtwork && (
                <button
                  onClick={onResetArtwork}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                  title="Reset vector artwork back to original"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Cricut Ready</span>
              </span>
            </div>
          </div>
          <p className="text-[11px] text-craft-muted mt-0.5">
            Interactive multi-color SVG vinyl clustering &amp; live simplification
          </p>
        </div>

        {/* Vector Stats Summary Card */}
        <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 text-center">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Vinyl Layers</p>
            <p className="text-sm font-extrabold text-indigo-600 mt-0.5">{currentLayerCount}</p>
          </div>
          <div className="border-x border-slate-200">
            <p className="text-[10px] uppercase font-bold text-slate-400">Total Paths</p>
            <p className="text-sm font-extrabold text-craft-text mt-0.5">{stats?.pathCount || 0}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Bézier Nodes</p>
            <p className="text-sm font-extrabold text-emerald-600 mt-0.5">{stats?.nodeCount || 0}</p>
          </div>
        </div>

        {/* LAYERS CARD (UN-NESTED BY DEFAULT) */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsLayersOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600">
                <Layers className="w-4 h-4" />
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-craft-text">Layers</span>
                <span className="text-[10px] text-slate-400 font-medium">({layers.length})</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                Drag swatch to merge
              </span>
              {isLayersOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isLayersOpen && (
            <div className="p-3.5 pt-0 border-t border-slate-200/60 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-slate-400 font-medium">
                  Drag swatch to merge &bull; Drag handle to reorder
                </span>
              </div>

              {/* Multi-Select Combine Banner */}
              {selectedMatColors.length >= 2 && (
                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-xl text-xs text-indigo-900 shadow-2xs animate-in fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-4 h-4 rounded-full border border-black/20 shrink-0 shadow-2xs"
                      style={{ backgroundColor: selectedMatColors[0] }}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-[11px] truncate">
                        {selectedMatColors.length} Layers Selected
                      </p>
                      <p className="text-[10px] text-indigo-600 truncate">
                        Target: <span className="font-mono font-bold">{selectedMatColors[0]}</span> (1st selected)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (onCombineMats) onCombineMats(selectedMatColors);
                        setSelectedMatColors([]);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                      title="Combine all selected layers into the first selected color"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Combine</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMatColors([])}
                      className="px-1.5 py-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                      title="Clear multi-selection"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {layers.map((layer, index) => {
                  const isHidden = hiddenLayers[layer.color] !== undefined ? hiddenLayers[layer.color] : (layer.visible === false);
                  const isSelected = selectedMatColors.some((c) => areColorsMatching(c, layer.color));
                  const isPrimary = selectedMatColors.length > 0 && areColorsMatching(selectedMatColors[0], layer.color);
                  const isDragging = draggedMatIndex === index;
                  const isDropTarget = dragOverMatIndex === index && draggedMatIndex !== index;
                  const isSwatchMergeTarget = dragOverSwatchColor === layer.color && draggedSwatchColor !== layer.color;

                  return (
                    <div
                      key={`${layer.color}-${index}`}
                      draggable={!draggedSwatchColor && !!onReorderColorLayers && layers.length > 1}
                      onDragStart={(e) => {
                        // Do not drag whole card if drag started from swatch
                        if ((e.target as HTMLElement).closest('[data-swatch="true"]') || draggedSwatchColor) {
                          return;
                        }
                        setDraggedMatIndex(index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('application/craftly-mat-index', String(index));
                        e.dataTransfer.setData('text/plain', String(index));
                      }}
                      onDragOver={(e) => {
                        const isSwatch = e.dataTransfer.types.includes('application/craftly-swatch') || !!draggedSwatchColor;
                        if (isSwatch) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                          if (draggedSwatchColor && draggedSwatchColor.toUpperCase() !== layer.color.toUpperCase()) {
                            if (dragOverSwatchColor !== layer.color) {
                              setDragOverSwatchColor(layer.color);
                            }
                          }
                          return;
                        }
                        if (draggedMatIndex !== null) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverMatIndex !== index) {
                            setDragOverMatIndex(index);
                          }
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverSwatchColor === layer.color) {
                          setDragOverSwatchColor(null);
                        }
                        if (dragOverMatIndex === index) {
                          setDragOverMatIndex(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const swatchColor = e.dataTransfer.getData('application/craftly-swatch') || (draggedSwatchColor ? draggedSwatchColor : null);
                        if (swatchColor) {
                          const sourceColor = swatchColor;
                          const targetColor = layer.color;
                          if (sourceColor && targetColor && sourceColor.toUpperCase() !== targetColor.toUpperCase()) {
                            if (onCombineMats) {
                              onCombineMats([targetColor, sourceColor]);
                            }
                          }
                          setDraggedSwatchColor(null);
                          setDragOverSwatchColor(null);
                          return;
                        }
                        if (draggedMatIndex !== null && draggedMatIndex !== index) {
                          moveLayer(draggedMatIndex, index);
                        }
                        setDraggedMatIndex(null);
                        setDragOverMatIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedMatIndex(null);
                        setDragOverMatIndex(null);
                        setDraggedSwatchColor(null);
                        setDragOverSwatchColor(null);
                      }}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          e.preventDefault();
                          setSelectedMatColors((prev: string[]) => {
                            if (prev.includes(layer.color)) {
                              return prev.filter((c: string) => c !== layer.color);
                            }
                            return [...prev, layer.color];
                          });
                        } else {
                          setSelectedMatColors([layer.color]);
                          if (onSelectColorLayer) onSelectColorLayer(layer.color);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        let colorsToUse: string[];
                        if (e.shiftKey) {
                          colorsToUse = selectedMatColors.includes(layer.color)
                            ? selectedMatColors
                            : [...selectedMatColors, layer.color];
                        } else if (selectedMatColors.includes(layer.color) && selectedMatColors.length > 1) {
                          colorsToUse = selectedMatColors;
                        } else {
                          colorsToUse = [layer.color];
                        }
                        setSelectedMatColors(colorsToUse);
                        if (onOpenMatContextMenu) {
                          onOpenMatContextMenu(colorsToUse, { x: e.clientX, y: e.clientY });
                        }
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all select-none ${
                        isSwatchMergeTarget
                          ? 'border-2 border-indigo-600 bg-indigo-50/70 shadow-md ring-2 ring-indigo-300'
                          : isDragging
                          ? 'opacity-40 scale-[0.98] border-dashed border-indigo-400 bg-indigo-50/30'
                          : isDropTarget
                          ? 'border-t-2 border-t-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200'
                          : isHidden
                          ? 'bg-slate-50 border-slate-200 opacity-50 cursor-pointer'
                          : isPrimary && selectedMatColors.length >= 2
                          ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-300 shadow-sm cursor-pointer'
                          : isSelected && selectedMatColors.length >= 2
                          ? 'bg-purple-50/80 border-purple-300 ring-1 ring-purple-300 shadow-sm cursor-pointer'
                          : isSelected
                          ? 'bg-indigo-50/50 border-indigo-300 shadow-2xs cursor-pointer'
                          : 'bg-white border-slate-200/90 shadow-2xs hover:border-indigo-300 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {onReorderColorLayers && layers.length > 1 && (
                          <div
                            className="flex items-center text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing shrink-0 -ml-1"
                            title="Drag to reorder layer stack"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <div
                          className="relative shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            data-swatch="true"
                            draggable={true}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.setData('application/craftly-swatch', layer.color);
                              e.dataTransfer.setData('text/plain', layer.color);
                              setDraggedSwatchColor(layer.color);
                            }}
                            onDragEnd={() => {
                              setDraggedSwatchColor(null);
                              setDragOverSwatchColor(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'copy';
                              if (dragOverSwatchColor !== layer.color) {
                                setDragOverSwatchColor(layer.color);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const source = e.dataTransfer.getData('application/craftly-swatch') || e.dataTransfer.getData('text/plain') || draggedSwatchColor;
                              if (source && source.toUpperCase() !== layer.color.toUpperCase()) {
                                if (onCombineMats) {
                                  onCombineMats([layer.color, source]);
                                }
                              }
                              setDraggedSwatchColor(null);
                              setDragOverSwatchColor(null);
                            }}
                            className={`w-7 h-7 rounded-lg shadow-inner border border-black/10 cursor-grab active:cursor-grabbing transition-all flex items-center justify-center ${
                              isSwatchMergeTarget
                                ? 'ring-4 ring-indigo-500 scale-125 shadow-lg'
                                : draggedSwatchColor === layer.color
                                ? 'opacity-40 scale-90'
                                : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: layer.color }}
                            title="Drag this color square onto another layer to merge layers"
                          >
                            {isSwatchMergeTarget && (
                              <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs animate-ping" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <label
                              className="flex items-center gap-1 cursor-pointer group/picker hover:text-indigo-600 transition-colors"
                              title="Click to change this vinyl color"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-xs font-mono font-bold text-craft-text group-hover/picker:text-indigo-600">
                                {layer.color}
                              </span>
                              <Palette className="w-3 h-3 text-slate-400 group-hover/picker:text-indigo-600 transition-colors" />
                              <input
                                type="color"
                                value={layer.color}
                                onChange={(e) => onSwapColor(layer.color, e.target.value)}
                                className="sr-only"
                              />
                            </label>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                              Layer {index + 1}
                            </span>
                            {isSwatchMergeTarget && (
                              <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold animate-pulse">
                                Merge into this Layer
                              </span>
                            )}
                            {!isSwatchMergeTarget && index === 0 && (
                              <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-bold">
                                Top / Front
                              </span>
                            )}
                            {!isSwatchMergeTarget && index === layers.length - 1 && layers.length > 1 && (
                              <span className="text-[9px] bg-slate-100 text-slate-700 border border-slate-300 px-1.5 py-0.2 rounded font-bold">
                                Base / Back
                              </span>
                            )}
                            {!isSwatchMergeTarget && isPrimary && selectedMatColors.length >= 2 && (
                              <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">
                                1st / Target
                              </span>
                            )}
                            {!isSwatchMergeTarget && !isPrimary && isSelected && selectedMatColors.length >= 2 && (
                              <span className="text-[9px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded font-bold">
                                Selected
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-craft-muted">{layer.count} cut paths</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {onReorderColorLayers && layers.length > 1 && (
                          <div className="flex flex-col gap-0.5 mr-0.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveLayer(index, index - 1)}
                              className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none cursor-pointer transition-colors"
                              title="Move up (bring forward)"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={index === layers.length - 1}
                              onClick={() => moveLayer(index, index + 1)}
                              className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:pointer-events-none cursor-pointer transition-colors"
                              title="Move down (send backward)"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {onSetBrushMode && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const norm = layer.color;
                                if (onSelectBrushColor) onSelectBrushColor(norm);
                                if (onSelectColorLayer) onSelectColorLayer(norm);
                                onSetBrushMode(
                                  brushMode === 'paint' && areColorsMatching(activeBrushColor, layer.color)
                                    ? 'none'
                                    : 'paint'
                                );
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                brushMode === 'paint' && areColorsMatching(activeBrushColor, layer.color)
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                              }`}
                              title={
                                brushMode === 'paint' && areColorsMatching(activeBrushColor, layer.color)
                                  ? 'Currently Painting this layer (Click to exit)'
                                  : 'Paint on this vinyl layer'
                              }
                            >
                              <Paintbrush className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const norm = layer.color;
                                if (onSelectBrushColor) onSelectBrushColor(norm);
                                if (onSelectColorLayer) onSelectColorLayer(norm);
                                onSetBrushMode(
                                  brushMode === 'erase' && areColorsMatching(activeBrushColor, layer.color)
                                    ? 'none'
                                    : 'erase'
                                );
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                brushMode === 'erase' && areColorsMatching(activeBrushColor, layer.color)
                                  ? 'bg-rose-600 text-white shadow-2xs'
                                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={
                                brushMode === 'erase' && areColorsMatching(activeBrushColor, layer.color)
                                  ? 'Currently Erasing this layer (Click to exit)'
                                  : 'Erase cuts from this vinyl layer'
                              }
                            >
                              <Eraser className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const norm = layer.color;
                                if (onSelectBrushColor) onSelectBrushColor(norm);
                                if (onSelectColorLayer) onSelectColorLayer(norm);
                                onSetBrushMode(
                                  brushMode === 'fill' && areColorsMatching(activeBrushColor, layer.color)
                                    ? 'none'
                                    : 'fill'
                                );
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                brushMode === 'fill' && areColorsMatching(activeBrushColor, layer.color)
                                  ? 'bg-amber-500 text-white shadow-2xs'
                                  : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                              }`}
                              title={
                                brushMode === 'fill' && areColorsMatching(activeBrushColor, layer.color)
                                  ? 'Currently in Fill mode for this layer (Click to exit)'
                                  : 'Fill closed loops on this vinyl layer'
                              }
                            >
                              <PaintBucket className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => toggleLayer(layer.color)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isHidden ? 'text-slate-400 hover:text-slate-600' : 'text-slate-600 hover:text-indigo-600'
                          }`}
                          title={isHidden ? 'Show vinyl layer' : 'Hide vinyl layer'}
                        >
                          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onDeleteColorLayer(layer.color)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                          title="Delete this color layer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected Path Inspector (Direct Canvas Click only; never shown when selecting from the mat list) */}
        {selectedObject && selectedMatColors.length === 0 && (
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Selected Element</span>
              </span>
              <button
                onClick={() => onDeleteSelectedObject && onDeleteSelectedObject()}
                className="p-1 rounded-lg text-pink-600 hover:bg-pink-100 transition-colors"
                title="Delete this path"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="color"
                value={selectedColor || '#4F46E5'}
                onChange={(e) => onChangeSelectedColor(e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 bg-white"
              />
              <div className="flex-1">
                <p className="text-xs font-mono font-bold text-craft-text uppercase">{selectedColor || '#4F46E5'}</p>
                <p className="text-[10px] text-indigo-700">Change fill color of this individual path</p>
              </div>
            </div>
          </div>
        )}

        {/* ON-THE-FLY DETAIL & COLOR SIMPLIFICATION SUITE */}
        <div className="bg-indigo-50/60 rounded-2xl border border-indigo-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsSimplificationOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-indigo-100/40 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-indigo-100/70 text-indigo-600">
                <SlidersHorizontal className="w-4 h-4" />
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-indigo-950">Live Simplification</span>
                <span className="text-[10px] text-indigo-500 font-mono">(0ms)</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                {currentLayerCount} Colors
              </span>
              {isSimplificationOpen ? (
                <ChevronDown className="w-4 h-4 text-indigo-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-indigo-400" />
              )}
            </div>
          </button>

          {isSimplificationOpen && (
            <div className="p-4 pt-0 border-t border-indigo-200/50 space-y-3.5 animate-in fade-in duration-150">
              <p className="text-[11px] text-indigo-900/80 leading-relaxed pt-2">
                Adjust colors and shapes live without reconverting or generating again.
              </p>

          {/* 1. Live Color / Vinyl Layer Simplifier */}
          <div>
            <div className="flex justify-between text-xs font-medium text-craft-text mb-1">
              <span>Vinyl Cutting Layers</span>
              <span className="text-indigo-600 font-mono font-bold">
                {currentLayerCount} {currentLayerCount === 1 ? 'Layer' : 'Layers'}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max={maxColors}
              value={sliderValue}
              onChange={(e) => onSimplifyColors(parseInt(e.target.value, 10))}
              disabled={maxColors <= 1}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-40"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>1 (Single Layer)</span>
              <span>{Math.max(1, Math.round(maxColors / 2))}</span>
              <span>{maxColors} (Original)</span>
            </div>
          </div>

          {/* 2. Live Detail / Small Cut Filter */}
          <div>
            <div className="flex justify-between text-xs font-medium text-craft-text mb-1">
              <span>Shape Detail Level</span>
              <span className="text-indigo-600 font-mono font-bold">{activeDetailPercent}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              value={activeDetailPercent}
              onChange={(e) => onSimplifyDetails(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>Bold Silhouette</span>
              <span>Balanced</span>
              <span>Full Detail</span>
            </div>
          </div>

          {/* 3. Live Vector Outline Smoothing */}
          {onSmoothOutlines && (
            <div className="pt-2 border-t border-indigo-200/60">
              <div className="flex justify-between items-center text-xs font-medium text-craft-text mb-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-bold">Outline Smoothing</span>
                </div>
                <span className="text-indigo-600 font-mono font-bold">{outlineSmoothing}%</span>
              </div>

              {/* Scope Indicator: Current Selection, Selected Layer, or All Layers */}
              {(() => {
                const activeTargetColor =
                  selectedMatColors.length > 0
                    ? selectedMatColors[0].toUpperCase()
                    : selectedColor
                    ? selectedColor.toUpperCase()
                    : null;

                const isMulti =
                  selectedObject &&
                  ((selectedObject as any).type?.toLowerCase() === 'activeselection' ||
                    typeof (selectedObject as any).getObjects === 'function');
                const selectedCount = isMulti
                  ? (selectedObject as any).getObjects().length
                  : selectedObject
                  ? 1
                  : 0;

                const matchingLayer = activeTargetColor && canvasLayers
                  ? canvasLayers.find((l) => l.color.toUpperCase() === activeTargetColor)
                  : null;
                const isEntireLayerSelected =
                  matchingLayer && selectedCount > 0 && selectedCount >= matchingLayer.count;

                let scopeLabel: React.ReactNode;
                if (selectedCount > 0) {
                  if (isEntireLayerSelected) {
                    scopeLabel = (
                      <span className="flex items-center gap-1 font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded-md">
                        <span
                          className="w-2 h-2 rounded-full border border-black/20"
                          style={{ backgroundColor: activeTargetColor || '#000' }}
                        />
                        <span>Selected Layer ({activeTargetColor}) — All {selectedCount} Elements</span>
                      </span>
                    );
                  } else {
                    scopeLabel = (
                      <span className="flex items-center gap-1 font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded-md">
                        {activeTargetColor && (
                          <span
                            className="w-2 h-2 rounded-full border border-black/20"
                            style={{ backgroundColor: activeTargetColor }}
                          />
                        )}
                        <span>Current Selection ({selectedCount} element{selectedCount > 1 ? 's' : ''})</span>
                      </span>
                    );
                  }
                } else if (activeTargetColor) {
                  scopeLabel = (
                    <span className="flex items-center gap-1 font-bold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded-md">
                      <span
                        className="w-2 h-2 rounded-full border border-black/20"
                        style={{ backgroundColor: activeTargetColor }}
                      />
                      <span>Selected Layer ({activeTargetColor})</span>
                    </span>
                  );
                } else {
                  scopeLabel = (
                    <span className="font-bold text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded-md">
                      All Layers (Entire Artwork)
                    </span>
                  );
                }

                return (
                  <>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                      <span>Applies to:</span>
                      {scopeLabel}
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={localSmoothing}
                      disabled={isSmoothing}
                      onChange={(e) => setLocalSmoothing(parseInt(e.target.value, 10))}
                      onPointerUp={(e) => handleCommitSmoothing(parseInt((e.target as HTMLInputElement).value, 10), activeTargetColor)}
                      onKeyUp={(e) => {
                        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                          handleCommitSmoothing(localSmoothing, activeTargetColor);
                        }
                      }}
                      className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Smooth vector cutlines (applies to current selection, or whole layer if all selected)"
                    />
                  </>
                );
              })()}
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0% (Raw Outlines)</span>
                <span>50% (Smooth Arcs)</span>
                <span>100% (Ultra Smooth)</span>
              </div>
            </div>
          )}

          {/* Preset Quick Buttons */}
          <div className="pt-2 border-t border-indigo-200/60 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onSimplifyColors(maxColors);
                onSimplifyDetails(100);
              }}
              className="py-1 px-1.5 text-[10px] font-bold rounded-lg bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-center transition-colors"
            >
              Full Detail
            </button>
            <button
              type="button"
              onClick={() => {
                onSimplifyColors(Math.min(4, maxColors));
                onSimplifyDetails(75);
              }}
              className="py-1 px-1.5 text-[10px] font-bold rounded-lg bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-center transition-colors"
            >
              4-Color Layer
            </button>
            <button
              type="button"
              onClick={() => {
                onSimplifyColors(2);
                onSimplifyDetails(50);
              }}
              className="py-1 px-1.5 text-[10px] font-bold rounded-lg bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-center transition-colors"
            >
              2-Tone Decal
            </button>
          </div>

          {/* Flatten Artwork / Choose Layering Style */}
          {onFlattenArtwork && (
            <div className="pt-2 border-t border-indigo-200/60">
              <button
                type="button"
                onClick={() => setIsFlattenModalOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 transition-all active:scale-[0.98] cursor-pointer"
                title="Combine all vectors of the same color and choose between Knockout (inlay) or Stacked (overlapping) layers"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Flatten Artwork...</span>
              </button>
            </div>
          )}
            </div>
          )}
        </div>

        {/* OUTER PERIMETER & STICKER OUTLINE CARD */}
        <div className="bg-cyan-50/60 rounded-2xl border border-cyan-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsPerimeterOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-cyan-100/40 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-cyan-100/70 text-cyan-700">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-cyan-950">Outer Perimeter &amp; Smoothing</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isPerimeterHighlightActive && (
                <span className="text-[10px] bg-cyan-100 text-cyan-800 border border-cyan-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <span>Highlighted</span>
                </span>
              )}
              {isPerimeterOpen ? (
                <ChevronDown className="w-4 h-4 text-cyan-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-cyan-500" />
              )}
            </div>
          </button>

          {isPerimeterOpen && (
            <div className="p-4 pt-0 border-t border-cyan-200/50 space-y-3.5 animate-in fade-in duration-150">
              <p className="text-[11px] text-cyan-950/80 leading-relaxed pt-2">
                Identifies and highlights the outer perimeter of the entire image (as if all layers were flattened into a solid sticker silhouette), with live smoothing and noise reduction for sticker die-cutting.
              </p>

              {/* 1. Highlight Outer Perimeter Toggle */}
              <div className="bg-white/80 p-3 rounded-xl border border-cyan-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-craft-text">Highlight Outer Perimeter</span>
                    <p className="text-[10px] text-slate-500">Outer cut contour across all layers</p>
                  </div>
                  {onTogglePerimeterHighlight && (
                    <button
                      type="button"
                      onClick={() => onTogglePerimeterHighlight()}
                      className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                        isPerimeterHighlightActive
                          ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-xs'
                          : 'bg-white hover:bg-cyan-50 text-cyan-800 border border-cyan-300'
                      }`}
                    >
                      {isPerimeterHighlightActive ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Showing</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hidden</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Highlight Contour Color Swatches */}
                {isPerimeterHighlightActive && (
                  <div className="pt-2 border-t border-cyan-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Contour Color:</span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { name: 'Cyan', color: '#06b6d4' },
                        { name: 'Pink', color: '#ec4899' },
                        { name: 'Emerald', color: '#10b981' },
                        { name: 'Indigo', color: '#6366f1' },
                        { name: 'Amber', color: '#f59e0b' }
                      ].map((swatch) => (
                        <button
                          key={swatch.color}
                          type="button"
                          onClick={() => onChangePerimeterColor && onChangePerimeterColor(swatch.color)}
                          className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                            perimeterColor === swatch.color
                              ? 'scale-125 border-slate-900 ring-2 ring-cyan-400'
                              : 'border-slate-300 hover:scale-110'
                          }`}
                          style={{ backgroundColor: swatch.color }}
                          title={`${swatch.name} Contour`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Smoothing & Noise Reduction Slider */}
              {onSmoothOutlines && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-medium text-craft-text">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                      <span className="font-bold">Smoothing &amp; Noise Reduction</span>
                    </div>
                    <span className="text-cyan-700 font-mono font-bold bg-cyan-100/80 px-2 py-0.5 rounded-md">
                      {isSmoothing ? 'Applying...' : `${localSmoothing}%`}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-tight">
                    Removes micro-jaggies and jitter from vector edges. Live updates the highlighted outline and each corresponding vector element so changes are baked into your final export.
                  </p>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={localSmoothing}
                    disabled={isSmoothing}
                    onChange={(e) => setLocalSmoothing(parseInt(e.target.value, 10))}
                    onPointerUp={(e) => handleCommitSmoothing(parseInt((e.target as HTMLInputElement).value, 10))}
                    onKeyUp={(e) => {
                      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                        handleCommitSmoothing(localSmoothing);
                      }
                    }}
                    className="w-full accent-cyan-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Smoothing & Noise Reduction for sticker elements and perimeter"
                  />

                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0% (Raw / Crisp)</span>
                    <span>50% (Smooth Arcs)</span>
                    <span>100% (Ultra Smooth)</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* VINYL CUTTING READINESS & WEED ENGINE CARD */}
        <div className="bg-rose-50/60 rounded-2xl border border-rose-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsReadinessOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-rose-100/40 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-rose-100/70 text-rose-600">
                <Scissors className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-rose-950">Vinyl Cutting Readiness</span>
            </div>
            <div className="flex items-center gap-1.5">
              {weedCheckReport && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    weedCheckReport.isCutReady
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  {weedCheckReport.score}% {weedCheckReport.isCutReady ? '• Ready' : `• ${weedCheckReport.totalIssues} Hazards`}
                </span>
              )}
              {isReadinessOpen ? (
                <ChevronDown className="w-4 h-4 text-rose-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-rose-400" />
              )}
            </div>
          </button>

          {isReadinessOpen && (
            <div className="p-4 pt-0 border-t border-rose-200/50 space-y-3.5 animate-in fade-in duration-150">
              <p className="text-[11px] text-rose-900/80 leading-relaxed pt-2">
                Evaluates vector paths against blade limits (min size, gap clearance, specks &amp; acute corners) for{' '}
                <strong className="capitalize">{vinylSettings?.preset?.replace('_', ' ') || 'standard vinyl'}</strong>.
              </p>

          {/* Quick Actions */}
          <div className="space-y-2">
            {onToggleWeedCheck && (
              <button
                type="button"
                onClick={onToggleWeedCheck}
                className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  isWeedCheckActive
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                    : 'bg-white hover:bg-rose-100 text-rose-700 border border-rose-300'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>{isWeedCheckActive ? 'Hide Weed Check Overlay' : 'View Weed Check Overlay'}</span>
              </button>
            )}

            {onRemediateVinyl && weedCheckReport && weedCheckReport.totalIssues > 0 && (
              <button
                type="button"
                onClick={onRemediateVinyl}
                disabled={isRemediating}
                className="w-full py-2 px-3 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Wand2 className={`w-3.5 h-3.5 ${isRemediating ? 'animate-spin' : ''}`} />
                <span>{isRemediating ? 'Removing...' : '1-Click Remove Specks & Thin Cuts'}</span>
              </button>
            )}
          </div>

          {/* Tolerance specs pill */}
          <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between text-[10px] text-rose-900 font-mono">
            <span>Min Area: {vinylSettings?.minAreaMm2 || 2.25}mm²</span>
            <span>Min Width: {vinylSettings?.minFeatureSizeMm || 1.5}mm</span>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="font-sans font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                Adjust
              </button>
            )}
          </div>
            </div>
          )}
        </div>

        {/* Line Art / Cricut Pen Mode Toggle */}
        <div className="bg-slate-50/80 rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all">
          <button
            type="button"
            onClick={() => setIsLineArtOpen((prev) => !prev)}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-amber-50 text-amber-600">
                <Scissors className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-craft-text">Cricut Pen / Line-Art</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                {isLineArt ? (lineArtColorMode === 'color' ? 'Color Outlines' : 'Black Ink') : 'Plotter Pen'}
              </span>
              {isLineArtOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </button>

          {isLineArtOpen && (
            <div className="p-4 pt-0 border-t border-slate-200/60 space-y-3 animate-in fade-in duration-150">
              <p className="text-[11px] text-craft-muted leading-relaxed pt-2">
                Strips all fills and converts vector paths to precise outlines for Cricut fine-point pens, markers, or foil transfer.
              </p>

              <button
                onClick={onToggleLineArt}
                className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                  isLineArt
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200'
                    : 'bg-white hover:bg-slate-100 text-craft-text border border-slate-300'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{isLineArt ? 'Restore Color Vector' : 'Convert to Line-Art (Cricut Pen)'}</span>
              </button>

              {/* When Line-Art mode is active, reveal options for Pen Width/Size and Outline Style (Black Ink vs Colour) */}
              {isLineArt && (
                <div className="pt-2 border-t border-slate-200/80 space-y-3 animate-in fade-in">
                  {/* Option 1: Outline Style (Black Ink vs Colour) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                      Outline Style
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onChangeLineArtColorMode?.('black')}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
                          lineArtColorMode === 'black'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-black border border-white/40" />
                        <span>Outline (Black Ink)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeLineArtColorMode?.('color')}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
                          lineArtColorMode === 'color'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex -space-x-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        </span>
                        <span>Colour (Separate Layers)</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {lineArtColorMode === 'color'
                        ? 'Each layer is outlined in its respective layer colour for multi-color pen drawing.'
                        : 'All paths are drawn with unified crisp black ink outlines.'}
                    </p>
                  </div>

                  {/* Option 2: Pen Width / Size */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                      <span>Pen Width / Size</span>
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                        {lineArtPenWidth}px ({(lineArtPenWidth / 3.78).toFixed(2)}mm)
                      </span>
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-4 gap-1 mb-2">
                      {[
                        { label: '0.4mm', val: 1.5, name: 'Fine' },
                        { label: '0.8mm', val: 3, name: 'Gel' },
                        { label: '1.0mm', val: 4, name: 'Marker' },
                        { label: '2.0mm', val: 7.5, name: 'Broad' }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => onChangeLineArtPenWidth?.(preset.val)}
                          className={`py-1 px-1 rounded-lg text-[10px] font-medium border text-center transition-all cursor-pointer ${
                            Math.abs(lineArtPenWidth - preset.val) < 0.3
                              ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                          title={`${preset.name} (${preset.label})`}
                        >
                          <div>{preset.label}</div>
                          <div className="text-[9px] text-slate-400">{preset.name}</div>
                        </button>
                      ))}
                    </div>

                    {/* Fine slider */}
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={lineArtPenWidth}
                      onChange={(e) => onChangeLineArtPenWidth?.(parseFloat(e.target.value))}
                      className="w-full accent-amber-600 cursor-pointer"
                      title="Adjust outline stroke thickness"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Export CTAs at Bottom */}
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <button
          onClick={onOpenExportModal || onExportSvg}
          className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-100 transition-all active:scale-95 cursor-pointer"
        >
          <FileCode2 className="w-4 h-4" />
          <span>Download Cricut SVG</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onExportPng}
            className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-craft-text font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ImageIcon className="w-3.5 h-3.5 text-pink-500" />
            <span>300 DPI PNG</span>
          </button>

          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-craft-text font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>300 DPI PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Flatten Mode Style Selection Modal Prompt */}
      {onFlattenArtwork && (
        <FlattenModal
          isOpen={isFlattenModalOpen}
          onClose={() => setIsFlattenModalOpen(false)}
          onConfirm={(mode) => {
            setIsFlattenModalOpen(false);
            const activeOrder = layers.map((l) => l.color);
            onFlattenArtwork(mode, activeOrder);
          }}
        />
      )}
    </div>
  );
};
