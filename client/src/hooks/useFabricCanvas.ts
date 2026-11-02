import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Canvas,
  FabricImage,
  FabricObject,
  Rect,
  Circle,
  Polygon,
  Polyline,
  Point,
  ActiveSelection,
  loadSVGFromString,
  Path,
  util
} from 'fabric';
import polygonClipping from 'polygon-clipping';
import { exportCricutSvg, type CricutExportOptions } from '../services/cricutSvgExporter';
import { exportPdf as exportPdfService } from '../services/pdfExporter';
import {
  type MeasurementUnit,
  getStoredUnits,
  setStoredUnits
} from '../services/units';
import {
  type VinylCutSettings,
  getStoredVinylSettings,
  setStoredVinylSettings
} from '../services/vinylCutSettings';
import {
  evaluateVectorReadiness,
  remediateFabricObjects,
  type WeedCheckReport,
  type RemediationStats
} from '../services/vinylRemediation';
import {
  booleanUnionPaths,
  commandsToD,
  commandsToContours,
  flattenColorLayers,
  flattenColorLayersNonOverlapping,
  type FlattenMode,
  pathsToMultiPolygon,
  multiPolygonToSvgD
} from '../services/booleanUnion';
import {
  strokeToMultiPolygon,
  applyStrokeToLayerGeometry,
  createCirclePolygon,
  type Point2D
} from '../services/brushEngine';
import { normalizeHexColor, areColorsMatching } from '../services/colorUtils';
import { smoothSvgPathString } from '../services/outlineSmoothing';

export type CanvasMode = 'raster' | 'vector' | 'compare';
export type CropType = 'none' | 'rect' | 'circle' | 'lasso-freehand' | 'lasso-polygon';
export type BrushMode = 'none' | 'paint' | 'erase' | 'fill';

export interface HistorySnapshot {
  mode: CanvasMode;
  data: string; // PNG data URL or Canvas JSON string
}

export interface SelectionBounds {
  width: number;
  height: number;
  left: number;
  top: number;
  isScaling?: boolean;
  label?: string;
}

export interface CanvasColorLayer {
  color: string;
  count: number;
  visible: boolean;
}

function pointInPolygon(p: { x: number; y: number }, points: { x: number; y: number }[]): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  targetObject: FabricObject | null;
}

export interface MasterVectorPath {
  obj: FabricObject;
  originalFill: string;
  originalStroke: string | null;
  originalStrokeWidth: number;
  area: number;
}

function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6) return [128, 128, 128];
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function colorDistance(c1: string, c2: string): number {
  if (c1.toUpperCase() === c2.toUpperCase()) return 0;
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

function clusterColors(uniqueColors: string[], targetK: number): Map<string, string> {
  const map = new Map<string, string>();
  if (uniqueColors.length <= targetK) {
    uniqueColors.forEach((c) => map.set(c.toUpperCase(), c.toUpperCase()));
    return map;
  }

  const clusters = uniqueColors.map((c) => ({
    rep: c.toUpperCase(),
    members: [c.toUpperCase()]
  }));

  while (clusters.length > targetK) {
    let minDist = Infinity;
    let mergeI = 0;
    let mergeJ = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = colorDistance(clusters[i].rep, clusters[j].rep);
        if (d < minDist) {
          minDist = d;
          mergeI = i;
          mergeJ = j;
        }
      }
    }

    clusters[mergeI].members.push(...clusters[mergeJ].members);
    clusters.splice(mergeJ, 1);
  }

  for (const cl of clusters) {
    for (const mem of cl.members) {
      map.set(mem, cl.rep);
    }
  }

  return map;
}

function extractCommandsFromObject(obj: FabricObject): any[] {
  try {
    if ((obj as any).path && Array.isArray((obj as any).path)) {
      const pathObj = obj as any;
      const offsetX = pathObj.pathOffset?.x || 0;
      const offsetY = pathObj.pathOffset?.y || 0;
      const offsetMatrix = [1, 0, 0, 1, -offsetX, -offsetY];
      const fullMatrix = (util as any).multiplyTransformMatrices(obj.calcTransformMatrix(), offsetMatrix);
      return (util as any).transformPath(pathObj.path, fullMatrix);
    }
    if ((obj as any).points && Array.isArray((obj as any).points)) {
      const pts = (obj as any).points;
      const cmds: any[] = pts.map((pt: any, i: number) => [i === 0 ? 'M' : 'L', pt.x, pt.y]);
      if (cmds.length > 0) cmds.push(['Z']);
      return (util as any).transformPath(cmds, obj.calcTransformMatrix());
    }
    if (obj.type === 'rect') {
      const w = obj.width || 0;
      const h = obj.height || 0;
      const cmds = [
        ['M', -w / 2, -h / 2],
        ['L', w / 2, -h / 2],
        ['L', w / 2, h / 2],
        ['L', -w / 2, h / 2],
        ['Z']
      ];
      return (util as any).transformPath(cmds, obj.calcTransformMatrix());
    }
    if (obj.type === 'group' && (obj as any).getObjects) {
      const all: any[] = [];
      const children: FabricObject[] = (obj as any).getObjects();
      children.forEach((child) => {
        all.push(...extractCommandsFromObject(child));
      });
      return all;
    }
  } catch (err) {
    console.warn('Could not extract path commands from object:', err);
  }
  return [];
}

interface ExtractedSubpath {
  points: { x: number; y: number }[];
  isClosed: boolean;
  area: number;
}

/**
 * Parses raw SVG path commands into discrete subpaths and detects whether each loop is closed.
 */
function extractSubpathsFromCommands(commands: any[]): ExtractedSubpath[] {
  if (!commands || commands.length === 0) return [];
  const subpaths: ExtractedSubpath[] = [];

  let currentPoints: { x: number; y: number }[] = [];
  let isCurrentClosed = false;
  let startPt = { x: 0, y: 0 };
  let currPt = { x: 0, y: 0 };

  const finishCurrent = () => {
    if (currentPoints.length >= 3) {
      const first = currentPoints[0];
      const last = currentPoints[currentPoints.length - 1];
      const dist = Math.hypot(last.x - first.x, last.y - first.y);
      const closed = isCurrentClosed || dist < 2.5;

      let area = 0;
      for (let i = 0, j = currentPoints.length - 1; i < currentPoints.length; j = i++) {
        area += (currentPoints[j].x + currentPoints[i].x) * (currentPoints[j].y - currentPoints[i].y);
      }
      area = Math.abs(area / 2);

      subpaths.push({
        points: [...currentPoints],
        isClosed: closed,
        area
      });
    }
    currentPoints = [];
    isCurrentClosed = false;
  };

  for (const cmd of commands) {
    if (!cmd || cmd.length === 0) continue;
    const type = cmd[0].toUpperCase();

    if (type === 'M') {
      finishCurrent();
      currPt = { x: Number(cmd[1]), y: Number(cmd[2]) };
      startPt = { ...currPt };
      currentPoints = [startPt];
    } else if (type === 'L') {
      currPt = { x: Number(cmd[1]), y: Number(cmd[2]) };
      currentPoints.push(currPt);
    } else if (type === 'C') {
      const p0 = currPt;
      const p1 = { x: Number(cmd[1]), y: Number(cmd[2]) };
      const p2 = { x: Number(cmd[3]), y: Number(cmd[4]) };
      const p3 = { x: Number(cmd[5]), y: Number(cmd[6]) };
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
        const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
        currentPoints.push({ x, y });
      }
      currPt = p3;
    } else if (type === 'Q') {
      const p0 = currPt;
      const p1 = { x: Number(cmd[1]), y: Number(cmd[2]) };
      const p2 = { x: Number(cmd[3]), y: Number(cmd[4]) };
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
        const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
        currentPoints.push({ x, y });
      }
      currPt = p2;
    } else if (type === 'Z') {
      isCurrentClosed = true;
      if (currentPoints.length > 0) {
        currentPoints.push({ ...startPt });
      }
      finishCurrent();
    }
  }

  finishCurrent();
  return subpaths;
}

/**
 * Helper to instantiate a Fabric v6 Path with absolute scene/world coordinates.
 * In Fabric v6, Path calculates pathOffset = (minX + width/2, minY + height/2).
 * Placing it with originX: 'center', originY: 'center', left: pathOffset.x, top: pathOffset.y
 * preserves the exact world coordinates and prevents any positional shift.
 */
function createAbsoluteWorldPath(svgD: string, options: any = {}): Path {
  const p = new Path(svgD.trim(), {
    stroke: null,
    strokeWidth: 0,
    fillRule: 'evenodd',
    perPixelTargetFind: true,
    objectCaching: false,
    ...options,
    originX: 'center',
    originY: 'center'
  });
  p.set({ left: p.pathOffset.x, top: p.pathOffset.y });
  p.setCoords();
  return p;
}

