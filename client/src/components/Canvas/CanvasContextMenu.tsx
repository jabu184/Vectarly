import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Palette,
  CheckSquare,
  CheckCheck,
  FlipHorizontal,
  Sparkles,
  XCircle,
  X,
  Layers,
  Eye,
  EyeOff
} from 'lucide-react';
import type { FabricObject } from 'fabric';

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetObject: FabricObject | null;
}

interface CanvasContextMenuProps {
  menuState: ContextMenuState;
  onClose: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  currentColor: string | null;
  selectedColors?: string[];
  customColors?: string[];
  onChangeColor?: (color: string) => void;
  onSelectThisLayer?: (color: string) => void;
  onSelectSimilarColor?: (color: string) => void;
  onSelectAll?: () => void;
  onSelectInverse?: () => void;
  onUnionSelection?: () => void;
  onClearSelection?: () => void;
  onToggleHideShowAll?: () => void;
  onShowAll?: () => void;
  onHideAll?: () => void;
  areAllVisible?: boolean;
  onToggleHideShowSelection?: () => void;
}

const PRESET_VINYL_COLORS = [
  '#000000', '#FFFFFF', '#DC2626', '#EA580C',
  '#F59E0B', '#16A34A', '#2563EB', '#9333EA',
  '#EC4899', '#64748B'
];

export const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  menuState,
  onClose,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  onDelete,
  onDuplicate,
  currentColor,
  selectedColors,
  customColors = [],
  onChangeColor,
  onSelectThisLayer,
  onSelectSimilarColor,
  onSelectAll,
  onSelectInverse,
  onUnionSelection,
  onClearSelection,
  onToggleHideShowAll,
  onShowAll,
  onHideAll,
  areAllVisible = true,
  onToggleHideShowSelection
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [internalColor, setInternalColor] = useState<string | null>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!menuState.isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState.isOpen, onClose]);

  const targetObj = menuState.targetObject;

  // Reset internalColor whenever menu opens for a new target or opens/closes
  useEffect(() => {
    setInternalColor(null);
  }, [targetObj, menuState.isOpen]);

  // Extract leaf selected elements
  const selectedElements: FabricObject[] = useMemo(() => {
    if (!targetObj) return [];
    if (typeof (targetObj as any).getObjects === 'function') {
      const getLeaves = (o: any): FabricObject[] => {
        if (o.type === 'activeSelection' || (o.type === 'group' && typeof o.getObjects === 'function' && !o.fill)) {
          const ch = o.getObjects ? o.getObjects() : o._objects;
          if (Array.isArray(ch) && ch.length > 0) {
            return ch.flatMap(getLeaves);
          }
        }
        return [o];
      };
      return (targetObj as any).getObjects().flatMap(getLeaves);
    }
    return [targetObj];
  }, [targetObj, menuState.isOpen, menuState.x, menuState.y]);

  const isSelectionHidden = useMemo(() => {
    return selectedElements.length > 0 && selectedElements.every((o) => o.visible === false);
  }, [selectedElements]);

  // Map of unique colors -> count of objects in the selection
  const { layerColorCounts, uniqueLayerColors } = useMemo(() => {
    if (internalColor) {
      const norm = internalColor.trim().toUpperCase();
      const map = new Map<string, number>();
      map.set(norm, selectedElements.length || 1);
      return { layerColorCounts: map, uniqueLayerColors: [norm] };
    }

    const map = new Map<string, number>();
    selectedElements.forEach((obj) => {
      const f = ((obj.fill as string) || '').trim().toUpperCase();
      if (f && f !== 'NONE' && f !== 'TRANSPARENT') {
        map.set(f, (map.get(f) || 0) + 1);
      }
    });

    if (map.size === 0 && selectedColors && selectedColors.length > 0) {
      selectedColors.forEach((c) => {
        const norm = c.trim().toUpperCase();
        map.set(norm, 1);
      });
    }

    return {
      layerColorCounts: map,
      uniqueLayerColors: Array.from(map.keys())
    };
  }, [selectedElements, internalColor, currentColor, selectedColors]);

  // Determine primary active color
  const effectiveColor = internalColor || currentColor || uniqueLayerColors[0] || (
    targetObj && typeof targetObj.fill === 'string' ? targetObj.fill : ''
  );

  const handleColorChange = (color: string) => {
    const norm = color.trim().toUpperCase();
    setInternalColor(norm);
    onChangeColor?.(norm);
  };

  if (!menuState.isOpen) return null;

  // Prevent context menu from overflowing the screen boundaries
  const adjustedX = Math.max(10, Math.min(menuState.x, window.innerWidth - 240));
  const adjustedY = Math.max(10, Math.min(menuState.y, window.innerHeight - 420));

  // If right-clicked anywhere on the grid view without an active element selection
  if (!targetObj) {
    return (
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: `${adjustedX}px`,
          top: `${adjustedY}px`,
          zIndex: 99999
        }}
        className="w-52 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl py-1.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100 select-none"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
            Grid View
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xs p-0.5 rounded cursor-pointer ml-1 leading-none"
            title="Close menu"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="py-1">
          {(onShowAll || onToggleHideShowAll) && (
            <button
              onClick={() => {
                if (onShowAll) onShowAll();
                else if (onToggleHideShowAll) onToggleHideShowAll();
                onClose();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-semibold text-slate-800"
            >
              <Eye className="w-4 h-4 text-indigo-500" />
              <span>Show All</span>
              {!areAllVisible && (
                <span className="ml-auto text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                  Hidden
                </span>
              )}
            </button>
          )}

          {(onHideAll || onToggleHideShowAll) && (
            <button
              onClick={() => {
                if (onHideAll) onHideAll();
                else if (onToggleHideShowAll) onToggleHideShowAll();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer text-left font-medium text-slate-600"
            >
              <EyeOff className="w-4 h-4 text-slate-400" />
              <span>Hide All</span>
            </button>
          )}

          {onSelectAll && (
            <button
              onClick={() => {
                onSelectAll();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium text-slate-700"
            >
              <CheckCheck className="w-4 h-4 text-indigo-500" />
              <span>Select All</span>
              <span className="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+A</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
        zIndex: 99999
      }}
      className="w-56 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl shadow-2xl py-1.5 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100 select-none"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header with Element Count / Color Swatch */}
      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
          {selectedElements.length > 1
            ? `${selectedElements.length} Elements Selected`
            : 'Vector Element'}
        </span>
        <div className="flex items-center gap-1.5">
          {effectiveColor && effectiveColor !== 'transparent' && (
            <div className="flex items-center gap-1">
              <span
                className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs inline-block"
                style={{ backgroundColor: effectiveColor }}
              />
              <span className="font-mono text-[10px] text-slate-400 font-bold uppercase">
                {effectiveColor}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xs p-0.5 rounded cursor-pointer ml-1 leading-none"
            title="Close menu"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Layer and Color Selection Actions */}
      <div className="py-1">
        {effectiveColor && onSelectThisLayer && (
          <button
            onClick={() => {
              onSelectThisLayer(effectiveColor);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
          >
            <CheckSquare className="w-4 h-4 text-slate-400" />
            <span>Select all of this layer</span>
          </button>
        )}

        {effectiveColor && onSelectSimilarColor && (
          <button
            onClick={() => {
              onSelectSimilarColor(effectiveColor);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Select all of similar colour</span>
          </button>
        )}

        {onSelectAll && (
          <button
            onClick={() => {
              onSelectAll();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
          >
            <CheckCheck className="w-4 h-4 text-indigo-500" />
            <span>Select all</span>
            <span className="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+A</span>
          </button>
        )}

        {onSelectInverse && (
          <button
            onClick={() => {
              onSelectInverse();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
          >
            <FlipHorizontal className="w-4 h-4 text-slate-400" />
            <span>Select inverse</span>
            <span className="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+Shift+I</span>
          </button>
        )}

        {onUnionSelection && (
          <button
            onClick={() => {
              if (selectedElements.length >= 2) {
                onUnionSelection();
                onClose();
              }
            }}
            disabled={selectedElements.length < 2}
            className={`w-full px-3 py-1.5 flex items-center gap-2.5 transition-colors text-left font-medium ${
              selectedElements.length >= 2
                ? 'hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer text-slate-700'
                : 'opacity-40 cursor-not-allowed text-slate-400'
            }`}
            title={
              selectedElements.length < 2
                ? 'Select 2 or more elements to union'
                : 'Union selected elements into a single path'
            }
          >
            <Layers className="w-4 h-4 text-slate-400" />
            <span>Union Selection</span>
            {selectedElements.length >= 2 && (
              <span className="ml-auto text-[10px] text-slate-400 font-mono">({selectedElements.length})</span>
            )}
          </button>
        )}
      </div>

      {/* Visibility Controls */}
      <div className="my-1 border-t border-slate-100" />
      <div className="py-1">
        {(onShowAll || onToggleHideShowAll) && (
          <button
            onClick={() => {
              if (onShowAll) onShowAll();
              else if (onToggleHideShowAll) onToggleHideShowAll();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium text-slate-700"
          >
            <Eye className="w-4 h-4 text-indigo-500" />
            <span>Show All</span>
            {!areAllVisible && (
              <span className="ml-auto text-[9px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                Hidden
              </span>
            )}
          </button>
        )}

        {onToggleHideShowSelection && (
          <button
            onClick={() => {
              onToggleHideShowSelection();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium text-slate-700"
          >
            {isSelectionHidden ? (
              <>
                <Eye className="w-4 h-4 text-indigo-500" />
                <span>Show Selection</span>
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4 text-slate-400" />
                <span>Hide Selection</span>
              </>
            )}
          </button>
        )}

        {(onHideAll || onToggleHideShowAll) && (
          <button
            onClick={() => {
              if (onHideAll) onHideAll();
              else if (onToggleHideShowAll) onToggleHideShowAll();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer text-left font-medium text-slate-600"
          >
            <EyeOff className="w-4 h-4 text-slate-400" />
            <span>Hide All</span>
          </button>
        )}
      </div>

      <div className="my-1 border-t border-slate-100" />

      {/* Layer Stacking Order */}
      <div className="py-1">
        <button
          onClick={() => {
            onBringToFront();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
        >
          <ArrowUpToLine className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
          <span>Bring to Front</span>
        </button>

        <button
          onClick={() => {
            onBringForward();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
        >
          <ArrowUp className="w-4 h-4 text-slate-400" />
          <span>Bring Forward</span>
        </button>

        <button
          onClick={() => {
            onSendBackward();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
        >
          <ArrowDown className="w-4 h-4 text-slate-400" />
          <span>Send Backward</span>
        </button>

        <button
          onClick={() => {
            onSendToBack();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
        >
          <ArrowDownToLine className="w-4 h-4 text-slate-400" />
          <span>Send to Back</span>
        </button>
      </div>

      <div className="my-1 border-t border-slate-100" />

      {/* Quick Vinyl Color Palette */}
      {onChangeColor && (
        <div className="px-3 py-1.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Palette className="w-3 h-3 text-slate-400" /> Quick Vinyl Color
          </div>
          <div className="grid grid-cols-5 gap-1 pt-0.5 pb-1">
            {PRESET_VINYL_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className={`w-6 h-6 rounded-lg border transition-all cursor-pointer hover:scale-115 flex items-center justify-center ${
                  effectiveColor?.toUpperCase() === color
                    ? 'border-indigo-600 ring-2 ring-indigo-300'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
                style={{ backgroundColor: color }}
                title={`Assign all selected to ${color}`}
              />
            ))}
          </div>

          {/* Custom Colours (Configurable via Settings) */}
          {customColors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-500">
                  <Palette className="w-3 h-3 text-pink-500" /> Custom Colours
                </span>
                <span className="text-[9px] text-slate-400 font-normal">
                  {customColors.length} {customColors.length === 1 ? 'color' : 'colors'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 pt-0.5 pb-1">
                {customColors.map((color) => {
                  const isCurrent = effectiveColor?.toUpperCase() === color.toUpperCase();
                  return (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={`w-6 h-6 rounded-lg border transition-all cursor-pointer hover:scale-115 flex items-center justify-center ${
                        isCurrent
                          ? 'border-indigo-600 ring-2 ring-indigo-300'
                          : 'border-slate-300 hover:border-slate-400'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Assign all selected to custom color ${color}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Colours: square tiles identical in style to Quick Vinyl Color */}
          {uniqueLayerColors.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-slate-500">
                  <Palette className="w-3 h-3 text-indigo-500" /> Selected Colours
                </span>
                <span className="text-[9px] text-slate-400 font-normal">
                  {uniqueLayerColors.length} {uniqueLayerColors.length === 1 ? 'color' : 'colors'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 pt-0.5 pb-1">
                {uniqueLayerColors.map((color) => {
                  const count = layerColorCounts.get(color) || 1;
                  const isCurrent = effectiveColor?.toUpperCase() === color;
                  return (
                    <button
                      key={color}
                      onClick={() => handleColorChange(color)}
                      className={`w-6 h-6 rounded-lg border transition-all cursor-pointer hover:scale-115 flex items-center justify-center ${
                        isCurrent
                          ? 'border-indigo-600 ring-2 ring-indigo-300'
                          : 'border-slate-300 hover:border-slate-400'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Assign all selected to ${color} (${count} element${count === 1 ? '' : 's'})`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="my-1 border-t border-slate-100" />

      {/* Duplicate, Clear Selection & Delete */}
      <div className="py-1">
        <button
          onClick={() => {
            onDuplicate();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer text-left font-medium"
        >
          <Copy className="w-4 h-4 text-slate-400" />
          <span>Duplicate Element</span>
        </button>

        {onClearSelection && (
          <button
            onClick={() => {
              onClearSelection();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer text-left font-medium text-slate-600"
          >
            <XCircle className="w-4 h-4 text-slate-400" />
            <span>Clear selection</span>
          </button>
        )}

        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left font-semibold"
        >
          <Trash2 className="w-4 h-4 text-rose-500" />
          <span>Delete Element</span>
          <span className="ml-auto text-[10px] text-slate-400 font-normal">Del</span>
        </button>
      </div>
    </div>
  );
};