export function useFabricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);

  const [mode, setMode] = useState<CanvasMode>('raster');
  const modeRef = useRef<CanvasMode>('raster');
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedLayerColors, setSelectedLayerColors] = useState<string[]>([]);
  const [isLineArt, setIsLineArt] = useState<boolean>(false);
  const [lineArtPenWidth, setLineArtPenWidth] = useState<number>(2);
  const [lineArtColorMode, setLineArtColorMode] = useState<'black' | 'color'>('black');
  const [hasImage, setHasImage] = useState<boolean>(false);
  const [hasVector, setHasVector] = useState<boolean>(false);
  const [compareData, setCompareData] = useState<{ rasterUrl: string | null; svgString: string | null }>({
    rasterUrl: null,
    svgString: null
  });
  const [isFlattening, setIsFlattening] = useState<boolean>(false);
  const [activeFlattenMode, setActiveFlattenMode] = useState<FlattenMode>('knockout');

  // Undo / Redo Stacks
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Active Crop State
  const [activeCropType, setActiveCropType] = useState<CropType>('none');
  const cropOverlayObjRef = useRef<FabricObject | null>(null);
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const isLassoMouseDownRef = useRef<boolean>(false);
  const [lassoPointsCount, setLassoPointsCount] = useState<number>(0);

  // Master Vector Paths for On-The-Fly Simplification
  const masterPathsRef = useRef<MasterVectorPath[]>([]);
  const uniqueColorsRef = useRef<string[]>([]);
  const [maxColorCount, setMaxColorCount] = useState<number>(1);
  const [activeColorCount, setActiveColorCount] = useState<number>(1);
  const [activeDetailPercent, setActiveDetailPercent] = useState<number>(100);

  // Master Artwork Reference Frame: Anchors the coordinate space of the artwork
  // so deletions (e.g. removing white background), moving, and resizing in Vector Studio
  // always preserve exact 1:1 relative positioning in Compare View
  const masterArtworkFrameRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  // Original Source Artworks for One-Click Reset
  // originalRasterRef stores the untouched original import (file upload) or original AI raster creation
  const originalRasterRef = useRef<string | null>(null);
  // originalVectorRef stores the original converted SVG vector (or direct AI SVG vector)
  const originalVectorRef = useRef<string | null>(null);
  const initialArtworkRef = useRef<{ mode: CanvasMode; data: string } | null>(null);

  // Right-Click Context Menu State
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    targetObject: null
  });

  // Master Selection Bounding Box & Live Measurement Dimensions
  const [selectionBounds, setSelectionBounds] = useState<SelectionBounds | null>(null);
  const shiftPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const shiftBaseObjectsRef = useRef<FabricObject[]>([]);
  const selectObjectsByColorRef = useRef<((color: string) => void) | null>(null);

  // Dynamic Vinyl Color Mats (Synced live from canvas objects)
  const [colorLayers, setColorLayers] = useState<CanvasColorLayer[]>([]);
  const colorLayersRef = useRef<CanvasColorLayer[]>([]);

  useEffect(() => {
    colorLayersRef.current = colorLayers;
  }, [colorLayers]);

  // Measurement Units (inches vs centimeters)
  const [units, setUnits] = useState<MeasurementUnit>(getStoredUnits());

  // Togglable Display Mat Background (purely for preview, never affects export)
  const [matBackground, setMatBackground] = useState<'transparent' | 'white' | 'black'>('transparent');

  // Scale Bar Rulers visibility
  const [showRulers, setShowRulers] = useState<boolean>(true);

  // Mouse cursor tracking for rulers
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Vinyl Cutting Readiness & Weed Check Engine
  const [vinylSettings, setVinylSettingsState] = useState<VinylCutSettings>(getStoredVinylSettings());
  const [isWeedCheckActive, setIsWeedCheckActive] = useState<boolean>(false);
  const [weedCheckReport, setWeedCheckReport] = useState<WeedCheckReport | null>(null);
  const [isRemediating, setIsRemediating] = useState<boolean>(false);
  const [canvasViewportInfo, setCanvasViewportInfo] = useState<{
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
    vpt: number[];
  }>({
    offsetLeft: 0,
    offsetTop: 0,
    width: 700,
    height: 600,
    vpt: [1, 0, 0, 1, 0, 0]
  });

  // Vector Brush & Eraser Engine
  const [brushMode, setBrushMode] = useState<BrushMode>('none');
  const [brushSize, setBrushSize] = useState<number>(20);
  const [activeBrushColor, setActiveBrushColor] = useState<string>('#000000');
  const isBrushMouseDownRef = useRef<boolean>(false);
  const brushStrokePointsRef = useRef<Point2D[]>([]);
  const brushPreviewObjRef = useRef<FabricObject | null>(null);
  const brushTargetPolyRef = useRef<any>([]);
  const brushTargetObjsRef = useRef<FabricObject[]>([]);
  const brushOtherLayersRef = useRef<Map<string, { objs: FabricObject[]; poly: any; zIndex: number }>>(new Map());
  const brushActiveTargetColorRef = useRef<string>('#000000');
  const brushTargetZIndexRef = useRef<number>(0);

  // Right-Mouse Brush Size Quick Resizing
  const [isResizingBrush, setIsResizingBrush] = useState<boolean>(false);
  const [brushResizePos, setBrushResizePos] = useState<{ x: number; y: number } | null>(null);
  const isRightMouseResizingRef = useRef<boolean>(false);
  const brushResizeStartXRef = useRef<number>(0);
  const brushResizeStartSizeRef = useRef<number>(20);
  const brushSizeRef = useRef<number>(brushSize);
  const brushModeRef = useRef<BrushMode>(brushMode);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    brushModeRef.current = brushMode;
  }, [brushMode]);

  // Vector Outline Smoothing State
  const [outlineSmoothing, setOutlineSmoothing] = useState<number>(0);

  // Automatically sync active brush color when a layer is selected
  useEffect(() => {
    if (selectedColor) {
      setActiveBrushColor(selectedColor.toUpperCase());
    } else if (colorLayers.length > 0 && (!activeBrushColor || activeBrushColor === '#000000')) {
      setActiveBrushColor(colorLayers[0].color.toUpperCase());
    }
  }, [selectedColor, colorLayers, activeBrushColor]);

  const isMiddlePanningRef = useRef<boolean>(false);
  const hasMiddlePannedRef = useRef<boolean>(false);
  const lastPanPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const runWeedCheckRef = useRef<(forcedColor?: string) => void>(() => {});
  const deleteSelectedObjectRef = useRef<(target?: FabricObject) => void>(() => {});
  const recenterOnArtworkRef = useRef<() => void>(() => {});
  const pushUndoSnapshotRef = useRef<() => void>(() => {});
  const isHistoryBusyRef = useRef<boolean>(false);
  const transformStartSnapshotRef = useRef<HistorySnapshot | null>(null);
  const captureCurrentSnapshotRef = useRef<() => HistorySnapshot | null>(() => null);
  const lastMiddleClickTimeRef = useRef<number>(0);
  const lastMiddleClickPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const updateViewportTransformRef = useRef<() => void>(() => {});

  // Listen for vinyl settings updates across windows/modals
  useEffect(() => {
    const handleSettingsChange = (e: any) => {
      if (e.detail) {
        setVinylSettingsState(e.detail);
        if (e.detail.enableWeedCheckOverlay !== undefined) {
          setIsWeedCheckActive(e.detail.enableWeedCheckOverlay);
        }
      }
    };
    window.addEventListener('craftly:vinyl-settings-changed', handleSettingsChange);
    return () => window.removeEventListener('craftly:vinyl-settings-changed', handleSettingsChange);
  }, []);

  const toggleUnits = useCallback(() => {
    const next: MeasurementUnit = units === 'in' ? 'cm' : 'in';
    setUnits(next);
    setStoredUnits(next);
  }, [units]);

  // Style objects and group selections with dashed bounding box & proportional resizing
  const applyDashedBoundingStyles = useCallback((obj: FabricObject) => {
    obj.set({
      borderColor: '#4F46E5',
      borderDashArray: [6, 4],
      cornerColor: '#4F46E5',
      cornerStrokeColor: '#FFFFFF',
      cornerSize: 11,
      transparentCorners: false,
      cornerStyle: 'circle',
      lockUniScaling: true // Resize in proportion!
    });
  }, []);

  // Compute live distinct color mats from all objects currently on canvas
  const refreshColorLayers = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      setColorLayers([]);
      return;
    }

    const allObjects = new Set<FabricObject>();
    const collectLeaves = (o: any) => {
      if (!o || o.name === 'crop-overlay' || o.name === 'lasso-preview' || (o as any).name === 'raster-target') return;
      if (o.type === 'activeSelection' || (o.type === 'group' && typeof o.getObjects === 'function' && !o.fill)) {
        const children = o.getObjects ? o.getObjects() : o._objects;
        if (Array.isArray(children)) {
          children.forEach(collectLeaves);
          return;
        }
      }
      allObjects.add(o);
    };

    canvas.getObjects().forEach(collectLeaves);
    const active = canvas.getActiveObject();
    if (active) {
      collectLeaves(active);
    }

    // Objects are ordered from bottom (z-index 0) to top (z-index N-1) in Fabric.
    // In our Active Mats list, the user expects TOP / foreground at the top of the list (index 0).
    // So we iterate objects in reverse (from top of stack down to bottom)
    const map = new Map<string, { count: number; visibleCount: number }>();
    const reversed = Array.from(allObjects).reverse();

    reversed.forEach((obj) => {
      const fillRaw = ((obj.fill as string) || '').trim();
      const origFill = (((obj as any)._originalFill as string) || '').trim();
      const stroke = ((obj.stroke as string) || '').trim();
      const fill = fillRaw && fillRaw !== 'none' && fillRaw !== 'transparent'
        ? fillRaw
        : origFill && origFill !== 'none' && origFill !== 'transparent'
        ? origFill
        : stroke && stroke !== 'none' && stroke !== 'transparent'
        ? stroke
        : '#000000';
      const color = fill.toUpperCase();
      const isVis = obj.visible !== false;
      const cur = map.get(color) || { count: 0, visibleCount: 0 };
      cur.count++;
      if (isVis) cur.visibleCount++;
      map.set(color, cur);
    });

    const result: CanvasColorLayer[] = [];
    map.forEach((val, col) => {
      if (val.count > 0) {
        result.push({
          color: col,
          count: val.count,
          visible: val.visibleCount > 0
        });
      }
    });

    colorLayersRef.current = result;
    setColorLayers(result);

    const distinctColors = result.map((r) => r.color);
    uniqueColorsRef.current = distinctColors;
    setMaxColorCount(Math.max(distinctColors.length, 2));
    setActiveColorCount(distinctColors.length);
  }, []);

  // Cache current SVG
  const currentSvgRef = useRef<string | null>(null);

  // Initialize Fabric Canvas
  useEffect(() => {
    if (!canvasRef.current || fabricCanvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      width: 700,
      height: 600,
      backgroundColor: 'transparent',
      selection: true,
      selectionKey: 'shiftKey',
      selectionColor: 'rgba(79, 70, 229, 0.15)',
      selectionBorderColor: '#4F46E5',
      selectionLineWidth: 1.5,
      selectionDashArray: [4, 4],
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
      fireMiddleClick: true,
      perPixelTargetFind: true,
      targetFindTolerance: 4
    });

    fabricCanvasRef.current = canvas;

    const updateSelectedColorsFromActive = () => {
      const active = canvas.getActiveObject();
      if (!active) {
        setSelectedObject(null);
        setSelectedColor(null);
        setSelectedLayerColors([]);
        return;
      }
      setSelectedObject(active);

      const isMulti = active instanceof ActiveSelection || (active as any).type?.toLowerCase() === 'activeselection' || typeof (active as any).getObjects === 'function';
      let objs: FabricObject[] = [];
      if (isMulti) {
        objs = (active as any).getObjects();
      } else {
        objs = [active];
      }

      const colorsSet = new Set<string>();
      objs.forEach((o) => {
        const f = ((o.fill as string) || '').trim().toUpperCase();
        if (f && f !== 'NONE' && f !== 'TRANSPARENT') {
          colorsSet.add(f);
        }
      });
      const uniqueCols = Array.from(colorsSet);
      if (uniqueCols.length > 0) {
        setSelectedColor(uniqueCols[0]);
        setSelectedLayerColors(uniqueCols);
      } else {
        setSelectedColor(null);
        setSelectedLayerColors([]);
      }
    };

    const updateSelectionInfo = (target?: FabricObject | null, isScaling = false) => {
      const active = target || canvas.getActiveObject();
      if (!active) {
        setSelectionBounds(null);
        return;
      }

      const isCropOverlay = (active as any).name === 'crop-overlay' || active === cropOverlayObjRef.current;
      if (!isCropOverlay) {
        applyDashedBoundingStyles(active);
      }

      const zoom = canvas.getZoom() || 1;
      const b = active.getBoundingRect();

      const trueWidth = Math.max(Math.round((b.width / zoom) * 100) / 100, 1);
      const trueHeight = Math.max(Math.round((b.height / zoom) * 100) / 100, 1);

      let label = 'Component';
      if (isCropOverlay) {
        label = 'Crop Area';
      } else if ((active as any).type === 'activeSelection') {
        const count = typeof (active as any).getObjects === 'function' ? (active as any).getObjects().length : 2;
        label = `${count} Elements`;
      } else if ((active as any).name === 'raster-target') {
        label = 'Artwork';
      }

      setSelectionBounds({
        width: trueWidth,
        height: trueHeight,
        left: b.left,
        top: b.top,
        isScaling,
        label
      });
    };

    canvas.on('selection:created', () => {
      updateSelectionInfo();
      updateSelectedColorsFromActive();
      runWeedCheckRef.current();
    });

    canvas.on('selection:updated', () => {
      updateSelectionInfo();
      updateSelectedColorsFromActive();
      runWeedCheckRef.current();
    });

    canvas.on('selection:cleared', () => {
      setSelectedObject(null);
      setSelectedColor(null);
      setSelectedLayerColors([]);
      setSelectionBounds(null);
      runWeedCheckRef.current();
    });

    canvas.on('object:scaling', (opt) => updateSelectionInfo(opt.target, true));
    canvas.on('object:resizing', (opt) => updateSelectionInfo(opt.target, true));
    canvas.on('object:moving', (opt) => updateSelectionInfo(opt.target, false));
    canvas.on('object:modified', (opt) => {
      if (transformStartSnapshotRef.current) {
        const stack = undoStackRef.current;
        const startSnap = transformStartSnapshotRef.current;
        const top = stack[stack.length - 1];
        if (!top || top.mode !== startSnap.mode || top.data !== startSnap.data) {
          stack.push(startSnap);
          if (stack.length > 50) stack.shift();
          redoStackRef.current = [];
          setCanUndo(true);
          setCanRedo(false);
        }
        transformStartSnapshotRef.current = null;
      }
      if (opt.target) {
        (opt.target as any)._baseSvgD = null;
      }
      updateSelectionInfo(opt.target, false);
      refreshColorLayers();
      runWeedCheckRef.current();
    });

    canvas.on('mouse:up', (opt) => {
      const me = opt.e as MouseEvent;
      if (me?.button === 1 || isMiddlePanningRef.current) {
        const wasPanning = isMiddlePanningRef.current;
        const hadPanned = hasMiddlePannedRef.current;
        isMiddlePanningRef.current = false;
        hasMiddlePannedRef.current = false;
        canvas.selection = brushModeRef.current === 'none';
        canvas.defaultCursor = brushModeRef.current === 'fill' ? 'cell' : brushModeRef.current !== 'none' ? 'crosshair' : 'default';
        canvas.setCursor(canvas.defaultCursor);
        canvas.calcOffset();
        updateViewportTransformRef.current();

        if (me?.button === 1 && !hadPanned) {
          const now = Date.now();
          const timeDiff = now - lastMiddleClickTimeRef.current;
          if (timeDiff > 30 && timeDiff < 380) {
            lastMiddleClickTimeRef.current = 0;
            recenterOnArtworkRef.current();
          } else {
            lastMiddleClickTimeRef.current = now;
          }
        }
        return;
      }

      // Handle Shift-drag marquee selection (merge newly marquee-selected with previously selected)
      if (me?.button === 0 && shiftPointerStartRef.current) {
        canvas.skipTargetFind = false;
        const dist = Math.hypot(me.clientX - shiftPointerStartRef.current.x, me.clientY - shiftPointerStartRef.current.y);
        shiftPointerStartRef.current = null;

        if (dist > 4 && shiftBaseObjectsRef.current.length > 0) {
          const newlySelected = canvas.getActiveObjects();
          const combined = Array.from(new Set([...shiftBaseObjectsRef.current, ...newlySelected]));
          if (combined.length > 1) {
            const as = new ActiveSelection(combined, { canvas });
            applyDashedBoundingStyles(as);
            canvas.setActiveObject(as);
          } else if (combined.length === 1) {
            applyDashedBoundingStyles(combined[0]);
            canvas.setActiveObject(combined[0]);
          }
          canvas.renderAll();
          updateSelectionInfo();
          updateSelectedColorsFromActive();
        }
        shiftBaseObjectsRef.current = [];
      }

      const a = canvas.getActiveObject();
      if (a) {
        updateSelectionInfo(a, false);
        updateSelectedColorsFromActive();
        runWeedCheckRef.current();
      }
    });

    canvas.on('after:render', () => {
      updateViewportTransformRef.current();
    });

    canvas.on('mouse:move', (opt) => {
      const me = opt.e as MouseEvent;
      if (isMiddlePanningRef.current) {
        me.preventDefault();
        const dx = me.clientX - lastPanPosRef.current.x;
        const dy = me.clientY - lastPanPosRef.current.y;
        if (Math.hypot(dx, dy) > 2) {
          hasMiddlePannedRef.current = true;
        }
        lastPanPosRef.current = { x: me.clientX, y: me.clientY };
        canvas.relativePan(new Point(dx, dy));
        canvas.requestRenderAll();
        updateViewportTransformRef.current();
        return;
      }
      const p = canvas.getPointer(opt.e);
      setCursorPos({ x: p.x, y: p.y });
    });

    canvas.on('mouse:out', () => {
      setCursorPos(null);
    });

    // Close context menu on left click, handle middle-click panning on canvas, and Shift selection
    canvas.on('mouse:down', (opt) => {
      const me = opt.e as MouseEvent;
      if (me.button === 1) {
        me.preventDefault();
        me.stopPropagation();
        isMiddlePanningRef.current = true;
        hasMiddlePannedRef.current = false;
        lastPanPosRef.current = { x: me.clientX, y: me.clientY };
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
        canvas.setCursor('grabbing');
        return;
      }
      if (me.button === 0) {
        setContextMenuState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));

        // Pre-record canvas snapshot in case user moves, scales, or rotates an object
        transformStartSnapshotRef.current = captureCurrentSnapshotRef.current();

        if (me.shiftKey && brushModeRef.current === 'none') {
          // Record starting pointer and active objects for Shift-drag merge
          shiftPointerStartRef.current = { x: me.clientX, y: me.clientY };
          shiftBaseObjectsRef.current = canvas.getActiveObjects().slice();
          canvas.selection = true;
        } else {
          shiftPointerStartRef.current = null;
          shiftBaseObjectsRef.current = [];
        }
      }
    });

    // Handle double-click on vector element: select all elements of that layer/colour
    const handleCanvasDblClick = (opt: any) => {
      if (modeRef.current !== 'vector') return;
      const evt = opt.e || opt;
      const pointer = canvas.getPointer(evt);

      // Check active object first, then findTarget
      const activeObj = canvas.getActiveObject();
      let target: FabricObject | null = null;
      if (activeObj && (activeObj as any).containsPoint && (activeObj as any).containsPoint(pointer)) {
        if ((activeObj as any).type === 'activeSelection') {
          const objs = (activeObj as any).getObjects ? (activeObj as any).getObjects() : (activeObj as any)._objects;
          const subTarget = objs?.find((o: any) => o.containsPoint && o.containsPoint(pointer));
          target = subTarget || objs?.[0] || activeObj;
        } else {
          target = activeObj;
        }
      }
      if (!target) {
        target = opt.target || canvas.findTarget(evt);
      }

      if (
        target &&
        target !== cropOverlayObjRef.current &&
        (target as any).name !== 'lasso-preview' &&
        (target as any).name !== 'raster-target'
      ) {
        let color: string | null = null;
        if ((target as any).type === 'activeSelection') {
          const objs = (target as any).getObjects ? (target as any).getObjects() : (target as any)._objects;
          color = ((objs?.[0]?.fill as string) || '').trim();
        } else {
          color = ((target.fill as string) || '').trim();
        }
        if (color && color !== 'none' && color !== 'transparent') {
          if (selectObjectsByColorRef.current) {
            selectObjectsByColorRef.current(color);
          }
        }
      }
    };

    canvas.on('mouse:dblclick', handleCanvasDblClick);

    // Handle right-click context menu on canvas elements
    canvas.on('contextmenu', (opt) => {
      const e = opt.e as MouseEvent;
      e.preventDefault();
      e.stopPropagation();

      // In brush mode, right-click is dedicated to brush size dragging
      if (brushModeRef.current !== 'none') {
        return;
      }

      const target = opt.target || canvas.findTarget(e);
      const activeObj = canvas.getActiveObject();

      let effectiveTarget: FabricObject | null = null;

      // If activeObj is an ActiveSelection or multi-selection, preserve it when right-clicking on or inside it
      if (
        activeObj &&
        (activeObj instanceof ActiveSelection ||
         (activeObj as any).type?.toLowerCase() === 'activeselection' ||
         typeof (activeObj as any).getObjects === 'function')
      ) {
        const activeGroup = activeObj as any;
        const groupObjects: FabricObject[] = typeof activeGroup.getObjects === 'function'
          ? activeGroup.getObjects()
          : activeGroup._objects || [];

        const pointer = canvas.getPointer(e);
        const isTargetInSelection = target === activeObj || (target && groupObjects.includes(target));
        const isPointInSelection = typeof activeGroup.containsPoint === 'function'
          ? activeGroup.containsPoint(pointer)
          : false;

        if (isTargetInSelection || isPointInSelection || !target) {
          effectiveTarget = activeObj;
          setSelectedObject(activeObj);
        }
      } else if (target && target !== cropOverlayObjRef.current && (target as any).name !== 'lasso-preview') {
        applyDashedBoundingStyles(target);
        canvas.setActiveObject(target);
        setSelectedObject(target);
        if (target.fill && typeof target.fill === 'string') {
          setSelectedColor(target.fill);
          setSelectedLayerColors([target.fill.trim().toUpperCase()]);
        }
        updateSelectionInfo(target);
        canvas.renderAll();
        effectiveTarget = target;
      } else if (activeObj) {
        effectiveTarget = activeObj;
      }

      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        targetObject: effectiveTarget && effectiveTarget !== cropOverlayObjRef.current ? effectiveTarget : null
      });
    });

    canvas.on('mouse:wheel', (opt) => {
      const evt = opt.e as WheelEvent;
      evt.preventDefault();
      evt.stopPropagation();
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** evt.deltaY;
      if (zoom > 5) zoom = 5;
      if (zoom < 0.2) zoom = 0.2;
      const point = new Point(evt.offsetX, evt.offsetY);
      canvas.zoomToPoint(point, zoom);
      setZoomLevel(Math.round(zoom * 100) / 100);
    });

    const handleResize = () => {
      if (!containerRef.current || !fabricCanvasRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      if (width > 0 && height > 0) {
        fabricCanvasRef.current.setDimensions({ width, height });
        fabricCanvasRef.current.renderAll();
      }
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
      handleResize();
    }

    const handleMiddleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        isMiddlePanningRef.current = true;
        hasMiddlePannedRef.current = false;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        canvas.selection = false;
        canvas.defaultCursor = 'grabbing';
        canvas.setCursor('grabbing');
      }
    };

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isMiddlePanningRef.current) {
        e.preventDefault();
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        if (Math.hypot(dx, dy) > 2) {
          hasMiddlePannedRef.current = true;
        }
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        canvas.relativePan(new Point(dx, dy));
        canvas.requestRenderAll();
        updateViewportTransformRef.current();
      }
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        canvas.skipTargetFind = false;
        shiftPointerStartRef.current = null;
      }
      if (e.button === 1 || isMiddlePanningRef.current) {
        const wasPanning = isMiddlePanningRef.current;
        const hadPanned = hasMiddlePannedRef.current;
        if (wasPanning) {
          isMiddlePanningRef.current = false;
          hasMiddlePannedRef.current = false;
          canvas.selection = brushModeRef.current === 'none';
          canvas.defaultCursor = brushModeRef.current === 'fill' ? 'cell' : brushModeRef.current !== 'none' ? 'crosshair' : 'default';
          canvas.setCursor(canvas.defaultCursor);
          canvas.calcOffset();
          updateViewportTransformRef.current();
        }
        if (e.button === 1 && !hadPanned) {
          const now = Date.now();
          const timeDiff = now - lastMiddleClickTimeRef.current;
          if (timeDiff > 30 && timeDiff < 380) {
            lastMiddleClickTimeRef.current = 0;
            recenterOnArtworkRef.current();
          } else {
            lastMiddleClickTimeRef.current = now;
          }
        }
      }
    };

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const upperEl = canvas.upperCanvasEl;
    const wrapperEl = (canvas as any).wrapperEl;
    const containerEl = containerRef.current;

    const handleContainerContextMenu = (e: MouseEvent) => {
      if (brushModeRef.current !== 'none') return;
      e.preventDefault();
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        targetObject: canvas.getActiveObject() || null
      });
    };

    const handleUpperDblClick = (e: MouseEvent) => {
      handleCanvasDblClick({ e });
    };

    // Multi-touch Pinch-to-Zoom & Pan Tracking for Touch / Hands-free Devices
    let isTouchPinching = false;
    let initialTouchDist = 0;
    let initialTouchZoom = 1;
    let lastTouchMidpoint = { x: 0, y: 0 };
    let isTouchPanning = false;

    const handleCanvasTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isTouchPinching = true;
        isTouchPanning = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialTouchDist = dist > 0 ? dist : 1;
        initialTouchZoom = canvas.getZoom();

        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        lastTouchMidpoint = { x: midX, y: midY };

        canvas.selection = false;
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        lastTouchMidpoint = { x: t.clientX, y: t.clientY };

        // If brush mode is active, let brush engine handle drawing
        if (brushModeRef.current !== 'none') return;

        // Check if user touched an object or empty canvas / mat
        const target = canvas.findTarget(e);
        if (!target || target === canvas.backgroundImage || (target as any).name === 'mat-background') {
          isTouchPanning = true;
          canvas.selection = false;
        }
      }
    };

    const handleCanvasTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isTouchPinching) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;

        // 1. Pan delta
        const dx = midX - lastTouchMidpoint.x;
        const dy = midY - lastTouchMidpoint.y;
        lastTouchMidpoint = { x: midX, y: midY };
        canvas.relativePan(new Point(dx, dy));

        // 2. Pinch zoom around midpoint
        if (initialTouchDist > 0) {
          const scale = currentDist / initialTouchDist;
          let newZoom = initialTouchZoom * scale;
          if (newZoom > 5) newZoom = 5;
          if (newZoom < 0.2) newZoom = 0.2;

          const rect = upperEl.getBoundingClientRect();
          const focalPoint = new Point(midX - rect.left, midY - rect.top);
          canvas.zoomToPoint(focalPoint, newZoom);
          setZoomLevel(Math.round(newZoom * 100) / 100);
        }

        canvas.requestRenderAll();
        updateViewportTransformRef.current();
      } else if (e.touches.length === 1 && isTouchPanning) {
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - lastTouchMidpoint.x;
        const dy = t.clientY - lastTouchMidpoint.y;
        lastTouchMidpoint = { x: t.clientX, y: t.clientY };
        canvas.relativePan(new Point(dx, dy));
        canvas.requestRenderAll();
        updateViewportTransformRef.current();
      }
    };

    const handleCanvasTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isTouchPinching = false;
        initialTouchDist = 0;
      }
      if (e.touches.length === 0) {
        isTouchPanning = false;
        canvas.selection = brushModeRef.current === 'none';
        canvas.calcOffset();
        updateViewportTransformRef.current();
      }
    };

    if (upperEl) {
      upperEl.addEventListener('mousedown', handleMiddleMouseDown);
      upperEl.addEventListener('auxclick', handleAuxClick);
      upperEl.addEventListener('dblclick', handleUpperDblClick);
      upperEl.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
      upperEl.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
      upperEl.addEventListener('touchend', handleCanvasTouchEnd);
      upperEl.addEventListener('touchcancel', handleCanvasTouchEnd);
    }
    if (wrapperEl && wrapperEl !== upperEl) {
      wrapperEl.addEventListener('mousedown', handleMiddleMouseDown);
      wrapperEl.addEventListener('auxclick', handleAuxClick);
    }
    if (containerEl) {
      containerEl.addEventListener('mousedown', handleMiddleMouseDown);
      containerEl.addEventListener('auxclick', handleAuxClick);
      containerEl.addEventListener('contextmenu', handleContainerContextMenu);
    }

    window.addEventListener('mousemove', handleWindowMouseMove, { passive: false });
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('auxclick', handleAuxClick);

    return () => {
      if (upperEl) {
        upperEl.removeEventListener('mousedown', handleMiddleMouseDown);
        upperEl.removeEventListener('auxclick', handleAuxClick);
        upperEl.removeEventListener('dblclick', handleUpperDblClick);
        upperEl.removeEventListener('touchstart', handleCanvasTouchStart);
        upperEl.removeEventListener('touchmove', handleCanvasTouchMove);
        upperEl.removeEventListener('touchend', handleCanvasTouchEnd);
        upperEl.removeEventListener('touchcancel', handleCanvasTouchEnd);
      }
      if (wrapperEl && wrapperEl !== upperEl) {
        wrapperEl.removeEventListener('mousedown', handleMiddleMouseDown);
        wrapperEl.removeEventListener('auxclick', handleAuxClick);
      }
      if (containerEl) {
        containerEl.removeEventListener('mousedown', handleMiddleMouseDown);
        containerEl.removeEventListener('auxclick', handleAuxClick);
        containerEl.removeEventListener('contextmenu', handleContainerContextMenu);
      }
      if (containerEl) {
        containerEl.removeEventListener('mousedown', handleMiddleMouseDown);
        containerEl.removeEventListener('auxclick', handleAuxClick);
      }
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('auxclick', handleAuxClick);
      resizeObserver.disconnect();
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  const centerObject = useCallback((obj: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    obj.set({
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center'
    });
    obj.setCoords();
  }, []);

  const updateViewportTransform = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const canvasEl = canvas.getElement();
    if (!canvasEl) return;

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvasEl.getBoundingClientRect();
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

    setCanvasViewportInfo({
      offsetLeft: Math.round(canvasRect.left - containerRect.left),
      offsetTop: Math.round(canvasRect.top - containerRect.top),
      width: Math.round(canvasRect.width),
      height: Math.round(canvasRect.height),
      vpt: [vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]]
    });
  }, []);

  updateViewportTransformRef.current = updateViewportTransform;

  const runWeedCheck = useCallback((forcedColor?: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) {
      setWeedCheckReport(null);
      return;
    }

    const allObjects = canvas.getObjects().filter((obj) => {
      const name = (obj as any).name;
      return name !== 'crop-overlay' && name !== 'lasso-preview' && obj.visible !== false;
    });

    if (allObjects.length === 0) {
      setWeedCheckReport(null);
      return;
    }

    // Determine target layer/objects:
    // If a layer/object is selected, apply ONLY to the selected layer; otherwise apply to all.
    let targetObjects: FabricObject[] = [];
    let targetColorLabel: string | null = null;

    if (forcedColor) {
      const targetCol = forcedColor.trim().toUpperCase();
      targetObjects = allObjects.filter((obj) => {
        const fill = ((obj.fill as string) || '').trim().toUpperCase();
        return fill === targetCol;
      });
      targetColorLabel = targetCol;
    } else {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        if ((activeObj as any).type === 'activeSelection') {
          const selObjs: FabricObject[] = (activeObj as any).getObjects ? (activeObj as any).getObjects() : [];
          targetObjects = selObjs.filter((o: any) => o.name !== 'crop-overlay' && o.name !== 'lasso-preview');
          const firstFill = ((targetObjects[0]?.fill as string) || '').trim().toUpperCase();
          targetColorLabel = firstFill || 'Selection';
        } else {
          const activeColor = ((activeObj.fill as string) || '').trim().toUpperCase();
          if (activeColor && activeColor !== 'NONE' && activeColor !== 'TRANSPARENT') {
            targetObjects = allObjects.filter((obj) => {
              const fill = ((obj.fill as string) || '').trim().toUpperCase();
              return fill === activeColor;
            });
            targetColorLabel = activeColor;
          } else {
            targetObjects = [activeObj];
            targetColorLabel = 'Selected Element';
          }
        }
      }
    }

    // If no layer/object is selected, apply to all cuttable objects
    if (targetObjects.length === 0) {
      targetObjects = allObjects;
      targetColorLabel = null;
    }

    const report = evaluateVectorReadiness(targetObjects, vinylSettings, targetColorLabel);
    setWeedCheckReport(report);
  }, [vinylSettings]);

  runWeedCheckRef.current = runWeedCheck;

  const toggleWeedCheck = useCallback(() => {
    setIsWeedCheckActive((prev) => {
      const next = !prev;
      const updated = { ...vinylSettings, enableWeedCheckOverlay: next };
      setVinylSettingsState(updated);
      setStoredVinylSettings(updated);
      return next;
    });
  }, [vinylSettings]);

  // Auto-run weed check when active or whenever objects change
  useEffect(() => {
    if (isWeedCheckActive && hasVector) {
      runWeedCheck();
    }
  }, [isWeedCheckActive, hasVector, colorLayers, runWeedCheck]);

  const exportSvg = useCallback((overrideOptions: CricutExportOptions = {}): string => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return '';
    return exportCricutSvg(canvas, {
      isLineArt,
      lineArtOptions: {
        penWidth: lineArtPenWidth,
        colorMode: lineArtColorMode
      },
      vinylRemediation: {
        enabled:
          vinylSettings.autoRemoveSpecks ||
          vinylSettings.autoFilletCorners ||
          vinylSettings.autoBridgeGaps ||
          vinylSettings.autoThickenThinLines,
        settings: vinylSettings
      },
      ...overrideOptions
    });
  }, [isLineArt, lineArtPenWidth, lineArtColorMode, vinylSettings]);

  const getRasterDataUrl = useCallback((): string => {
    // If the original uncropped raster data URL is preserved, return it directly for 100% loss-free vectorization
    if (originalRasterRef.current && originalRasterRef.current.startsWith('data:image/') && activeCropType === 'none') {
      return originalRasterRef.current;
    }

    const canvas = fabricCanvasRef.current;
    if (!canvas) return '';

    if (cropOverlayObjRef.current) {
      cropOverlayObjRef.current.set('visible', false);
    }

    // If an explicit raster target exists, export ONLY its bounding frame without empty canvas borders
    const target = canvas.getObjects().find((o) => (o as any).name === 'raster-target');
    let dataUrl: string;
    if (target) {
      const b = target.getBoundingRect();
      dataUrl = canvas.toDataURL({
        format: 'png',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        multiplier: 2
      } as any);
    } else {
      dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: 2
      } as any);
    }

    if (cropOverlayObjRef.current) {
      cropOverlayObjRef.current.set('visible', true);
      canvas.renderAll();
    }
    return dataUrl;
  }, [activeCropType]);

  /**
   * Capture a snapshot for the history stack (JSON serialization preserves exact positions with zero drift)
   */
  const captureCurrentSnapshot = useCallback((): HistorySnapshot | null => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    if (mode === 'vector') {
      return {
        mode: 'vector',
        data: JSON.stringify(
          (canvas as any).toJSON([
            '_originalFill',
            '_originalStroke',
            '_originalStrokeWidth',
            '_baseSvgD',
            'name',
            'selectable',
            'hasControls'
          ])
        )
      };
    }
    const rasterData = getRasterDataUrl();
    if (rasterData) {
      return { mode: 'raster', data: rasterData };
    }
    return null;
  }, [mode, getRasterDataUrl]);

  captureCurrentSnapshotRef.current = captureCurrentSnapshot;

  const pushUndoSnapshot = useCallback(() => {
    const snap = captureCurrentSnapshot();
    if (!snap) return;

    const stack = undoStackRef.current;
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.mode === snap.mode && top.data === snap.data) {
        return; // Avoid pushing duplicate identical snapshot
      }
    }

    stack.push(snap);
    if (stack.length > 50) {
      stack.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, [captureCurrentSnapshot]);

  pushUndoSnapshotRef.current = pushUndoSnapshot;

  const remediateCanvasVectors = useCallback((): RemediationStats | null => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;
    setIsRemediating(true);
    try {
      pushUndoSnapshot();
      const stats = remediateFabricObjects(canvas, vinylSettings);
      refreshColorLayers();
      const objects = canvas
        .getObjects()
        .filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');
      setWeedCheckReport(evaluateVectorReadiness(objects, vinylSettings));

      // Rebuild masterPathsRef so simplification sliders and detail filters stay synced
      masterPathsRef.current = objects.map((obj) => {
        const b = obj.getBoundingRect();
        const fillStr = (typeof obj.fill === 'string' && obj.fill !== 'none' ? obj.fill : '#000000').trim().toUpperCase();
        return {
          obj,
          originalFill: (obj as any)._originalFill || fillStr,
          originalStroke: typeof obj.stroke === 'string' ? obj.stroke : null,
          originalStrokeWidth: obj.strokeWidth || 0,
          area: b.width * b.height
        };
      });

      return stats;
    } finally {
      setIsRemediating(false);
    }
  }, [vinylSettings, pushUndoSnapshot, refreshColorLayers]);

  /**
   * Select All Vectors / Artwork: Encloses all visible paths or images inside a dashed bounding box,
   * enabling moving the entire design and proportional resizing.
   */
  const selectAllVectors = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const objects = canvas
      .getObjects()
      .filter((o) => o.visible && (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');
    if (objects.length === 0) {
      setSelectionBounds(null);
      return;
    }

    const uniqueColors = Array.from(
      new Set(
        objects
          .map((o) => ((o.fill as string) || '').trim().toUpperCase())
          .filter((c) => c && c !== 'NONE' && c !== 'TRANSPARENT')
      )
    );
    setSelectedLayerColors(uniqueColors);
    if (uniqueColors.length > 0) {
      setSelectedColor(uniqueColors[0]);
    }

    const zoom = canvas.getZoom() || 1;

    if (objects.length === 1) {
      applyDashedBoundingStyles(objects[0]);
      canvas.setActiveObject(objects[0]);
      setSelectedObject(objects[0]);
      if (objects[0].fill && typeof objects[0].fill === 'string') {
        setSelectedColor(objects[0].fill);
      }
      const b = objects[0].getBoundingRect();
      setSelectionBounds({
        width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
        height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
        left: b.left,
        top: b.top,
        label: '1 Element'
      });
    } else {
      const selection = new ActiveSelection(objects, { canvas });
      applyDashedBoundingStyles(selection);
      canvas.setActiveObject(selection);
      setSelectedObject(selection);
      const b = selection.getBoundingRect();
      setSelectionBounds({
        width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
        height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
        left: b.left,
        top: b.top,
        label: `${objects.length} Elements`
      });
    }
    canvas.renderAll();
  }, [applyDashedBoundingStyles]);

  /**
   * Inverts the current selection: selects all selectable vector objects that are NOT currently selected.
   */
  const selectInverseVectors = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // All cuttable visible vector objects
    const allObjects = canvas
      .getObjects()
      .filter(
        (o) =>
          o.visible &&
          (o as any).name !== 'crop-overlay' &&
          (o as any).name !== 'lasso-preview' &&
          (o as any).name !== 'raster-target' &&
          !(o as any).excludeFromExport
      );

    if (allObjects.length === 0) {
      canvas.discardActiveObject();
      setSelectedObject(null);
      setSelectedLayerColors([]);
      setSelectionBounds(null);
      canvas.renderAll();
      return;
    }

    // Get currently selected leaf objects
    const currentSelected = canvas.getActiveObjects().filter((o) => (o as any).name !== 'crop-overlay');
    const selectedSet = new Set(currentSelected);

    // Inverse objects: all cuttable objects not in current selection
    const inverseObjects = allObjects.filter((o) => !selectedSet.has(o));

    if (inverseObjects.length === 0) {
      // If everything was selected, inverse selection clears selection
      canvas.discardActiveObject();
      setSelectedObject(null);
      setSelectedLayerColors([]);
      setSelectionBounds(null);
      canvas.renderAll();
      return;
    }

    const uniqueColors = Array.from(
      new Set(
        inverseObjects
          .map((o) => ((o.fill as string) || '').trim().toUpperCase())
          .filter((c) => c && c !== 'NONE' && c !== 'TRANSPARENT')
      )
    );
    setSelectedLayerColors(uniqueColors);
    if (uniqueColors.length > 0) {
      setSelectedColor(uniqueColors[0]);
    }

    const zoom = canvas.getZoom() || 1;

    if (inverseObjects.length === 1) {
      applyDashedBoundingStyles(inverseObjects[0]);
      canvas.setActiveObject(inverseObjects[0]);
      setSelectedObject(inverseObjects[0]);
      if (inverseObjects[0].fill && typeof inverseObjects[0].fill === 'string') {
        setSelectedColor(inverseObjects[0].fill);
      }
      const b = inverseObjects[0].getBoundingRect();
      setSelectionBounds({
        width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
        height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
        left: b.left,
        top: b.top,
        label: '1 Element'
      });
    } else {
      const selection = new ActiveSelection(inverseObjects, { canvas });
      applyDashedBoundingStyles(selection);
      canvas.setActiveObject(selection);
      setSelectedObject(selection);
      const b = selection.getBoundingRect();
      setSelectionBounds({
        width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
        height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
        left: b.left,
        top: b.top,
        label: `${inverseObjects.length} Elements`
      });
    }
    canvas.renderAll();
  }, [applyDashedBoundingStyles]);

  /**
   * Internal render without pushing history (used by undo/redo and initial load)
   */
  const renderRasterInternal = useCallback(async (dataUrl: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.clear();
    cropOverlayObjRef.current = null;
    setActiveCropType('none');
    lassoPointsRef.current = [];
    setLassoPointsCount(0);
    setIsLineArt(false);

    const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' });

    const maxDim = Math.min(canvas.width * 0.8, canvas.height * 0.8);
    const imgWidth = img.width || 500;
    const imgHeight = img.height || 500;
    const scale = Math.min(maxDim / imgWidth, maxDim / imgHeight, 1);

    img.set({
      scaleX: scale,
      scaleY: scale,
      selectable: true,
      hasControls: true,
      name: 'raster-target'
    });

    centerObject(img);
    applyDashedBoundingStyles(img);
    canvas.add(img);
    canvas.setActiveObject(img);
    setSelectedObject(img);
    const b = img.getBoundingRect();
    masterArtworkFrameRef.current = {
      left: b.left,
      top: b.top,
      width: b.width,
      height: b.height
    };
    setSelectionBounds({
      width: b.width,
      height: b.height,
      left: b.left,
      top: b.top
    });
    canvas.renderAll();

    setHasImage(true);
    setHasVector(false);
    setMode('raster');
  }, [centerObject, applyDashedBoundingStyles]);

  /**
   * Internal render vector SVG without history push
   */
  const renderVectorInternal = useCallback(async (svgString: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.clear();
    cropOverlayObjRef.current = null;
    setActiveCropType('none');
    setIsLineArt(false);
    currentSvgRef.current = svgString;

    try {
      const res = await loadSVGFromString(svgString);
      const objects = (res.objects || []).filter((o): o is FabricObject => o !== null);

      if (objects.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      objects.forEach((obj) => {
        (obj as any)._originalFill = obj.fill || '#000000';
        (obj as any)._originalStroke = obj.stroke;
        (obj as any)._originalStrokeWidth = obj.strokeWidth;

        const bounds = obj.getBoundingRect();
        minX = Math.min(minX, bounds.left);
        minY = Math.min(minY, bounds.top);
        maxX = Math.max(maxX, bounds.left + bounds.width);
        maxY = Math.max(maxY, bounds.top + bounds.height);

        obj.set({
          selectable: true,
          hasControls: true,
          hoverCursor: 'pointer',
          perPixelTargetFind: true,
          objectCaching: false
        });
        canvas.add(obj);
      });

      // Parse exact SVG viewBox or dimensions to align perfectly 1:1 with raster source
      let svgViewBox = { x: 0, y: 0, width: 0, height: 0 };
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
          const vb = svgEl.getAttribute('viewBox');
          if (vb) {
            const parts = vb.trim().split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              svgViewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
            }
          }
          if (svgViewBox.width === 0) {
            const w = parseFloat(svgEl.getAttribute('width') || '0');
            const h = parseFloat(svgEl.getAttribute('height') || '0');
            if (w > 0 && h > 0) {
              svgViewBox = { x: 0, y: 0, width: w, height: h };
            }
          }
        }
      } catch (e) {
        console.warn('Could not parse SVG dimensions:', e);
      }

      const svgWidth = svgViewBox.width > 0 ? svgViewBox.width : (maxX - minX || 500);
      const svgHeight = svgViewBox.height > 0 ? svgViewBox.height : (maxY - minY || 500);
      const origMinX = svgViewBox.width > 0 ? svgViewBox.x : minX;
      const origMinY = svgViewBox.height > 0 ? svgViewBox.y : minY;

      const maxDim = Math.min(canvas.width * 0.8, canvas.height * 0.8);
      const scale = Math.min(maxDim / svgWidth, maxDim / svgHeight, 1);
      const left = (canvas.width - svgWidth * scale) / 2;
      const top = (canvas.height - svgHeight * scale) / 2;

      masterArtworkFrameRef.current = {
        left,
        top,
        width: svgWidth * scale,
        height: svgHeight * scale
      };

      const offsetX = left - origMinX * scale;
      const offsetY = top - origMinY * scale;

      const masterList: MasterVectorPath[] = [];
      const colorSet = new Set<string>();

      objects.forEach((obj) => {
        obj.set({
          left: (obj.left || 0) * scale + offsetX,
          top: (obj.top || 0) * scale + offsetY,
          scaleX: (obj.scaleX || 1) * scale,
          scaleY: (obj.scaleY || 1) * scale
        });
        obj.setCoords();

        const fillStr = (typeof obj.fill === 'string' && obj.fill !== 'none' ? obj.fill : '#000000').trim().toUpperCase();
        if (fillStr.startsWith('#') || fillStr.startsWith('RGB')) {
          colorSet.add(fillStr);
        }
        const bounds = obj.getBoundingRect();
        masterList.push({
          obj,
          originalFill: (obj as any)._originalFill || fillStr,
          originalStroke: typeof obj.stroke === 'string' ? obj.stroke : null,
          originalStrokeWidth: obj.strokeWidth || 0,
          area: bounds.width * bounds.height
        });
      });

      masterPathsRef.current = masterList;
      const initialColors = Array.from(colorSet);
      uniqueColorsRef.current = initialColors;
      setMaxColorCount(Math.max(initialColors.length, 1));
      setActiveColorCount(Math.max(initialColors.length, 1));
      setActiveDetailPercent(100);

      setHasVector(true);
      setHasImage(true);
      setMode('vector');

      // Frame the entire vector design with the dashed bounding box on display
      selectAllVectors();
      refreshColorLayers();
    } catch (err) {
      console.error('Error rendering vector SVG:', err);
    }
  }, [selectAllVectors, refreshColorLayers]);

  /**
   * On-the-Fly Live Color Simplification (Hierarchical Clustering)
   */
  const simplifyColorsLive = useCallback((targetK: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || masterPathsRef.current.length === 0) return;

    setActiveColorCount(targetK);
    const clusterMap = clusterColors(uniqueColorsRef.current, targetK);

    masterPathsRef.current.forEach((item) => {
      const orig = item.originalFill.toUpperCase();
      const mapped = clusterMap.get(orig) || orig;
      item.obj.set('fill', mapped);
    });

    canvas.renderAll();
    refreshColorLayers();
  }, [refreshColorLayers]);

  /**
   * On-the-Fly Live Detail / Small Chad Filtering
   */
  const simplifyDetailsLive = useCallback((percent: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || masterPathsRef.current.length === 0) return;

    setActiveDetailPercent(percent);

    if (percent >= 99) {
      masterPathsRef.current.forEach((item) => item.obj.set('visible', true));
      canvas.renderAll();
      return;
    }

    const sortedAreas = masterPathsRef.current.map((item) => item.area).sort((a, b) => a - b);
    const cutoffIndex = Math.floor(sortedAreas.length * (1 - percent / 100) * 0.45);
    const cutoffArea = sortedAreas[cutoffIndex] || 0;

    masterPathsRef.current.forEach((item) => {
      const isVisible = item.area >= cutoffArea;
      item.obj.set('visible', isVisible);
    });

    canvas.renderAll();
  }, []);

  /**
   * On-the-Fly Vector Outline Smoothing
   * Smooths each isolated island vector on the selected layer (or all layers if none selected).
   */
  const smoothOutlinesLive = useCallback((percent: number, explicitColor?: string | null) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || masterPathsRef.current.length === 0) return;

    setOutlineSmoothing(percent);

    const allCuttable = canvas.getObjects().filter((obj) => {
      if (!obj.visible) return false;
      const name = (obj as any).name;
      if (name === 'crop-overlay' || name === 'brush-preview' || (obj as any).excludeFromExport) return false;
      return true;
    });

    // Detect currently selected vector objects using Fabric's native getActiveObjects()
    const currentSelectedObjects = canvas.getActiveObjects().filter((obj) => {
      if (!obj.visible) return false;
      const name = (obj as any).name;
      return name !== 'crop-overlay' && name !== 'brush-preview' && !(obj as any).excludeFromExport;
    });

    const activeColor = explicitColor !== undefined ? explicitColor : selectedColor;
    const targetColor = activeColor ? activeColor.trim().toUpperCase() : null;

    // RULE:
    // Outline smoothing applies ONLY to the current selection (unless all in that layer are selected).
    // If no objects are currently selected on the canvas, fallback to the targeted color layer, or all cuttable objects.
    let objectsToProcess: FabricObject[] = [];
    if (currentSelectedObjects.length > 0) {
      objectsToProcess = currentSelectedObjects;
    } else if (targetColor) {
      objectsToProcess = allCuttable.filter((o) => ((o.fill as string) || '').trim().toUpperCase() === targetColor);
    } else {
      objectsToProcess = allCuttable;
    }

    if (objectsToProcess.length === 0) return;

    // Store un-smoothed base path before discarding active selection so transform matrices are exact
    objectsToProcess.forEach((obj) => {
      if (!(obj as any)._baseSvgD) {
        const cmds = extractCommandsFromObject(obj);
        if (cmds.length > 0) {
          (obj as any)._baseSvgD = commandsToD(cmds);
        }
      }
    });

    const replacementSelectedObjects: FabricObject[] = [];

    // If an ActiveSelection was active, discard it before removing/adding replacement paths
    const active = canvas.getActiveObject();
    if (active && (active instanceof ActiveSelection || (active as any).type?.toLowerCase() === 'activeselection' || typeof (active as any).getObjects === 'function')) {
      canvas.discardActiveObject();
    }

    objectsToProcess.forEach((obj) => {
      const baseD = (obj as any)._baseSvgD;
      if (!baseD) return;

      const targetD = percent <= 0 ? baseD : smoothSvgPathString(baseD, percent);
      if (!targetD || !targetD.trim()) return;

      const fill = (obj.fill as string) || (obj as any)._originalFill || '#000000';
      const stroke = (obj.stroke as string) || (obj as any)._originalStroke || null;
      const strokeWidth = obj.strokeWidth || 0;

      const wasInSelection = currentSelectedObjects.includes(obj);

      const newPath = createAbsoluteWorldPath(targetD, {
        fill,
        stroke,
        strokeWidth,
        selectable: brushModeRef.current === 'none',
        evented: brushModeRef.current === 'none',
        hoverCursor: brushModeRef.current === 'none' ? 'pointer' : 'crosshair',
        perPixelTargetFind: true
      });

      (newPath as any)._originalFill = (obj as any)._originalFill || fill;
      (newPath as any)._originalStroke = stroke;
      (newPath as any)._originalStrokeWidth = strokeWidth;
      (newPath as any)._baseSvgD = baseD;

      // Update in masterPathsRef
      const itemIdx = masterPathsRef.current.findIndex((item) => item.obj === obj);
      if (itemIdx !== -1) {
        const b = newPath.getBoundingRect();
        masterPathsRef.current[itemIdx] = {
          obj: newPath,
          originalFill: (newPath as any)._originalFill,
          originalStroke: stroke,
          originalStrokeWidth: strokeWidth,
          area: b.width * b.height
        };
      }

      canvas.remove(obj);
      canvas.add(newPath);

      if (wasInSelection) {
        replacementSelectedObjects.push(newPath);
      }
    });

    // Re-establish active selection so the user retains their selection uninterrupted
    if (replacementSelectedObjects.length > 1) {
      const as = new ActiveSelection(replacementSelectedObjects, { canvas });
      applyDashedBoundingStyles(as);
      canvas.setActiveObject(as);
      setSelectedObject(as);
    } else if (replacementSelectedObjects.length === 1) {
      applyDashedBoundingStyles(replacementSelectedObjects[0]);
      canvas.setActiveObject(replacementSelectedObjects[0]);
      setSelectedObject(replacementSelectedObjects[0]);
    }

    canvas.renderAll();
    refreshColorLayers();

    if (isWeedCheckActive) {
      runWeedCheck(targetColor || undefined);
    }
  }, [selectedColor, refreshColorLayers, isWeedCheckActive, runWeedCheck, applyDashedBoundingStyles]);

  /**
   * Restores exact vector snapshot from canvas JSON without any coordinate drift or re-scaling
   */
  const restoreVectorSnapshot = useCallback(async (jsonStr: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.clear();
    cropOverlayObjRef.current = null;
    setActiveCropType('none');
    setIsLineArt(false);

    try {
      const parsed = JSON.parse(jsonStr);
      await canvas.loadFromJSON(parsed);

      const objects = canvas.getObjects().filter((o) => (o as any).name !== 'crop-overlay');
      const masterList: MasterVectorPath[] = [];
      const colorSet = new Set<string>();

      objects.forEach((obj) => {
        obj.set({
          selectable: true,
          hasControls: true,
          hoverCursor: 'pointer',
          perPixelTargetFind: true,
          objectCaching: false
        });
        const fillStr = (typeof obj.fill === 'string' && obj.fill !== 'none' ? obj.fill : '#000000').trim().toUpperCase();
        if (fillStr.startsWith('#') || fillStr.startsWith('RGB')) {
          colorSet.add(fillStr);
        }
        const bounds = obj.getBoundingRect();
        masterList.push({
          obj,
          originalFill: (obj as any)._originalFill || fillStr,
          originalStroke: (obj as any)._originalStroke || (typeof obj.stroke === 'string' ? obj.stroke : null),
          originalStrokeWidth: (obj as any)._originalStrokeWidth || obj.strokeWidth || 0,
          area: bounds.width * bounds.height
        });
      });

      masterPathsRef.current = masterList;
      const initialColors = Array.from(colorSet);
      uniqueColorsRef.current = initialColors;
      setMaxColorCount(Math.max(initialColors.length, 1));
      setActiveColorCount(Math.max(initialColors.length, 1));
      setActiveDetailPercent(100);

      canvas.renderAll();
      setHasVector(true);
      setHasImage(true);
      setMode('vector');
    } catch (err) {
      console.error('Error restoring vector snapshot:', err);
    }
  }, []);

  /**
   * Load raster image onto canvas (Records history)
   * @param isSource True if this is an original user import / AI creation
   */
  const loadRasterImage = useCallback(async (dataUrl: string, isSource = false) => {
    pushUndoSnapshot();

    let resolvedDataUrl = dataUrl;
    if (dataUrl.startsWith('/') || dataUrl.startsWith('http')) {
      try {
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        resolvedDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn('[RasterLoad] Failed to convert path to dataUrl:', err);
      }
    }

    if (isSource || !originalRasterRef.current) {
      originalRasterRef.current = resolvedDataUrl;
      initialArtworkRef.current = { mode: 'raster', data: resolvedDataUrl };
      if (isSource) {
        // A new source import invalidates any previous vector conversion and resets anchor frame
        originalVectorRef.current = null;
        masterArtworkFrameRef.current = null;
      }
    }
    await renderRasterInternal(resolvedDataUrl);
  }, [pushUndoSnapshot, renderRasterInternal]);

  /**
   * Load SVG string onto canvas in Vector Studio Mode (Records history)
   * @param isSourceOrConversion True if this is original AI SVG or initial vector conversion from raster
   */
  const loadVectorSvg = useCallback(async (svgString: string, isSourceOrConversion = false) => {
    pushUndoSnapshot();
    if (isSourceOrConversion || !originalVectorRef.current) {
      originalVectorRef.current = svgString;
      initialArtworkRef.current = { mode: 'vector', data: svgString };
    }
    await renderVectorInternal(svgString);
  }, [pushUndoSnapshot, renderVectorInternal]);

  /**
   * One-Click Reset:
   * - In Raster Workspace: resets to the original import / AI creation (not the default sample).
   * - In Vector Studio: resets to the original converted vector studio state (or direct AI vector).
   */
  const resetArtwork = useCallback(async () => {
    pushUndoSnapshot();
    setOutlineSmoothing(0);
    setBrushMode('none');

    if (mode === 'vector') {
      // In Vector Studio: go back to the original converted vector (or direct AI vector)
      if (originalVectorRef.current) {
        await renderVectorInternal(originalVectorRef.current);
        if (isWeedCheckActive) {
          setTimeout(() => runWeedCheck(), 50);
        }
        return;
      }
      // If no vector snapshot exists but we have the original raster import, fall back to raster
      if (originalRasterRef.current) {
        await renderRasterInternal(originalRasterRef.current);
        return;
      }
    } else {
      // In Raster workspace: go back to the original import or AI creation (not the default sample)
      if (originalRasterRef.current) {
        await renderRasterInternal(originalRasterRef.current);
        return;
      }
      if (originalVectorRef.current) {
        await renderVectorInternal(originalVectorRef.current);
        return;
      }
    }

    if (initialArtworkRef.current) {
      if (initialArtworkRef.current.mode === 'vector') {
        await renderVectorInternal(initialArtworkRef.current.data);
      } else {
        await renderRasterInternal(initialArtworkRef.current.data);
      }
    }
  }, [mode, pushUndoSnapshot, renderVectorInternal, renderRasterInternal, isWeedCheckActive, runWeedCheck]);

  /**
   * Switch between workspace modes cleanly using preserved original states
   */
  const switchToRasterMode = useCallback(async () => {
    if (originalRasterRef.current) {
      pushUndoSnapshot();
      await renderRasterInternal(originalRasterRef.current);
    }
  }, [pushUndoSnapshot, renderRasterInternal]);

  const switchToVectorMode = useCallback(async () => {
    if (originalVectorRef.current) {
      pushUndoSnapshot();
      await renderVectorInternal(originalVectorRef.current);
    }
  }, [pushUndoSnapshot, renderVectorInternal]);

  /**
   * Retrieves current raster artwork and SVG vector string for Side-by-Side Compare Mode
   */
  /**
   * Retrieves current raster artwork and SVG vector string for Side-by-Side Compare Mode.
   * Preserves the exact visual vector artwork as seen in Vector Studio (all layers, fills, and
   * fine details intact) rather than running destructive Cricut vinyl cutting remediation.
   */
  const getCompareData = useCallback(() => {
    const rasterUrl = originalRasterRef.current || getRasterDataUrl();
    const canvas = fabricCanvasRef.current;
    let svgString: string | null = null;

    // 1. If canvas has vector objects, export what's on screen via canvas.toSVG()
    // Anchors to masterArtworkFrameRef so deletions (e.g. white background), moves, and resizes maintain 1:1 spatial alignment
    if (canvas) {
      const vectorObjects = canvas
        .getObjects()
        .filter((o) => o.visible && (o as any).name !== 'crop-overlay' && (o as any).name !== 'raster-target');
      if (vectorObjects.length > 0 && typeof (canvas as any).toSVG === 'function') {
        try {
          const frame = masterArtworkFrameRef.current;
          if (frame && frame.width > 0 && frame.height > 0) {
            svgString = (canvas as any).toSVG({
              viewBox: {
                x: frame.left,
                y: frame.top,
                width: frame.width,
                height: frame.height
              },
              width: frame.width,
              height: frame.height
            });
          } else {
            svgString = (canvas as any).toSVG();
          }
        } catch (e) {
          console.warn('[Compare] canvas.toSVG failed:', e);
        }
      }
    }

    // 2. If canvas didn't provide vector SVG, use the cached vector SVG (from VTracer / vector import)
    if (!svgString || !svgString.includes('<path')) {
      svgString = currentSvgRef.current || originalVectorRef.current || null;
    }

    // 3. Fallback to exportSvg() only if neither of the above has vector paths
    if (!svgString || !svgString.includes('<path')) {
      svgString = exportSvg() || null;
    }

    return {
      rasterUrl: rasterUrl || null,
      svgString: svgString || null
    };
  }, [getRasterDataUrl, exportSvg]);

  useEffect(() => {
    if (mode === 'compare') {
      const data = getCompareData();
      setCompareData(data);
    }
  }, [mode, getCompareData]);

  /**
   * Export to 300 DPI PDF (Letter, A4, or 12x12 Cricut Mat)
   */
  const exportPdf = useCallback((pageSize: '12x12' | 'letter' | 'a4' = '12x12') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    exportPdfService(canvas, { pageSize });
  }, []);

  /**
   * UNDO Action (Restores exact canvas state without coordinate shifts)
   */
  const undo = useCallback(async () => {
    if (isHistoryBusyRef.current || undoStackRef.current.length === 0) return;
    isHistoryBusyRef.current = true;

    try {
      const current = captureCurrentSnapshot();
      let previous = undoStackRef.current.pop();

      // If previous snapshot is identical to what's currently on the canvas,
      // continue popping until we get to a snapshot that genuinely differs
      while (
        previous &&
        current &&
        previous.mode === current.mode &&
        previous.data === current.data &&
        undoStackRef.current.length > 0
      ) {
        previous = undoStackRef.current.pop();
      }

      if (current) {
        redoStackRef.current.push(current);
        setCanRedo(true);
      }

      setCanUndo(undoStackRef.current.length > 0);

      if (previous) {
        if (previous.mode === 'vector') {
          if (previous.data.startsWith('{')) {
            await restoreVectorSnapshot(previous.data);
          } else {
            await renderVectorInternal(previous.data);
          }
        } else {
          await renderRasterInternal(previous.data);
        }
      }
    } finally {
      isHistoryBusyRef.current = false;
    }
  }, [captureCurrentSnapshot, restoreVectorSnapshot, renderVectorInternal, renderRasterInternal]);

  /**
   * REDO Action
   */
  const redo = useCallback(async () => {
    if (isHistoryBusyRef.current || redoStackRef.current.length === 0) return;
    isHistoryBusyRef.current = true;

    try {
      const current = captureCurrentSnapshot();
      let next = redoStackRef.current.pop();

      while (
        next &&
        current &&
        next.mode === current.mode &&
        next.data === current.data &&
        redoStackRef.current.length > 0
      ) {
        next = redoStackRef.current.pop();
      }

      if (current) {
        undoStackRef.current.push(current);
        setCanUndo(true);
      }

      setCanRedo(redoStackRef.current.length > 0);

      if (next) {
        if (next.mode === 'vector') {
          if (next.data.startsWith('{')) {
            await restoreVectorSnapshot(next.data);
          } else {
            await renderVectorInternal(next.data);
          }
        } else {
          await renderRasterInternal(next.data);
        }
      }
    } finally {
      isHistoryBusyRef.current = false;
    }
  }, [captureCurrentSnapshot, restoreVectorSnapshot, renderVectorInternal, renderRasterInternal]);

  /**
   * Keyboard Shortcut Listener:
   * - Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
   * - Ctrl+A (Select All) and Ctrl+Shift+I (Select Inverse)
   * - Delete / Backspace (Remove selected component)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        if (e.repeat) return;
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (isCmdOrCtrl && (e.key === 'y' || e.key === 'Y')) {
        if (e.repeat) return;
        e.preventDefault();
        redo();
      } else if (isCmdOrCtrl && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        selectInverseVectors();
      } else if (isCmdOrCtrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAllVectors();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const activeObj = canvas.getActiveObject();
        if (activeObj && activeObj !== cropOverlayObjRef.current && (activeObj as any).name !== 'crop-overlay') {
          e.preventDefault();
          deleteSelectedObjectRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectAllVectors, selectInverseVectors]);

  const swapColor = useCallback((fromColor: string, toColor: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const normFrom = fromColor.trim().toUpperCase();
    const normTo = toColor.trim();

    canvas.getObjects().forEach((obj) => {
      const currentFill = (obj.fill as string || '').trim().toUpperCase();
      if (currentFill === normFrom) {
        obj.set('fill', normTo);
        (obj as any)._originalFill = normTo;
      }
    });

    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, refreshColorLayers]);

  const toggleLayerVisibility = useCallback((color: string, visible?: boolean) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const normColor = normalizeHexColor(color);
    canvas.getObjects().forEach((obj) => {
      const f = (obj.fill as string) || (obj as any)._originalFill;
      if (areColorsMatching(f, normColor)) {
        const nextVis = visible !== undefined ? visible : !obj.visible;
        obj.set('visible', nextVis);
      }
    });

    canvas.discardActiveObject();
    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, refreshColorLayers]);

  /**
   * Unhides all vector objects on canvas.
   */
  const showAllVectors = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const vectorObjs = canvas.getObjects().filter(
      (o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview' && (o as any).name !== 'raster-target'
    );
    vectorObjs.forEach((o) => o.set('visible', true));

    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, refreshColorLayers]);

  /**
   * Hides all vector objects on canvas.
   */
  const hideAllVectors = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const vectorObjs = canvas.getObjects().filter(
      (o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview' && (o as any).name !== 'raster-target'
    );
    vectorObjs.forEach((o) => o.set('visible', false));

    canvas.discardActiveObject();
    setSelectedObject(null);

    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, refreshColorLayers]);

  /**
   * Togglable Hide/Show All:
   * If all vector objects on canvas are visible, hides all of them.
   * If any vector object is hidden, unhides all of them.
   */
  const toggleHideShowAll = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const vectorObjs = canvas.getObjects().filter(
      (o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview' && (o as any).name !== 'raster-target'
    );
    if (vectorObjs.length === 0) return;

    const areAllVisible = vectorObjs.every((o) => o.visible !== false);
    const nextVis = !areAllVisible;

    vectorObjs.forEach((o) => o.set('visible', nextVis));

    if (!nextVis) {
      canvas.discardActiveObject();
      setSelectedObject(null);
    }

    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, refreshColorLayers]);

  /**
   * Togglable Hide/Show Selection:
   * Toggles visibility of the currently selected element or active selection.
   */
  const toggleHideShowSelection = useCallback((target?: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    const active = target || canvas?.getActiveObject() || selectedObject;
    if (!canvas || !active) return;

    pushUndoSnapshot();

    const objs = (active instanceof ActiveSelection || typeof (active as any).getObjects === 'function')
      ? (active as any).getObjects()
      : [active];

    const anyVisible = objs.some((o: FabricObject) => o.visible !== false);
    const nextVis = !anyVisible;

    objs.forEach((o: FabricObject) => o.set('visible', nextVis));

    if (!nextVis) {
      canvas.discardActiveObject();
      setSelectedObject(null);
    }

    canvas.renderAll();
    refreshColorLayers();
  }, [selectedObject, pushUndoSnapshot, refreshColorLayers]);

  const selectObjectsByColor = useCallback((color: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const normColor = normalizeHexColor(color);
    const matching = canvas.getObjects().filter((obj) => {
      if ((obj as any).name === 'crop-overlay' || (obj as any).name === 'lasso-preview') return false;
      const f = (obj.fill as string) || (obj as any)._originalFill;
      return areColorsMatching(f, normColor);
    });

    if (matching.length === 0) return;

    // Ensure matching objects are visible so they can be selected and manipulated
    matching.forEach((o) => o.set('visible', true));

    if (matching.length === 1) {
      applyDashedBoundingStyles(matching[0]);
      canvas.setActiveObject(matching[0]);
      setSelectedObject(matching[0]);
      setSelectedColor(normColor);
      setSelectedLayerColors([normColor]);
      const zoom = canvas.getZoom() || 1;
      const b = matching[0].getBoundingRect();
      setSelectionBounds({
        width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
        height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
        left: b.left,
        top: b.top,
        label: `Mat (${color})`
      });
    } else {
      const selection = new ActiveSelection(matching, { canvas });
      applyDashedBoundingStyles(selection);
      canvas.setActiveObject(selection);
      setSelectedObject(selection);
      setSelectedColor(normColor);
      setSelectedLayerColors([normColor]);
      const zoom = canvas.getZoom() || 1;
      const b = selection.getBoundingRect();
      setSelectionBounds({
        width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
        height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
        left: b.left,
        top: b.top,
        label: `Mat (${color})`
      });
    }
    canvas.renderAll();
    refreshColorLayers();
    runWeedCheck(color);
  }, [applyDashedBoundingStyles, refreshColorLayers, runWeedCheck]);

  useEffect(() => {
    selectObjectsByColorRef.current = selectObjectsByColor;
  }, [selectObjectsByColor]);

  /**
   * Helper: Parses hex or rgb string into RGB numbers
   */
  const parseColorToRgb = (colorStr: string): { r: number; g: number; b: number } | null => {
    if (!colorStr) return null;
    const s = colorStr.trim().toLowerCase();
    if (s.startsWith('#')) {
      let hex = s.slice(1);
      if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
      if (hex.length === 6) {
        const num = parseInt(hex, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      }
    }
    const match = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) };
    }
    return null;
  };

  /**
   * Helper: Calculates perceptual color distance (Redmean metric)
   * Distance ranges from 0 (identical) to ~765 (pure black to pure white)
   */
  const calcColorDistance = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number => {
    const rmean = (c1.r + c2.r) / 2;
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt((((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8));
  };

  /**
   * Helper: Converts RGB to HSL (h: 0..360, s: 0..1, l: 0..1)
   */
  const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, l };
  };

  /**
   * Determines if two colors belong to the same color family / shade
   */
  const isSimilarColor = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): boolean => {
    const dist = calcColorDistance(c1, c2);
    if (dist <= 160) return true;

    const hsl1 = rgbToHsl(c1.r, c1.g, c1.b);
    const hsl2 = rgbToHsl(c2.r, c2.g, c2.b);

    // Both near-neutral shades (grays, whites, blacks)
    if (hsl1.s <= 0.22 && hsl2.s <= 0.22 && dist <= 240) return true;

    // Hue difference
    let dh = Math.abs(hsl1.h - hsl2.h);
    if (dh > 180) dh = 360 - dh;

    // Same color family (e.g. shades of blues, shades of reds, shades of greens)
    if (dh <= 38 && dist <= 250) return true;

    return false;
  };

  /**
   * Selects all vector objects whose color is of a similar shade to baseColor
   */
  const selectObjectsBySimilarColor = useCallback(
    (baseColor: string) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const baseRgb = parseColorToRgb(baseColor);
      if (!baseRgb) {
        selectObjectsByColor(baseColor);
        return;
      }

      const matching = canvas.getObjects().filter((obj) => {
        if ((obj as any).name === 'crop-overlay' || (obj as any).name === 'lasso-preview' || (obj as any).name === 'raster-target') return false;
        const f = ((obj.fill as string) || '').trim();
        if (!f || f === 'none' || f === 'transparent') return false;
        const objRgb = parseColorToRgb(f);
        if (!objRgb) return false;
        return isSimilarColor(baseRgb, objRgb);
      });

      if (matching.length === 0) return;

      matching.forEach((o) => o.set('visible', true));

      // Extract all distinct colors among the matched objects
      const matchingColors = new Set<string>();
      matching.forEach((o) => {
        const f = ((o.fill as string) || '').trim().toUpperCase();
        if (f && f !== 'NONE' && f !== 'TRANSPARENT') {
          matchingColors.add(f);
        }
      });
      const uniqueMatchingColors = Array.from(matchingColors);
      setSelectedLayerColors(uniqueMatchingColors);

      if (matching.length === 1) {
        applyDashedBoundingStyles(matching[0]);
        canvas.setActiveObject(matching[0]);
        setSelectedObject(matching[0]);
        setSelectedColor(uniqueMatchingColors[0] || baseColor.toUpperCase());
        const zoom = canvas.getZoom() || 1;
        const b = matching[0].getBoundingRect();
        setSelectionBounds({
          width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
          height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
          left: b.left,
          top: b.top,
          label: `Similar to ${baseColor} (1 element)`
        });
      } else {
        const selection = new ActiveSelection(matching, { canvas });
        applyDashedBoundingStyles(selection);
        canvas.setActiveObject(selection);
        setSelectedObject(selection);
        setSelectedColor(uniqueMatchingColors[0] || baseColor.toUpperCase());
        const zoom = canvas.getZoom() || 1;
        const b = selection.getBoundingRect();
        setSelectionBounds({
          width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
          height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
          left: b.left,
          top: b.top,
          label: `Similar to ${baseColor} (${matching.length} elements)`
        });
      }
      canvas.renderAll();
      refreshColorLayers();
      runWeedCheck(baseColor);
    },
    [applyDashedBoundingStyles, refreshColorLayers, runWeedCheck, selectObjectsByColor]
  );

  /**
   * Clears the current active selection on canvas
   */
  const clearSelection = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    setSelectedObject(null);
    setSelectedColor(null);
    setSelectedLayerColors([]);
    setSelectionBounds(null);
    canvas.renderAll();
  }, []);

  const deleteColorLayer = useCallback((color: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const normColor = color.trim().toUpperCase();
    const toRemove = canvas.getObjects().filter((obj) => {
      const currentFill = (obj.fill as string || '').trim().toUpperCase();
      return currentFill === normColor;
    });

    toRemove.forEach((obj) => canvas.remove(obj));

    const toRemoveSet = new Set(toRemove);
    masterPathsRef.current = masterPathsRef.current.filter((item) => !toRemoveSet.has(item.obj));
    uniqueColorsRef.current = uniqueColorsRef.current.filter((c) => c !== normColor);
    const remainingCount = uniqueColorsRef.current.length;
    setMaxColorCount(Math.max(remainingCount, 2));
    setActiveColorCount(remainingCount);

    canvas.discardActiveObject();
    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, refreshColorLayers]);

  /**
   * Combine multiple color mats into one by uniting and adding all their vector elements
   * into a single compound Path element in the primary (first selected) color.
   */
  const combineMats = useCallback((colors: string[]) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || colors.length < 2) return;

    pushUndoSnapshot();

    const targetColor = colors[0].trim();
    const colorsToMerge = new Set(colors.map((c) => c.trim().toUpperCase()));

    // 1. Gather all objects matching the selected colors
    const matchingObjects = canvas.getObjects().filter((obj) => {
      if ((obj as any).name === 'crop-overlay' || (obj as any).name === 'lasso-preview') return false;
      const fill = ((obj.fill as string) || '').trim().toUpperCase();
      return colorsToMerge.has(fill);
    });

    if (matchingObjects.length === 0) return;

    // 2. Extract transformed path strings from all matching elements
    const pathStrings: string[] = [];
    matchingObjects.forEach((obj) => {
      const cmds = extractCommandsFromObject(obj);
      if (cmds.length > 0) {
        const d = commandsToD(cmds);
        if (d && d.trim()) {
          pathStrings.push(d.trim());
        }
      }
    });

    if (pathStrings.length === 0) return;

    // 3. True Geometric Boolean Union: Dissolve all overlapping seams and internal boundaries into a unified silhouette
    const unitedD = booleanUnionPaths(pathStrings);
    if (!unitedD || !unitedD.trim()) return;

    // 4. Create the united silhouette Path element (single outer boundary with no internal cuts)
    const combinedPath = createAbsoluteWorldPath(unitedD, {
      fill: targetColor,
      stroke: undefined,
      strokeWidth: 0,
      selectable: true,
      hasControls: true,
      hoverCursor: 'pointer'
    });

    (combinedPath as any)._originalFill = targetColor;
    (combinedPath as any)._originalStroke = null;
    (combinedPath as any)._originalStrokeWidth = 0;

    // 4. Remove old individual vector elements and add united path
    matchingObjects.forEach((obj) => canvas.remove(obj));
    canvas.add(combinedPath);
    applyDashedBoundingStyles(combinedPath);

    // 5. Update masterPathsRef
    const matchingSet = new Set(matchingObjects);
    masterPathsRef.current = masterPathsRef.current.filter((item) => !matchingSet.has(item.obj));
    const b = combinedPath.getBoundingRect();
    masterPathsRef.current.push({
      obj: combinedPath,
      originalFill: targetColor,
      originalStroke: null,
      originalStrokeWidth: 0,
      area: b.width * b.height
    });

    // 6. Update distinct active colors & mat counts so live simplification slider matches available mats
    const remainingObjects = canvas
      .getObjects()
      .filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');
    const remainingColors = Array.from(
      new Set(
        remainingObjects
          .map((o) => ((o.fill as string) || '').trim().toUpperCase())
          .filter((c) => c && c !== 'NONE' && c !== 'TRANSPARENT')
      )
    );

    uniqueColorsRef.current = remainingColors;
    setMaxColorCount(Math.max(remainingColors.length, 2));
    setActiveColorCount(remainingColors.length);

    canvas.discardActiveObject();
    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, applyDashedBoundingStyles, refreshColorLayers]);

  /**
   * Combine all currently selected canvas elements into one united compound Path element
   * (prompts user for target color if multiple layers are selected, or uses targetColorOverride).
   */
  const combineSelectedObjects = useCallback((targetColorOverride?: string) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const active = canvas.getActiveObject() || contextMenuState.targetObject;
    if (!active) return;

    let objs: FabricObject[] = [];
    if (
      (active as any).type?.toLowerCase() === 'activeselection' ||
      typeof (active as any).getObjects === 'function'
    ) {
      objs = (active as any).getObjects ? (active as any).getObjects() : (active as any)._objects || [];
    } else {
      objs = [active];
    }
    if (objs.length < 2 && !targetColorOverride) return;

    pushUndoSnapshot();

    const targetColor = (targetColorOverride || (objs[0].fill as string) || '#000000').trim().toUpperCase();

    // Discard active selection so objects have their actual coordinates restored
    canvas.discardActiveObject();

    const pathStrings: string[] = [];
    objs.forEach((obj) => {
      const cmds = extractCommandsFromObject(obj);
      if (cmds.length > 0) {
        const d = commandsToD(cmds);
        if (d && d.trim()) {
          pathStrings.push(d.trim());
        }
      }
    });

    if (pathStrings.length === 0) return;

    // True Geometric Boolean Union: Dissolve all overlapping seams into a single outer silhouette
    const unitedD = booleanUnionPaths(pathStrings);
    if (!unitedD || !unitedD.trim()) return;

    const combinedPath = createAbsoluteWorldPath(unitedD, {
      fill: targetColor,
      stroke: undefined,
      strokeWidth: 0,
      selectable: true,
      hasControls: true,
      hoverCursor: 'pointer'
    });

    (combinedPath as any)._originalFill = targetColor;
    (combinedPath as any)._originalStroke = null;
    (combinedPath as any)._originalStrokeWidth = 0;

    objs.forEach((obj) => canvas.remove(obj));
    canvas.add(combinedPath);
    applyDashedBoundingStyles(combinedPath);

    const objsSet = new Set(objs);
    masterPathsRef.current = masterPathsRef.current.filter((item) => !objsSet.has(item.obj));
    const b = combinedPath.getBoundingRect();
    masterPathsRef.current.push({
      obj: combinedPath,
      originalFill: targetColor,
      originalStroke: null,
      originalStrokeWidth: 0,
      area: b.width * b.height
    });

    const remainingObjects = canvas
      .getObjects()
      .filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');
    const remainingColors = Array.from(
      new Set(
        remainingObjects
          .map((o) => ((o.fill as string) || '').trim().toUpperCase())
          .filter((c) => c && c !== 'NONE' && c !== 'TRANSPARENT')
      )
    );

    uniqueColorsRef.current = remainingColors;
    setMaxColorCount(Math.max(remainingColors.length, 2));
    setActiveColorCount(remainingColors.length);

    canvas.setActiveObject(combinedPath);
    setSelectedObject(combinedPath);
    setSelectedColor(targetColor);

    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, applyDashedBoundingStyles, refreshColorLayers]);

  /**
   * Reorders color mats across canvas objects so that the top item in newColorOrder
   * sits at the front of the canvas stack (highest z-index), and the bottom item
   * sits at the base (lowest z-index).
   */
  const reorderColorLayers = useCallback(
    (newColorOrder: string[]) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      pushUndoSnapshot();

      const objects = canvas
        .getObjects()
        .filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');

      if (objects.length === 0) return;

      // Group objects by normalized color
      const colorMap = new Map<string, FabricObject[]>();
      objects.forEach((obj) => {
        const fill = ((obj.fill as string) || '').trim();
        const color = fill && fill !== 'none' && fill !== 'transparent' ? fill.toUpperCase() : '#000000';
        if (!colorMap.has(color)) colorMap.set(color, []);
        colorMap.get(color)!.push(obj);
      });

      // Remove objects from canvas
      objects.forEach((obj) => canvas.remove(obj));

      // In Fabric, objects added first are at the back, objects added last are at the front.
      // newColorOrder has index 0 = FRONT (top of stack), last index = BACK (base of stack).
      // So to render correctly, add from BACK to FRONT (newColorOrder reversed).
      const normNewOrder = newColorOrder.map((c) => c.trim().toUpperCase());
      const backToFront = [...normNewOrder].reverse();

      // Include any colors not explicitly in normNewOrder
      const allColors = Array.from(colorMap.keys());
      for (const col of allColors) {
        if (!backToFront.includes(col)) {
          backToFront.unshift(col);
        }
      }

      for (const color of backToFront) {
        const groupObjs = colorMap.get(color);
        if (groupObjs) {
          groupObjs.forEach((obj) => canvas.add(obj));
        }
      }

      // Rebuild masterPathsRef
      const newMasterPaths: MasterVectorPath[] = [];
      canvas.getObjects().forEach((obj) => {
        if ((obj as any).name === 'crop-overlay' || (obj as any).name === 'lasso-preview') return;
        const fillStr = (typeof obj.fill === 'string' && obj.fill !== 'none' ? obj.fill : '#000000').trim().toUpperCase();
        const bounds = obj.getBoundingRect();
        newMasterPaths.push({
          obj,
          originalFill: fillStr,
          originalStroke: typeof obj.stroke === 'string' ? obj.stroke : null,
          originalStrokeWidth: obj.strokeWidth || 0,
          area: bounds.width * bounds.height
        });
      });
      masterPathsRef.current = newMasterPaths;

      canvas.discardActiveObject();
      canvas.renderAll();
      refreshColorLayers();
    },
    [pushUndoSnapshot, refreshColorLayers]
  );

  /**
   * Flatten artwork:
   * 1. Groups all vector paths by their color.
   * 2. Combines all vectors of the same color into a single united path.
   * 3. Either:
   *    - 'knockout': Guarantees mats do not overlap (each layer only colors where no previous layer colors).
   *    - 'stacked': Preserves solid base silhouettes underneath upper layers (where upper layers overlay,
   *                 the layer below is solid in that area).
   * 4. Updates canvas in place with the resulting paths.
   */
  const flattenArtwork = useCallback(
    async (mode: FlattenMode = 'knockout', orderedColors?: string[]) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const objects = canvas
        .getObjects()
        .filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');

      if (objects.length === 0) return;

      setIsFlattening(true);
      setActiveFlattenMode(mode);

      // Yield execution so the progress popup prompt renders on screen immediately
      await new Promise((resolve) => setTimeout(resolve, 60));

      const startTime = Date.now();
      try {
        pushUndoSnapshot();

        // Determine active mat order: index 0 is Top / Foreground, last index is Base / Background
        const explicitOrder = (
          orderedColors && orderedColors.length > 0
            ? orderedColors
            : colorLayersRef.current.map((l) => l.color)
        ).map((c) => c.trim().toUpperCase());

        // If any colors on canvas are missing from explicitOrder, derive their order from canvas z-order (top to bottom)
        const canvasReverseColors: string[] = [];
        for (let i = objects.length - 1; i >= 0; i--) {
          const fill = ((objects[i].fill as string) || (objects[i] as any)._originalFill || '').trim().toUpperCase();
          if (fill && fill !== 'NONE' && fill !== 'TRANSPARENT' && !canvasReverseColors.includes(fill)) {
            canvasReverseColors.push(fill);
          }
        }

        const effectiveOrder: string[] = [...explicitOrder];
        for (const col of canvasReverseColors) {
          if (!effectiveOrder.includes(col)) {
            effectiveOrder.push(col);
          }
        }

        // Map objects by normalized color
        const colorGroupsMap = new Map<
          string,
          {
            objects: FabricObject[];
            pathStrings: string[];
            contoursList: { x: number; y: number }[][][];
            maxZ: number;
            totalArea: number;
          }
        >();

        objects.forEach((obj, idx) => {
          const fill = ((obj.fill as string) || '').trim();
          const color = fill && fill !== 'none' && fill !== 'transparent' ? fill.toUpperCase() : '#000000';

          const cmds = extractCommandsFromObject(obj);
          if (cmds.length === 0) return;
          const d = commandsToD(cmds);
          if (!d || !d.trim()) return;
          const contours = commandsToContours(cmds);

          const b = obj.getBoundingRect();
          const area = (b.width || 0) * (b.height || 0);

          if (!colorGroupsMap.has(color)) {
            colorGroupsMap.set(color, {
              objects: [],
              pathStrings: [],
              contoursList: [],
              maxZ: idx,
              totalArea: 0
            });
          }
          const entry = colorGroupsMap.get(color)!;
          entry.objects.push(obj);
          entry.pathStrings.push(d.trim());
          if (contours.length > 0) {
            entry.contoursList.push(contours);
          }
          entry.maxZ = Math.max(entry.maxZ, idx);
          entry.totalArea += area;
        });

        if (colorGroupsMap.size === 0) return;

        // Order color groups strictly according to Active Mats list order (top-to-bottom: foreground to background)
        const sortedGroups = Array.from(colorGroupsMap.entries())
          .sort((a, b) => {
            const idxA = effectiveOrder.indexOf(a[0]);
            const idxB = effectiveOrder.indexOf(b[0]);
            if (idxA !== -1 && idxB !== -1) {
              return idxA - idxB;
            }
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return 0;
          })
          .map(([color, data]) => ({
            color,
            pathStrings: data.pathStrings,
            contoursList: data.contoursList
          }));

        // Compute geometry based on selected mode
        const flattenedLayers = flattenColorLayers(sortedGroups, mode);
        if (flattenedLayers.length === 0) return;

        // Remove existing vector objects
        objects.forEach((obj) => canvas.remove(obj));

        // Add flattened paths in back-to-front order (reverse of front-to-back)
        const newMasterPaths: MasterVectorPath[] = [];
        const newColors: string[] = [];

        const layersToAdd = [...flattenedLayers].reverse();

        for (const layer of layersToAdd) {
          const pathObj = createAbsoluteWorldPath(layer.d, {
            fill: layer.color,
            stroke: null,
            strokeWidth: 0,
            objectCaching: false,
            selectable: true,
            hasControls: true,
            hoverCursor: 'pointer'
          });

          (pathObj as any)._originalFill = layer.color;
          (pathObj as any)._originalStroke = null;
          (pathObj as any)._originalStrokeWidth = 0;

          canvas.add(pathObj);
          applyDashedBoundingStyles(pathObj);

          const b = pathObj.getBoundingRect();
          newMasterPaths.push({
            obj: pathObj,
            originalFill: layer.color,
            originalStroke: null,
            originalStrokeWidth: 0,
            area: b.width * b.height
          });
        }

        // Maintain exact top-to-bottom order for uniqueColors
        newColors.push(...flattenedLayers.map((l) => l.color));

        masterPathsRef.current = newMasterPaths;
        uniqueColorsRef.current = newColors;
        setMaxColorCount(Math.max(newColors.length, 2));
        setActiveColorCount(newColors.length);

        canvas.discardActiveObject();
        canvas.renderAll();
        refreshColorLayers();
        runWeedCheck();
      } catch (err) {
        console.error('[FlattenArtwork] Error during flattening:', err);
      } finally {
        const elapsed = Date.now() - startTime;
        if (elapsed < 500) {
          await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
        }
        setIsFlattening(false);
      }
    },
    [pushUndoSnapshot, applyDashedBoundingStyles, refreshColorLayers, runWeedCheck]
  );

  const changeSelectedObjectColor = useCallback(
    (color: string) => {
      const canvas = fabricCanvasRef.current;
      const active = canvas?.getActiveObject() || selectedObject;
      if (!canvas || !active) return;

      pushUndoSnapshot();

      const normColor = color.trim().toUpperCase();

      const isMulti = active instanceof ActiveSelection || (active as any).type?.toLowerCase() === 'activeselection' || typeof (active as any).getObjects === 'function';
      let objs: FabricObject[] = [];
      if (isMulti) {
        objs = (active as any).getObjects ? (active as any).getObjects() : (active as any)._objects || [];
      } else {
        objs = [active];
      }

      const getLeaves = (items: FabricObject[]): FabricObject[] => {
        const result: FabricObject[] = [];
        const walk = (o: any) => {
          if (!o) return;
          if (o.type === 'activeSelection' || (o.type === 'group' && typeof o.getObjects === 'function' && !o.fill)) {
            const ch = o.getObjects ? o.getObjects() : o._objects;
            if (Array.isArray(ch) && ch.length > 0) {
              ch.forEach(walk);
              return;
            }
          }
          result.push(o);
        };
        items.forEach(walk);
        return result;
      };

      const leafObjs = getLeaves(objs);

      leafObjs.forEach((obj) => {
        obj.set('fill', normColor);
        (obj as any)._originalFill = normColor;
        obj.set('dirty', true);
      });
      (active as any).set?.('dirty', true);
      active.setCoords();

      const objsSet = new Set(leafObjs);
      masterPathsRef.current.forEach((item) => {
        if (objsSet.has(item.obj)) {
          item.originalFill = normColor;
        }
      });

      setSelectedColor(normColor);
      setSelectedLayerColors([normColor]);
      canvas.requestRenderAll();
      canvas.renderAll();
      refreshColorLayers();
      runWeedCheck(normColor);
    },
    [pushUndoSnapshot, selectedObject, refreshColorLayers, runWeedCheck]
  );

  const deleteSelectedObject = useCallback(
    (target?: FabricObject) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const active = target || canvas.getActiveObject() || selectedObject;
      if (!active) return;

      pushUndoSnapshot();

      const activeObjs = canvas.getActiveObjects();
      let objs: FabricObject[] = [];
      if (target && !activeObjs.includes(target)) {
        objs = [target];
      } else if (activeObjs.length > 0) {
        objs = activeObjs.slice();
      } else {
        const isMulti =
          active instanceof ActiveSelection ||
          (active as any).type?.toLowerCase() === 'activeselection' ||
          typeof (active as any).getObjects === 'function';
        objs = isMulti ? (active as any).getObjects().slice() : [active];
      }

      // Filter out crop overlay or preview objects
      objs = objs.filter((o) => (o as any).name !== 'crop-overlay' && o !== cropOverlayObjRef.current);
      if (objs.length === 0) return;

      // Discard active object first so ActiveSelection unbinds objects from the group
      canvas.discardActiveObject();

      objs.forEach((obj) => canvas.remove(obj));
      const objsSet = new Set(objs);
      masterPathsRef.current = masterPathsRef.current.filter((item) => !objsSet.has(item.obj));

      setSelectedObject(null);
      setSelectedColor(null);
      setSelectedLayerColors([]);
      setSelectionBounds(null);
      setContextMenuState((prev) => (prev.isOpen ? { ...prev, isOpen: false, targetObject: null } : prev));
      canvas.renderAll();
      refreshColorLayers();
      runWeedCheckRef.current();
    },
    [pushUndoSnapshot, selectedObject, refreshColorLayers]
  );
  deleteSelectedObjectRef.current = deleteSelectedObject;

  /**
   * Z-Ordering: Bring to Front (top of cut layer stack)
   */
  const bringToFront = useCallback((target?: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    const active = target || canvas?.getActiveObject() || selectedObject;
    if (!canvas || !active) return;

    pushUndoSnapshot();
    const objs = (active instanceof ActiveSelection || typeof (active as any).getObjects === 'function')
      ? (active as any).getObjects()
      : [active];

    objs.forEach((o: FabricObject) => {
      canvas.remove(o);
      canvas.add(o);
    });

    canvas.setActiveObject(active);
    canvas.renderAll();
    refreshColorLayers();
  }, [selectedObject, pushUndoSnapshot, refreshColorLayers]);

  /**
   * Z-Ordering: Send to Back (bottom of cut layer stack)
   */
  const sendToBack = useCallback((target?: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    const active = target || canvas?.getActiveObject() || selectedObject;
    if (!canvas || !active) return;

    pushUndoSnapshot();
    const objs = (active instanceof ActiveSelection || typeof (active as any).getObjects === 'function')
      ? (active as any).getObjects()
      : [active];

    [...objs].reverse().forEach((o: FabricObject) => {
      canvas.remove(o);
      canvas.insertAt(0, o);
    });

    canvas.setActiveObject(active);
    canvas.renderAll();
    refreshColorLayers();
  }, [selectedObject, pushUndoSnapshot, refreshColorLayers]);

  /**
   * Z-Ordering: Bring Forward by 1 layer
   */
  const bringForward = useCallback((target?: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    const active = target || canvas?.getActiveObject() || selectedObject;
    if (!canvas || !active) return;

    pushUndoSnapshot();
    const objs = (active instanceof ActiveSelection || typeof (active as any).getObjects === 'function')
      ? (active as any).getObjects()
      : [active];

    [...objs].reverse().forEach((o: FabricObject) => {
      const idx = canvas.getObjects().indexOf(o);
      if (idx !== -1 && idx < canvas.getObjects().length - 1) {
        canvas.remove(o);
        canvas.insertAt(idx + 1, o);
      }
    });

    canvas.setActiveObject(active);
    canvas.renderAll();
    refreshColorLayers();
  }, [selectedObject, pushUndoSnapshot, refreshColorLayers]);

  /**
   * Z-Ordering: Send Backward by 1 layer
   */
  const sendBackward = useCallback((target?: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    const active = target || canvas?.getActiveObject() || selectedObject;
    if (!canvas || !active) return;

    pushUndoSnapshot();
    const objs = (active instanceof ActiveSelection || typeof (active as any).getObjects === 'function')
      ? (active as any).getObjects()
      : [active];

    objs.forEach((o: FabricObject) => {
      const idx = canvas.getObjects().indexOf(o);
      if (idx > 0) {
        canvas.remove(o);
        canvas.insertAt(idx - 1, o);
      }
    });

    canvas.setActiveObject(active);
    canvas.renderAll();
    refreshColorLayers();
  }, [selectedObject, pushUndoSnapshot, refreshColorLayers]);

  /**
   * Duplicate selected element
   */
  const duplicateSelectedObject = useCallback(async (target?: FabricObject) => {
    const canvas = fabricCanvasRef.current;
    const obj = target || canvas?.getActiveObject() || selectedObject;
    if (!canvas || !obj) return;

    pushUndoSnapshot();
    try {
      if (obj instanceof ActiveSelection || (obj as any).type?.toLowerCase() === 'activeselection') {
        const objs: FabricObject[] = typeof (obj as any).getObjects === 'function' ? (obj as any).getObjects() : [];
        const clonedList: FabricObject[] = [];
        for (const o of objs) {
          const c = await o.clone();
          c.set({
            left: (c.left || 0) + 16,
            top: (c.top || 0) + 16,
            selectable: true,
            hasControls: true
          });
          canvas.add(c);
          clonedList.push(c);
        }
        if (clonedList.length > 0) {
          const newSel = new ActiveSelection(clonedList, { canvas });
          applyDashedBoundingStyles(newSel);
          canvas.setActiveObject(newSel);
          setSelectedObject(newSel);
          canvas.renderAll();
          refreshColorLayers();
        }
        return;
      }

      const cloned = await obj.clone();
      cloned.set({
        left: (cloned.left || 0) + 16,
        top: (cloned.top || 0) + 16,
        selectable: true,
        hasControls: true
      });
      canvas.add(cloned);
      applyDashedBoundingStyles(cloned);
      canvas.setActiveObject(cloned);
      setSelectedObject(cloned);
      if (cloned.fill && typeof cloned.fill === 'string') {
        setSelectedColor(cloned.fill);
      }
      canvas.renderAll();
      refreshColorLayers();
    } catch (e) {
      console.error('Failed to clone object:', e);
    }
  }, [selectedObject, pushUndoSnapshot, applyDashedBoundingStyles, refreshColorLayers]);

  /**
   * Opens the unified context menu when right-clicking a mat card in the Active Mats list
   */
  const openContextMenuForMat = useCallback(
    (colors: string | string[], clientPos: { x: number; y: number }) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const colorsArr = Array.isArray(colors) ? colors : [colors];
      if (colorsArr.length === 0) return;

      const normColors = colorsArr.map((c) => c.trim().toUpperCase());
      const colorsSet = new Set(normColors);

      const matching = canvas.getObjects().filter((obj) => {
        if ((obj as any).name === 'crop-overlay' || (obj as any).name === 'lasso-preview' || (obj as any).name === 'raster-target') {
          return false;
        }
        const f = ((obj.fill as string) || '').trim().toUpperCase();
        return colorsSet.has(f);
      });

      if (matching.length === 0) return;

      matching.forEach((o) => o.set('visible', true));

      const primaryColor = normColors[0];
      setSelectedColor(primaryColor);
      setSelectedLayerColors(normColors);

      let effectiveTarget: FabricObject;

      if (matching.length === 1) {
        effectiveTarget = matching[0];
        applyDashedBoundingStyles(matching[0]);
        canvas.setActiveObject(matching[0]);
        setSelectedObject(matching[0]);

        const zoom = canvas.getZoom() || 1;
        const b = matching[0].getBoundingRect();
        setSelectionBounds({
          width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
          height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
          left: b.left,
          top: b.top,
          label: `Mat: ${primaryColor} (1 element)`
        });
      } else {
        const selection = new ActiveSelection(matching, { canvas });
        applyDashedBoundingStyles(selection);
        canvas.setActiveObject(selection);
        setSelectedObject(selection);
        effectiveTarget = selection;

        const zoom = canvas.getZoom() || 1;
        const b = selection.getBoundingRect();
        setSelectionBounds({
          width: Math.max(Math.round((b.width / zoom) * 100) / 100, 1),
          height: Math.max(Math.round((b.height / zoom) * 100) / 100, 1),
          left: b.left,
          top: b.top,
          label: normColors.length > 1
            ? `${normColors.length} Mats (${matching.length} elements)`
            : `Mat: ${primaryColor} (${matching.length} elements)`
        });
      }

      canvas.renderAll();

      setContextMenuState({
        isOpen: true,
        x: clientPos.x,
        y: clientPos.y,
        targetObject: effectiveTarget
      });
    },
    [applyDashedBoundingStyles]
  );

  const applyLineArtStyling = useCallback(
    (penWidth: number, colorMode: 'black' | 'color') => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      canvas.getObjects().forEach((obj) => {
        const name = (obj as any).name;
        if (name === 'crop-overlay' || name === 'lasso-preview' || (obj as any).excludeFromExport) return;

        const origFill =
          (obj as any)._originalFill ||
          (typeof obj.fill === 'string' && obj.fill !== 'transparent' && obj.fill !== 'none'
            ? obj.fill
            : '#000000');
        const strokeColor = colorMode === 'color' ? origFill : '#000000';

        obj.set({
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: penWidth,
          strokeLineJoin: 'round',
          strokeLineCap: 'round'
        });
      });

      canvas.renderAll();
      refreshColorLayers();
    },
    [refreshColorLayers]
  );

  const toggleLineArt = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    pushUndoSnapshot();

    const nextState = !isLineArt;
    setIsLineArt(nextState);

    canvas.getObjects().forEach((obj) => {
      const name = (obj as any).name;
      if (name === 'crop-overlay' || name === 'lasso-preview' || (obj as any).excludeFromExport) return;

      if (nextState) {
        if (!(obj as any)._originalFill) {
          (obj as any)._originalFill =
            typeof obj.fill === 'string' && obj.fill !== 'transparent' && obj.fill !== 'none'
              ? obj.fill
              : '#000000';
        }
        if ((obj as any)._originalStroke === undefined) {
          (obj as any)._originalStroke = obj.stroke || null;
        }
        if ((obj as any)._originalStrokeWidth === undefined) {
          (obj as any)._originalStrokeWidth = obj.strokeWidth || 0;
        }

        const origFill = (obj as any)._originalFill || '#000000';
        const strokeColor = lineArtColorMode === 'color' ? origFill : '#000000';

        obj.set({
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth: lineArtPenWidth,
          strokeLineJoin: 'round',
          strokeLineCap: 'round'
        });
      } else {
        const origFill = (obj as any)._originalFill || '#000000';
        const origStroke = (obj as any)._originalStroke !== undefined ? (obj as any)._originalStroke : null;
        const origStrokeWidth = (obj as any)._originalStrokeWidth !== undefined ? (obj as any)._originalStrokeWidth : 0;
        obj.set({
          fill: origFill,
          stroke: origStroke,
          strokeWidth: origStrokeWidth
        });
      }
    });

    canvas.renderAll();
    refreshColorLayers();
  }, [pushUndoSnapshot, isLineArt, lineArtColorMode, lineArtPenWidth, refreshColorLayers]);

  const changeLineArtPenWidth = useCallback(
    (width: number) => {
      setLineArtPenWidth(width);
      if (isLineArt) {
        applyLineArtStyling(width, lineArtColorMode);
      }
    },
    [isLineArt, lineArtColorMode, applyLineArtStyling]
  );

  const changeLineArtColorMode = useCallback(
    (mode: 'black' | 'color') => {
      setLineArtColorMode(mode);
      if (isLineArt) {
        applyLineArtStyling(lineArtPenWidth, mode);
      }
    },
    [isLineArt, lineArtPenWidth, applyLineArtStyling]
  );

  const exportPng = useCallback((multiplier = 3): string => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return '';

    return canvas.toDataURL({
      format: 'png',
      multiplier,
      enableRetinaScaling: true
    } as any);
  }, []);

  const cancelCrop = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (cropOverlayObjRef.current) {
      canvas.remove(cropOverlayObjRef.current);
      cropOverlayObjRef.current = null;
    }
    lassoPointsRef.current = [];
    isLassoMouseDownRef.current = false;
    setLassoPointsCount(0);
    setActiveCropType('none');
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    canvas.renderAll();
  }, []);

  /**
   * Calculates a rectangle that fully encompasses the maximum extent
   * (horizontally and vertically) of all visible artwork image elements on canvas.
   */
  const getArtworkExtentRect = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return null;

    const objects = canvas
      .getObjects()
      .filter((o) => o.visible && (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview' && (o as any).name !== 'brush-preview');

    if (objects.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach((obj) => {
      // In Fabric.js, getCoords() returns the 4 corner points [tl, tr, br, bl] in canvas scene coordinates
      const coords = obj.getCoords ? obj.getCoords() : null;
      if (coords && coords.length > 0) {
        coords.forEach((pt: any) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });
      } else {
        const b = obj.getBoundingRect();
        minX = Math.min(minX, b.left);
        minY = Math.min(minY, b.top);
        maxX = Math.max(maxX, b.left + b.width);
        maxY = Math.max(maxY, b.top + b.height);
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    const width = Math.max(maxX - minX, 10);
    const height = Math.max(maxY - minY, 10);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width,
      height,
      centerX,
      centerY
    };
  }, []);

  /**
   * Re-centers the view and sets zoom so the maximum extent rectangle of all image elements fills the view
   */
  const recenterOnArtwork = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const extent = getArtworkExtentRect();
    if (!extent) return;

    // Calculate zoom factor so maximum extent rectangle fits and fills the canvas viewport (with a 92% comfortable padding)
    const padding = 0.92;
    const availableWidth = Math.max(canvas.width * padding, 10);
    const availableHeight = Math.max(canvas.height * padding, 10);

    const fitZoomX = availableWidth / extent.width;
    const fitZoomY = availableHeight / extent.height;
    const targetZoom = Math.min(fitZoomX, fitZoomY);

    // Clamp zoom to reasonable limits (e.g. 0.05 to 10)
    const clampedZoom = Math.max(0.05, Math.min(targetZoom, 10));
    setZoomLevel(Math.round(clampedZoom * 100) / 100);

    // Center the extent rectangle at the center of the canvas viewport
    const vptX = (canvas.width / 2) - extent.centerX * clampedZoom;
    const vptY = (canvas.height / 2) - extent.centerY * clampedZoom;

    canvas.setViewportTransform([clampedZoom, 0, 0, clampedZoom, vptX, vptY]);
    canvas.requestRenderAll();
    updateViewportTransformRef.current();
  }, [getArtworkExtentRect]);

  recenterOnArtworkRef.current = recenterOnArtwork;

  const startRectCrop = useCallback((aspectRatio?: 'free' | '1:1' | '4:5' | '16:9') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    cancelCrop();
    setActiveCropType('rect');

    // 1. Calculate maximum extent of the current artwork (images or vector paths)
    const extent = getArtworkExtentRect();

    let width = extent ? extent.width : canvas.width * 0.8;
    let height = extent ? extent.height : canvas.height * 0.8;
    let centerX = extent ? extent.centerX : canvas.width / 2;
    let centerY = extent ? extent.centerY : canvas.height / 2;

    if (aspectRatio === '1:1') {
      const s = Math.max(width, height);
      width = s;
      height = s;
    } else if (aspectRatio === '4:5') {
      const targetRatio = 4 / 5;
      if (width / height > targetRatio) {
        height = width / targetRatio;
      } else {
        width = height * targetRatio;
      }
    } else if (aspectRatio === '16:9') {
      const targetRatio = 16 / 9;
      if (width / height > targetRatio) {
        height = width / targetRatio;
      } else {
        width = height * targetRatio;
      }
    }

    const rect = new Rect({
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
      width,
      height,
      fill: 'rgba(79, 70, 229, 0.12)',
      stroke: '#4F46E5',
      strokeWidth: 2,
      strokeDashArray: [6, 6],
      cornerColor: '#4F46E5',
      cornerSize: 12,
      transparentCorners: false,
      selectable: true,
      hasRotatingPoint: false,
      lockUniScaling: aspectRatio !== 'free' && aspectRatio !== undefined,
      name: 'crop-overlay'
    });

    cropOverlayObjRef.current = rect;
    canvas.add(rect);
    canvas.setActiveObject(rect);
    setSelectionBounds({
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      left: centerX - width / 2,
      top: centerY - height / 2,
      label: 'Crop Area'
    });
    canvas.renderAll();
  }, [cancelCrop, getArtworkExtentRect]);

  const startCircleCrop = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    cancelCrop();
    setActiveCropType('circle');

    const extent = getArtworkExtentRect();
    let width = extent ? extent.width : canvas.width * 0.8;
    let height = extent ? extent.height : canvas.height * 0.8;
    let centerX = extent ? extent.centerX : canvas.width / 2;
    let centerY = extent ? extent.centerY : canvas.height / 2;

    const radius = Math.max(width, height) / 2;

    const circle = new Circle({
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
      radius,
      fill: 'rgba(79, 70, 229, 0.12)',
      stroke: '#4F46E5',
      strokeWidth: 2,
      strokeDashArray: [6, 6],
      cornerColor: '#4F46E5',
      cornerSize: 12,
      transparentCorners: false,
      selectable: true,
      hasRotatingPoint: false,
      name: 'crop-overlay'
    });

    cropOverlayObjRef.current = circle;
    canvas.add(circle);
    canvas.setActiveObject(circle);
    setSelectionBounds({
      width: Math.round(radius * 2 * 100) / 100,
      height: Math.round(radius * 2 * 100) / 100,
      left: centerX - radius,
      top: centerY - radius,
      label: 'Crop Area'
    });
    canvas.renderAll();
  }, [cancelCrop, getArtworkExtentRect]);

  const startLassoCrop = useCallback((subType: 'lasso-freehand' | 'lasso-polygon') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    cancelCrop();
    setActiveCropType(subType);
    canvas.discardActiveObject();
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';

    lassoPointsRef.current = [];
    setLassoPointsCount(0);
    canvas.renderAll();
  }, [cancelCrop]);

  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (opt: any) => {
      if (activeCropType !== 'lasso-freehand' && activeCropType !== 'lasso-polygon') return;
      const pointer = canvas.getPointer(opt.e);
      isLassoMouseDownRef.current = true;

      if (activeCropType === 'lasso-polygon') {
        lassoPointsRef.current.push({ x: pointer.x, y: pointer.y });
        setLassoPointsCount(lassoPointsRef.current.length);
        updateLassoPolygon();
      } else if (activeCropType === 'lasso-freehand') {
        lassoPointsRef.current = [{ x: pointer.x, y: pointer.y }];
        setLassoPointsCount(1);
      }
    };

    const handleMouseMove = (opt: any) => {
      if (!isLassoMouseDownRef.current) return;
      if (activeCropType !== 'lasso-freehand') return;

      const pointer = canvas.getPointer(opt.e);
      lassoPointsRef.current.push({ x: pointer.x, y: pointer.y });
      setLassoPointsCount(lassoPointsRef.current.length);
      updateLassoPolygon();
    };

    const handleMouseUp = () => {
      if (activeCropType === 'lasso-freehand') {
        isLassoMouseDownRef.current = false;
        updateLassoPolygon();
      }
    };

    const updateLassoPolygon = () => {
      const points = lassoPointsRef.current;
      if (points.length < 2) return;

      if (cropOverlayObjRef.current) {
        canvas.remove(cropOverlayObjRef.current);
      }

      const poly = new Polygon(points, {
        fill: 'rgba(79, 70, 229, 0.15)',
        stroke: '#4F46E5',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false
      });

      cropOverlayObjRef.current = poly;
      canvas.add(poly);
      canvas.renderAll();
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [activeCropType]);

  // Toggle canvas interactivity and cursor when entering/exiting brush mode
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (brushMode === 'none') {
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        if ((obj as any).name !== 'crop-overlay' && (obj as any).name !== 'brush-preview') {
          obj.selectable = true;
          obj.evented = true;
        }
      });
      canvas.defaultCursor = 'default';
      canvas.renderAll();
    } else {
      // In Paint or Erase mode, objects shouldn't be selected or moved
      canvas.selection = false;
      canvas.discardActiveObject();
      canvas.forEachObject((obj) => {
        if ((obj as any).name !== 'brush-preview') {
          obj.selectable = false;
          obj.evented = false;
        }
      });
      canvas.defaultCursor = 'crosshair';
      canvas.renderAll();
    }
  }, [brushMode]);

  // Keyboard shortcuts: Escape to exit brush, [ / ] to resize brush
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (brushMode === 'none') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setBrushMode('none');
      } else if (e.key === '[') {
        e.preventDefault();
        setBrushSize((prev) => Math.max(4, prev - 4));
      } else if (e.key === ']') {
        e.preventDefault();
        setBrushSize((prev) => Math.min(100, prev + 4));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [brushMode]);

  // Keyboard Arrow Keys (Cursor keys) Nudge & Movement Handler
  // Whenever any selection exists, arrow keys move the selection just like dragging with the mouse
  const isNudgingRef = useRef<boolean>(false);
  const nudgeUndoTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not nudge if user is typing in an input, textarea, or contentEditable element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }

      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const active = canvas.getActiveObject();
      if (!active) return;

      // Do not nudge crop overlay or during crop mode
      if ((active as any).name === 'crop-overlay' || activeCropType !== 'none') {
        return;
      }

      e.preventDefault();

      // Push undo snapshot once at the start of a nudge sequence
      if (!isNudgingRef.current) {
        isNudgingRef.current = true;
        pushUndoSnapshot();
      }
      if (nudgeUndoTimeoutRef.current) {
        clearTimeout(nudgeUndoTimeoutRef.current);
      }
      nudgeUndoTimeoutRef.current = window.setTimeout(() => {
        isNudgingRef.current = false;
      }, 600);

      // Normal arrow = 2px, Shift + arrow = 10px fast nudge
      const step = e.shiftKey ? 10 : 2;
      let deltaX = 0;
      let deltaY = 0;

      if (e.key === 'ArrowUp') deltaY = -step;
      else if (e.key === 'ArrowDown') deltaY = step;
      else if (e.key === 'ArrowLeft') deltaX = -step;
      else if (e.key === 'ArrowRight') deltaX = step;

      active.set({
        left: (active.left || 0) + deltaX,
        top: (active.top || 0) + deltaY
      });
      active.setCoords();

      // Trigger standard Fabric movement events & update live bounds overlay
      canvas.fire('object:moving', { target: active } as any);
      canvas.fire('object:modified', { target: active } as any);
      canvas.requestRenderAll();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (nudgeUndoTimeoutRef.current) {
        clearTimeout(nudgeUndoTimeoutRef.current);
      }
    };
  }, [activeCropType, pushUndoSnapshot]);

  // Interactive Brush & Eraser Stroke Capturing
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || brushMode === 'none') return;

    const applyBrushSegment = (segPoly: number[][][][]) => {
      try {
        const targetColor = brushActiveTargetColorRef.current;
        const res = applyStrokeToLayerGeometry(
          brushTargetPolyRef.current,
          segPoly,
          brushMode === 'erase' ? 'erase' : 'paint'
        );
        brushTargetPolyRef.current = res.updatedMultiPoly;

        // Paint effect applies strictly to the layer being edited; all elements on layers above remain above and untouched
        let targetZ = brushTargetZIndexRef.current;
        brushTargetObjsRef.current.forEach((o) => {
          const idx = canvas.getObjects().indexOf(o);
          if (idx !== -1 && idx < targetZ) targetZ = idx;
          canvas.remove(o);
        });
        brushTargetZIndexRef.current = targetZ;

        if (res.svgD && res.svgD.trim().length > 0) {
          const newPath = createAbsoluteWorldPath(res.svgD, {
            fill: targetColor,
            selectable: false,
            evented: false,
            hoverCursor: 'crosshair'
          });
          (newPath as any)._originalFill = targetColor;
          (newPath as any)._originalStroke = null;
          (newPath as any)._originalStrokeWidth = 0;
          const insertAt = Math.max(0, Math.min(canvas.getObjects().length, targetZ));
          canvas.insertAt(insertAt, newPath);
          brushTargetObjsRef.current = [newPath];
        } else {
          brushTargetObjsRef.current = [];
        }

        canvas.requestRenderAll();
      } catch (err) {
        console.warn('[BrushLive] Segment update error:', err);
      }
    };

    const handleMouseDown = (opt: any) => {
      const me = opt.e as MouseEvent;

      // Right mouse button held: Enter Brush Size Adjustment Drag mode
      if (me.button === 2) {
        me.preventDefault();
        me.stopPropagation();
        isRightMouseResizingRef.current = true;
        brushResizeStartXRef.current = me.clientX;
        brushResizeStartSizeRef.current = brushSizeRef.current;
        setIsResizingBrush(true);
        setBrushResizePos({ x: me.clientX, y: me.clientY });
        return;
      }

      if (me.button !== 0) return; // Left click only for drawing
      canvas.calcOffset();
      const pointer = (opt.scenePoint || canvas.getScenePoint(opt.e) || canvas.getPointer(opt.e));

      // =========================================================================
      // VECTOR FILL TOOL: Fills closed vector loops on the selected layer
      // If the clicked loop is open / non-closed, it strictly does nothing!
      // =========================================================================
      if (brushMode === 'fill') {
        const allObjects = canvas.getObjects().filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'brush-preview' && o.visible !== false);
        if (allObjects.length === 0) return;

        // 1. Identify the target vector:
        // Prioritize:
        // a) Currently active / selected vector object if its subpaths enclose the click
        // b) Vector object under the cursor (or whose subpaths enclose pointer)
        // c) Vector object matching activeBrushColor / selectedColor whose subpaths enclose pointer
        const activeObj = canvas.getActiveObject() || selectedObject;
        const candidateActiveObjs: FabricObject[] = [];
        if (activeObj && activeObj.visible !== false) {
          if ((activeObj as any).type === 'activeSelection' && typeof (activeObj as any).getObjects === 'function') {
            candidateActiveObjs.push(...(activeObj as any).getObjects().filter((o: FabricObject) => o.visible !== false));
          } else {
            candidateActiveObjs.push(activeObj);
          }
        }

        let targetVector: FabricObject | null = null;
        let matchingSubpaths: ExtractedSubpath[] = [];

        // Check if pointer is enclosed by subpaths of activeObj
        for (const cand of candidateActiveObjs) {
          const cmds = extractCommandsFromObject(cand);
          if (cmds.length > 0) {
            const sps = extractSubpathsFromCommands(cmds);
            const enclosed = sps.filter((sp) => pointInPolygon(pointer, sp.points));
            if (enclosed.length > 0) {
              targetVector = cand;
              matchingSubpaths = enclosed;
              break;
            }
          }
        }

        // If not found in active selection, check all vector objects on canvas
        if (!targetVector) {
          const preferredColor = (activeBrushColor || selectedColor || '').trim().toUpperCase();
          const sortedAllObjects = [...allObjects].sort((a, b) => {
            const colA = ((a.fill as string) || (a as any)._originalFill || '').trim().toUpperCase();
            const colB = ((b.fill as string) || (b as any)._originalFill || '').trim().toUpperCase();
            if (preferredColor && colA === preferredColor && colB !== preferredColor) return -1;
            if (preferredColor && colB === preferredColor && colA !== preferredColor) return 1;
            return 0;
          });

          for (const cand of sortedAllObjects) {
            const cmds = extractCommandsFromObject(cand);
            if (cmds.length > 0) {
              const sps = extractSubpathsFromCommands(cmds);
              const enclosed = sps.filter((sp) => pointInPolygon(pointer, sp.points));
              if (enclosed.length > 0) {
                targetVector = cand;
                matchingSubpaths = enclosed;
                break;
              }
            }
          }
        }

        // If no vector contains the click within any closed/open subpath, abort
        if (!targetVector || matchingSubpaths.length === 0) return;

        // Sort by area ascending: innermost enclosing subpath is first (e.g. inner hole/cutout or innermost loop)
        matchingSubpaths.sort((a, b) => a.area - b.area);
        const innermost = matchingSubpaths[0];

        // STRICT REQUIREMENT: "dont do anything if we try to fill a non closed loop."
        if (!innermost.isClosed) {
          return;
        }

        // Target color of the vector
        const targetColor = normalizeHexColor((targetVector.fill as string) || (targetVector as any)._originalFill || activeBrushColor || selectedColor || '#000000');

        // Closed loop confirmed: construct filled polygon geometry
        const loopRing: [number, number][] = innermost.points.map((pt) => [
          Number(pt.x.toFixed(2)),
          Number(pt.y.toFixed(2))
        ]);
        if (
          loopRing[0][0] !== loopRing[loopRing.length - 1][0] ||
          loopRing[0][1] !== loopRing[loopRing.length - 1][1]
        ) {
          loopRing.push([loopRing[0][0], loopRing[0][1]]);
        }

        // CRITICAL FIX: MultiPolygon structure is [[loopRing]], exactly 3 levels of array brackets!
        const loopMultiPoly: number[][][][] = [[loopRing]];

        pushUndoSnapshot();

        // Get all objects belonging to this target layer
        const targetObjects = allObjects.filter((o) => {
          const f = (o.fill as string) || (o as any)._originalFill;
          return areColorsMatching(f, targetColor);
        });
        if (!targetObjects.includes(targetVector)) {
          targetObjects.push(targetVector);
        }

        // Extract current target layer geometry
        const targetContours: { x: number; y: number }[][][] = [];
        targetObjects.forEach((obj) => {
          const cmds = extractCommandsFromObject(obj);
          if (cmds.length > 0) {
            const c = commandsToContours(cmds);
            if (c.length > 0) targetContours.push(c);
          }
        });

        const targetPoly = pathsToMultiPolygon([], targetContours);
        let filledPoly: number[][][][];
        try {
          filledPoly = (polygonClipping as any).union(targetPoly, loopMultiPoly);
        } catch (err) {
          console.warn('[FillTool] Boolean union failed:', err);
          filledPoly = [...targetPoly, ...loopMultiPoly];
        }

        // Knockout: subtract the filled area from other vinyl layers so layers do not overlap (skip hidden layers)
        const otherObjects = allObjects.filter((o) => {
          if (o.visible === false) return false;
          const f = (o.fill as string) || (o as any)._originalFill;
          const norm = normalizeHexColor(f);
          return norm !== 'transparent' && !areColorsMatching(norm, targetColor);
        });

        const otherByColor = new Map<string, FabricObject[]>();
        otherObjects.forEach((o) => {
          const c = normalizeHexColor((o.fill as string) || (o as any)._originalFill);
          if (!otherByColor.has(c)) otherByColor.set(c, []);
          otherByColor.get(c)!.push(o);
        });

        const canvasObjs = canvas.getObjects();
        for (const [col, colObjs] of otherByColor.entries()) {
          const contours: { x: number; y: number }[][][] = [];
          let colZ = canvasObjs.length;
          colObjs.forEach((o) => {
            const idx = canvasObjs.indexOf(o);
            if (idx !== -1 && idx < colZ) colZ = idx;
            const cmds = extractCommandsFromObject(o);
            if (cmds.length > 0) {
              const c = commandsToContours(cmds);
              if (c.length > 0) contours.push(c);
            }
          });
          const poly = pathsToMultiPolygon([], contours);
          if (poly.length > 0) {
            try {
              const diff = (polygonClipping as any).difference(poly, loopMultiPoly);
              colObjs.forEach((o) => canvas.remove(o));
              const diffD = multiPolygonToSvgD(diff);
              if (diffD && diffD.trim().length > 0) {
                const diffPath = createAbsoluteWorldPath(diffD, {
                  fill: col,
                  selectable: false,
                  evented: false,
                  hoverCursor: 'crosshair'
                });
                (diffPath as any)._originalFill = col;
                const insertAt = Math.max(0, Math.min(canvas.getObjects().length, colZ));
                canvas.insertAt(insertAt, diffPath);
              }
            } catch (err) {
              console.warn('[FillTool] Knockout subtraction error for color:', col, err);
            }
          }
        }

        // Replace target layer objects on canvas with new united path AT original z-index
        const currentAll = canvas.getObjects();
        let targetZ = currentAll.length;
        targetObjects.forEach((obj) => {
          const idx = currentAll.indexOf(obj);
          if (idx !== -1 && idx < targetZ) targetZ = idx;
          canvas.remove(obj);
        });
        const newD = multiPolygonToSvgD(filledPoly);
        if (newD && newD.trim().length > 0) {
          const newPath = createAbsoluteWorldPath(newD, {
            fill: targetColor,
            selectable: false,
            evented: false,
            hoverCursor: 'crosshair'
          });
          (newPath as any)._originalFill = targetColor;
          const insertAt = Math.max(0, Math.min(canvas.getObjects().length, targetZ));
          canvas.insertAt(insertAt, newPath);
          setSelectedObject(newPath);
        }

        // Rebuild masterPathsRef
        const remaining = canvas.getObjects().filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'brush-preview');
        masterPathsRef.current = remaining.map((obj) => {
          const b = obj.getBoundingRect();
          const fillStr = (typeof obj.fill === 'string' && obj.fill !== 'none' ? obj.fill : '#000000').trim().toUpperCase();
          return {
            obj,
            originalFill: (obj as any)._originalFill || fillStr,
            originalStroke: (obj as any)._originalStroke || (typeof obj.stroke === 'string' ? obj.stroke : null),
            originalStrokeWidth: (obj as any)._originalStrokeWidth || obj.strokeWidth || 0,
            area: b.width * b.height
          };
        });

        refreshColorLayers();
        canvas.renderAll();
        if (isWeedCheckActive) {
          runWeedCheck();
        }
        return;
      }

      isBrushMouseDownRef.current = true;
      brushStrokePointsRef.current = [{ x: pointer.x, y: pointer.y }];

      const targetColor = normalizeHexColor(activeBrushColor || selectedColor || colorLayers[0]?.color || '#000000');
      brushActiveTargetColorRef.current = targetColor;

      pushUndoSnapshot();

      const allObjects = canvas.getObjects().filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'brush-preview');
      const targetObjects = allObjects.filter((o) => {
        if (o.visible === false) return false;
        const f = (o.fill as string) || (o as any)._originalFill;
        return areColorsMatching(f, targetColor);
      });

      // Find lowest z-index among target objects so painted layer remains in its original stack position
      const allCanvasObjs = canvas.getObjects();
      let targetZ = allCanvasObjs.length;
      targetObjects.forEach((o) => {
        const idx = allCanvasObjs.indexOf(o);
        if (idx !== -1 && idx < targetZ) {
          targetZ = idx;
        }
      });
      brushTargetZIndexRef.current = targetZ;

      const targetContours: { x: number; y: number }[][][] = [];
      targetObjects.forEach((obj) => {
        const cmds = extractCommandsFromObject(obj);
        if (cmds.length > 0) {
          const c = commandsToContours(cmds);
          if (c.length > 0) targetContours.push(c);
        }
      });

      brushTargetPolyRef.current = pathsToMultiPolygon([], targetContours);
      brushTargetObjsRef.current = targetObjects;

      if (brushMode === 'paint') {
        const otherMap = new Map<string, { objs: FabricObject[]; poly: any; zIndex: number }>();
        const otherObjects = allObjects.filter((o) => {
          if (o.visible === false) return false;
          const f = (o.fill as string) || (o as any)._originalFill;
          const norm = normalizeHexColor(f);
          return norm !== 'transparent' && !areColorsMatching(norm, targetColor);
        });

        const otherByColor = new Map<string, FabricObject[]>();
        otherObjects.forEach((o) => {
          const c = normalizeHexColor((o.fill as string) || (o as any)._originalFill);
          if (!otherByColor.has(c)) otherByColor.set(c, []);
          otherByColor.get(c)!.push(o);
        });

        for (const [col, colObjs] of otherByColor.entries()) {
          const contours: { x: number; y: number }[][][] = [];
          let colZ = allCanvasObjs.length;
          colObjs.forEach((o) => {
            const idx = allCanvasObjs.indexOf(o);
            if (idx !== -1 && idx < colZ) colZ = idx;
            const cmds = extractCommandsFromObject(o);
            if (cmds.length > 0) {
              const c = commandsToContours(cmds);
              if (c.length > 0) contours.push(c);
            }
          });
          const poly = pathsToMultiPolygon([], contours);
          otherMap.set(col, { objs: colObjs, poly, zIndex: colZ });
        }
        brushOtherLayersRef.current = otherMap;
      } else {
        brushOtherLayersRef.current = new Map();
      }

      // Apply initial single-click dot immediately!
      const dotPoly = strokeToMultiPolygon([{ x: pointer.x, y: pointer.y }], brushSize);
      if (dotPoly && dotPoly.length > 0) {
        applyBrushSegment(dotPoly);
      }
    };

    const handleMouseMove = (opt: any) => {
      const me = opt.e as MouseEvent;

      if (isMiddlePanningRef.current) return;
      if (brushMode === 'fill') return;

      // Dragging horizontally while right mouse is held adjusts brush size
      if (isRightMouseResizingRef.current) {
        me.preventDefault();
        const deltaX = me.clientX - brushResizeStartXRef.current;
        const newSize = Math.max(4, Math.min(100, Math.round(brushResizeStartSizeRef.current + deltaX * 0.45)));
        setBrushSize(newSize);
        setBrushResizePos({ x: me.clientX, y: me.clientY });
        return;
      }

      if (!isBrushMouseDownRef.current) return;
      const pointer = (opt.scenePoint || canvas.getScenePoint(opt.e) || canvas.getPointer(opt.e));
      const pts = brushStrokePointsRef.current;
      if (pts.length === 0) return;

      const lastPt = pts[pts.length - 1];
      const dx = pointer.x - lastPt.x;
      const dy = pointer.y - lastPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const minSpacing = Math.max(2, brushSize * 0.2);
      if (dist >= minSpacing) {
        pts.push({ x: pointer.x, y: pointer.y });
        const segPoly = strokeToMultiPolygon([lastPt, { x: pointer.x, y: pointer.y }], brushSize);
        if (segPoly && segPoly.length > 0) {
          applyBrushSegment(segPoly);
        }
      }
    };

    const handleMouseUp = () => {
      if (brushMode === 'fill') return;

      if (isRightMouseResizingRef.current) {
        isRightMouseResizingRef.current = false;
        setIsResizingBrush(false);
        setBrushResizePos(null);
        return;
      }

      if (!isBrushMouseDownRef.current) return;
      isBrushMouseDownRef.current = false;
      brushStrokePointsRef.current = [];
      brushTargetObjsRef.current = [];
      brushOtherLayersRef.current = new Map();

      // Rebuild masterPathsRef
      const remaining = canvas.getObjects().filter((o) => (o as any).name !== 'crop-overlay' && (o as any).name !== 'brush-preview');
      masterPathsRef.current = remaining.map((obj) => {
        const b = obj.getBoundingRect();
        const fillStr = (typeof obj.fill === 'string' && obj.fill !== 'none' ? obj.fill : '#000000').trim().toUpperCase();
        return {
          obj,
          originalFill: (obj as any)._originalFill || fillStr,
          originalStroke: (obj as any)._originalStroke || (typeof obj.stroke === 'string' ? obj.stroke : null),
          originalStrokeWidth: (obj as any)._originalStrokeWidth || obj.strokeWidth || 0,
          area: b.width * b.height
        };
      });

      refreshColorLayers();
      canvas.renderAll();

      if (isWeedCheckActive) {
        runWeedCheck();
      }
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 2 && isRightMouseResizingRef.current) {
        isRightMouseResizingRef.current = false;
        setIsResizingBrush(false);
        setBrushResizePos(null);
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);

    const handleUpperContextMenu = (e: MouseEvent) => {
      if (brushModeRef.current !== 'none') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    canvas.upperCanvasEl?.addEventListener('contextmenu', handleUpperContextMenu);

    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      canvas.upperCanvasEl?.removeEventListener('contextmenu', handleUpperContextMenu);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      if (brushPreviewObjRef.current) {
        canvas.remove(brushPreviewObjRef.current);
        brushPreviewObjRef.current = null;
      }
    };
  }, [brushMode, brushSize, activeBrushColor, selectedColor, colorLayers, pushUndoSnapshot, refreshColorLayers, isWeedCheckActive, runWeedCheck]);

  const applyCrop = useCallback(async (action: 'crop' | 'erase' = 'crop') => {
    const canvas = fabricCanvasRef.current;
    const cropObj = cropOverlayObjRef.current;
    if (!canvas || !cropObj) return;

    // VECTOR MODE CROPPING: Intersects vector paths with crop boundaries
    if (mode === 'vector') {
      pushUndoSnapshot();

      const objects = canvas.getObjects().filter((o) => o !== cropObj && (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview' && o.visible !== false);
      const cropBounds = cropObj.getBoundingRect();

      let cropRing: [number, number][] = [];
      if (activeCropType === 'rect') {
        cropRing = [
          [cropBounds.left, cropBounds.top],
          [cropBounds.left + cropBounds.width, cropBounds.top],
          [cropBounds.left + cropBounds.width, cropBounds.top + cropBounds.height],
          [cropBounds.left, cropBounds.top + cropBounds.height],
          [cropBounds.left, cropBounds.top]
        ];
      } else if (activeCropType === 'circle') {
        const circleObj = cropObj as Circle;
        const radius = (circleObj.radius || 50) * (circleObj.scaleX || 1);
        const cx = cropBounds.left + cropBounds.width / 2;
        const cy = cropBounds.top + cropBounds.height / 2;
        cropRing = createCirclePolygon({ x: cx, y: cy }, radius, 64);
      } else if (activeCropType.startsWith('lasso')) {
        const points = lassoPointsRef.current;
        if (points && points.length >= 3) {
          cropRing = points.map((p) => [Number(p.x.toFixed(2)), Number(p.y.toFixed(2))]);
          if (
            cropRing[0][0] !== cropRing[cropRing.length - 1][0] ||
            cropRing[0][1] !== cropRing[cropRing.length - 1][1]
          ) {
            cropRing.push([cropRing[0][0], cropRing[0][1]]);
          }
        }
      }

      if (cropRing.length < 4) {
        cropRing = [
          [cropBounds.left, cropBounds.top],
          [cropBounds.left + cropBounds.width, cropBounds.top],
          [cropBounds.left + cropBounds.width, cropBounds.top + cropBounds.height],
          [cropBounds.left, cropBounds.top + cropBounds.height],
          [cropBounds.left, cropBounds.top]
        ];
      }

      const cropMultiPoly: number[][][][] = [[[...cropRing]]];

      const isInside = (pt: { x: number; y: number }) => {
        if (activeCropType === 'rect') {
          return (
            pt.x >= cropBounds.left &&
            pt.x <= cropBounds.left + cropBounds.width &&
            pt.y >= cropBounds.top &&
            pt.y <= cropBounds.top + cropBounds.height
          );
        }
        if (activeCropType === 'circle') {
          const circleObj = cropObj as Circle;
          const r = (circleObj.radius || 50) * (circleObj.scaleX || 1);
          const cx = cropBounds.left + cropBounds.width / 2;
          const cy = cropBounds.top + cropBounds.height / 2;
          const distSq = (pt.x - cx) ** 2 + (pt.y - cy) ** 2;
          return distSq <= r * r;
        }
        if (activeCropType.startsWith('lasso')) {
          return pointInPolygon(pt, lassoPointsRef.current);
        }
        return true;
      };

      for (const obj of objects) {
        const origFill = normalizeHexColor((obj as any)._originalFill || obj.fill);
        const origStroke = (obj as any)._originalStroke !== undefined ? (obj as any)._originalStroke : obj.stroke;
        const origStrokeWidth = (obj as any)._originalStrokeWidth !== undefined ? (obj as any)._originalStrokeWidth : obj.strokeWidth;

        let processed = false;
        try {
          const cmds = extractCommandsFromObject(obj);
          if (cmds.length > 0) {
            const contours = commandsToContours(cmds);
            if (contours.length > 0) {
              const objPoly = pathsToMultiPolygon([], [contours]);
              if (objPoly && objPoly.length > 0) {
                let resMultiPoly: number[][][][];
                if (action === 'erase') {
                  resMultiPoly = (polygonClipping as any).difference(objPoly, cropMultiPoly);
                } else {
                  resMultiPoly = (polygonClipping as any).intersection(objPoly, cropMultiPoly);
                }

                canvas.remove(obj);
                processed = true;

                if (resMultiPoly && resMultiPoly.length > 0) {
                  const newD = multiPolygonToSvgD(resMultiPoly);
                  if (newD && newD.trim().length > 0) {
                    const newPath = createAbsoluteWorldPath(newD, {
                      fill: origFill,
                      stroke: origStroke,
                      strokeWidth: origStrokeWidth,
                      selectable: true,
                      hasControls: true,
                      hoverCursor: 'pointer'
                    });
                    (newPath as any)._originalFill = origFill;
                    (newPath as any)._originalStroke = origStroke;
                    (newPath as any)._originalStrokeWidth = origStrokeWidth;
                    canvas.add(newPath);
                  }
                }
              }
            }
          }
        } catch (clipErr) {
          console.warn('[VectorCrop] Polygon clipping error, falling back:', clipErr);
        }

        if (!processed) {
          const center = obj.getCenterPoint();
          const inside = isInside(center);
          if (action === 'erase') {
            if (inside) canvas.remove(obj);
          } else {
            if (!inside) canvas.remove(obj);
          }
        }
      }

      cancelCrop();

      // Re-center remaining vector objects if action === 'crop' and objects remain
      const remaining = canvas.getObjects().filter((o) => o.visible && (o as any).name !== 'crop-overlay' && (o as any).name !== 'lasso-preview');
      if (action === 'crop' && remaining.length > 0) {
        let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
        remaining.forEach((o) => {
          const b = o.getBoundingRect();
          rMinX = Math.min(rMinX, b.left);
          rMinY = Math.min(rMinY, b.top);
          rMaxX = Math.max(rMaxX, b.left + b.width);
          rMaxY = Math.max(rMaxY, b.top + b.height);
        });
        const rW = rMaxX - rMinX;
        const rH = rMaxY - rMinY;
        const targetCenterX = canvas.width / 2;
        const targetCenterY = canvas.height / 2;
        const deltaX = targetCenterX - (rMinX + rW / 2);
        const deltaY = targetCenterY - (rMinY + rH / 2);
        remaining.forEach((o) => {
          o.set({
            left: (o.left || 0) + deltaX,
            top: (o.top || 0) + deltaY
          });
          o.setCoords();
        });
      }

      // Rebuild masterPathsRef
      masterPathsRef.current = remaining.map((obj) => {
        const b = obj.getBoundingRect();
        const fillStr = normalizeHexColor((obj as any)._originalFill || obj.fill);
        return {
          obj,
          originalFill: fillStr,
          originalStroke: (obj as any)._originalStroke || (typeof obj.stroke === 'string' ? obj.stroke : null),
          originalStrokeWidth: (obj as any)._originalStrokeWidth || obj.strokeWidth || 0,
          area: b.width * b.height
        };
      });

      refreshColorLayers();
      canvas.renderAll();
      if (isWeedCheckActive) {
        runWeedCheck();
      }

      // Automatically frame remaining cropped artwork with dashed bounding box & live dimensions
      selectAllVectors();
      return;
    }

    // RASTER MODE CROPPING
    const baseImg = canvas.getObjects().find((o) => o !== cropObj);
    if (!baseImg) return;

    pushUndoSnapshot();

    cropObj.set('visible', false);
    canvas.renderAll();

    const fullCanvasData = canvas.toDataURL({ format: 'png', multiplier: 1 } as any);
    cropObj.set('visible', true);

    const offscreenImg = new Image();
    offscreenImg.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      offscreenImg.onload = () => resolve();
      offscreenImg.onerror = reject;
      offscreenImg.src = fullCanvasData;
    });

    const cropBounds = cropObj.getBoundingRect();

    if (activeCropType === 'rect') {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = Math.max(cropBounds.width, 10);
      outCanvas.height = Math.max(cropBounds.height, 10);
      const ctx = outCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          offscreenImg,
          cropBounds.left,
          cropBounds.top,
          cropBounds.width,
          cropBounds.height,
          0,
          0,
          cropBounds.width,
          cropBounds.height
        );
        const resultUrl = outCanvas.toDataURL('image/png');
        cancelCrop();
        await renderRasterInternal(resultUrl);
      }
    } else if (activeCropType === 'circle') {
      const circleObj = cropObj as Circle;
      const radius = (circleObj.radius || 50) * (circleObj.scaleX || 1);
      const outCanvas = document.createElement('canvas');
      outCanvas.width = Math.max(radius * 2, 10);
      outCanvas.height = Math.max(radius * 2, 10);
      const ctx = outCanvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.arc(radius, radius, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          offscreenImg,
          cropBounds.left,
          cropBounds.top,
          cropBounds.width,
          cropBounds.height,
          0,
          0,
          radius * 2,
          radius * 2
        );
        const resultUrl = outCanvas.toDataURL('image/png');
        cancelCrop();
        await renderRasterInternal(resultUrl);
      }
    } else if (activeCropType === 'lasso-freehand' || activeCropType === 'lasso-polygon') {
      const points = lassoPointsRef.current;
      if (points.length < 3) return;

      const outCanvas = document.createElement('canvas');
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      if (action === 'crop') {
        outCanvas.width = Math.max(cropBounds.width, 10);
        outCanvas.height = Math.max(cropBounds.height, 10);
        ctx.beginPath();
        ctx.moveTo(points[0].x - cropBounds.left, points[0].y - cropBounds.top);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x - cropBounds.left, points[i].y - cropBounds.top);
        }
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(
          offscreenImg,
          cropBounds.left,
          cropBounds.top,
          cropBounds.width,
          cropBounds.height,
          0,
          0,
          cropBounds.width,
          cropBounds.height
        );
      } else {
        outCanvas.width = offscreenImg.width;
        outCanvas.height = offscreenImg.height;
        ctx.drawImage(offscreenImg, 0, 0);

        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fill();
      }

      const resultUrl = outCanvas.toDataURL('image/png');
      cancelCrop();
      await renderRasterInternal(resultUrl);
    }
  }, [activeCropType, cancelCrop, renderRasterInternal, pushUndoSnapshot, selectAllVectors, refreshColorLayers, isWeedCheckActive, runWeedCheck]);

  const zoomIn = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const newZoom = Math.min(canvas.getZoom() * 1.25, 5);
    canvas.zoomToPoint(new Point(canvas.width / 2, canvas.height / 2), newZoom);
    setZoomLevel(Math.round(newZoom * 100) / 100);
  }, []);

  const zoomOut = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const newZoom = Math.max(canvas.getZoom() * 0.8, 0.2);
    canvas.zoomToPoint(new Point(canvas.width / 2, canvas.height / 2), newZoom);
    setZoomLevel(Math.round(newZoom * 100) / 100);
  }, []);

  const resetZoom = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const extent = getArtworkExtentRect();
    const centerX = extent ? extent.centerX : canvas.width / 2;
    const centerY = extent ? extent.centerY : canvas.height / 2;
    const vptX = canvas.width / 2 - centerX;
    const vptY = canvas.height / 2 - centerY;
    canvas.setViewportTransform([1, 0, 0, 1, vptX, vptY]);
    setZoomLevel(1);
    canvas.renderAll();
    updateViewportTransformRef.current();
  }, [getArtworkExtentRect]);

  return {
    canvasRef,
    containerRef,
    fabricCanvasRef,
    mode,
    setMode,
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    recenterArtwork: recenterOnArtwork,
    hasImage,
    hasVector,
    loadRasterImage,
    loadVectorSvg,
    swapColor,
    toggleLayerVisibility,
    toggleHideShowAll,
    showAllVectors,
    hideAllVectors,
    toggleHideShowSelection,
    deleteColorLayer,
    selectedObject,
    selectedColor,
    changeSelectedObjectColor,
    deleteSelectedObject,
    isLineArt,
    lineArtPenWidth,
    lineArtColorMode,
    toggleLineArt,
    setLineArtPenWidth: changeLineArtPenWidth,
    setLineArtColorMode: changeLineArtColorMode,
    // Export Utilities
    exportSvg,
    exportPng,
    exportPdf,
    getRasterDataUrl,
    // Undo / Redo & Reset
    undo,
    redo,
    canUndo,
    canRedo,
    pushUndoSnapshot,
    resetArtwork,
    switchToRasterMode,
    switchToVectorMode,
    hasOriginalRaster: !!originalRasterRef.current,
    hasOriginalVector: !!originalVectorRef.current,
    compareData,
    getCompareData,
    // Cropping Suite API
    activeCropType,
    lassoPointsCount,
    startRectCrop,
    startCircleCrop,
    startLassoCrop,
    applyCrop,
    cancelCrop,
    // On-the-Fly Detail & Color Simplification
    maxColorCount,
    activeColorCount,
    activeDetailPercent,
    simplifyColorsLive,
    simplifyDetailsLive,
    // Right-Click Context Menu & Z-Ordering
    contextMenuState,
    setContextMenuState,
    openContextMenuForMat,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    duplicateSelectedObject,
    // Master Selection & Proportional Transform Box
    selectionBounds,
    selectAllVectors,
    selectInverseVectors,
    // Dynamic Color Mats & Selection
    colorLayers,
    refreshColorLayers,
    selectObjectsByColor,
    selectObjectsBySimilarColor,
    selectedLayerColors,
    setSelectedLayerColors,
    clearSelection,
    combineMats,
    combineSelectedObjects,
    reorderColorLayers,
    flattenArtwork,
    isFlattening,
    activeFlattenMode,
    // Display Preferences & Units
    units,
    setUnits,
    toggleUnits,
    matBackground,
    setMatBackground,
    showRulers,
    setShowRulers,
    cursorPos,
    // Vinyl Cutting Readiness & Weed Check Engine
    vinylSettings,
    setVinylSettings: setVinylSettingsState,
    isWeedCheckActive,
    toggleWeedCheck,
    weedCheckReport,
    runWeedCheck,
    remediateCanvasVectors,
    isRemediating,
    canvasViewportInfo,
    // Vector Brush & Eraser Engine
    brushMode,
    setBrushMode,
    brushSize,
    setBrushSize,
    activeBrushColor,
    setActiveBrushColor,
    isResizingBrush,
    brushResizePos,
    // Vector Outline Smoothing Engine
    outlineSmoothing,
    setOutlineSmoothing: smoothOutlinesLive
  };
}
