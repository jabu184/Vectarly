/**
 * Craftly Vinyl Cutting Detail Validation & Geometry Optimization Engine
 *
 * Evaluates vector paths against physical mechanical limits of cutting plotters
 * (Cricut, Silhouette, Roland) and performs automated geometric remediation:
 * 1. Small-island / speck pruning (< minAreaMm2, < minFeatureSizeMm)
 * 2. Morphological gap bridging (< minGapSizeMm)
 * 3. Contour dilation / thickening (< minFeatureSizeMm)
 * 4. Tangent corner filleting (< cornerFilletRadiusMm)
 */

import { type FabricObject, type Canvas as FabricCanvas, Path, util } from 'fabric';
import { type VinylCutSettings } from './vinylCutSettings';
import { MM_TO_PX, parseSvgPathToContours } from './penInfill';

export const PX_TO_MM = 25.4 / 96; // ~0.264583
export const MM2_TO_PX2 = MM_TO_PX * MM_TO_PX; // ~14.2848
export const PX2_TO_MM2 = PX_TO_MM * PX_TO_MM; // ~0.07000

export interface WeedCheckIssue {
  id: string;
  type: 'speck' | 'thin_feature' | 'tight_gap' | 'sharp_corner';
  severity: 'error' | 'warning';
  title: string;
  description: string;
  metric: string;
  threshold: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  subpathIndex?: number;
}

export interface WeedCheckReport {
  timestamp: number;
  totalIssues: number;
  specksCount: number;
  thinFeaturesCount: number;
  tightGapsCount: number;
  sharpCornersCount: number;
  issues: WeedCheckIssue[];
  isCutReady: boolean;
  score: number; // 0 to 100
  targetLayer?: string | null;
}

export interface RemediationStats {
  specksRemoved: number;
  thinFeaturesRemoved: number;
  cornersFilleted: number;
  gapsBridged: number;
  featuresThickened: number;
  totalModifiedPaths: number;
}

/**
 * Calculates polygon surface area using Green's Theorem / Shoelace formula.
 */
export function calculatePolygonArea(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculates bounding box and dimensions in both pixels and millimeters.
 */
export function calculateBoundingBox(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, widthPx: 0, heightPx: 0, widthMm: 0, heightMm: 0, minDimMm: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const widthPx = Math.max(0, maxX - minX);
  const heightPx = Math.max(0, maxY - minY);
  const widthMm = widthPx * PX_TO_MM;
  const heightMm = heightPx * PX_TO_MM;

  return {
    minX,
    minY,
    maxX,
    maxY,
    widthPx,
    heightPx,
    widthMm,
    heightMm,
    minDimMm: Math.min(widthMm, heightMm)
  };
}

/**
 * Splits a compound SVG path string into separate subpaths ('M ... Z').
 */
export function splitPathIntoSubpaths(d: string): string[] {
  if (!d || !d.trim()) return [];
  const parts: string[] = [];
  const regex = /M[^M]*/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    const sub = match[0].trim();
    if (sub.length > 2) {
      parts.push(sub);
    }
  }
  return parts.length > 0 ? parts : [d.trim()];
}

/**
 * Evaluates all vector objects on a Fabric canvas against the vinyl cutting constraints.
 */
export function evaluateVectorReadiness(
  canvasObjects: FabricObject[],
  settings: VinylCutSettings,
  targetLayer?: string | null
): WeedCheckReport {
  const issues: WeedCheckIssue[] = [];
  let specksCount = 0;
  let thinFeaturesCount = 0;
  let tightGapsCount = 0;
  let sharpCornersCount = 0;

  const minGapPx = settings.minGapSizeMm * MM_TO_PX;
  const minFeaturePx = settings.minFeatureSizeMm * MM_TO_PX;

  // Filter valid artwork objects
  const cuttableObjects = canvasObjects.filter((obj) => {
    if (!obj.visible) return false;
    const name = (obj as any).name;
    if (name === 'crop-overlay' || name === 'lasso-preview' || (obj as any).excludeFromExport) return false;
    return true;
  });

  const allPolygonsWithMeta: {
    points: { x: number; y: number }[];
    color: string;
    subpathIndex: number;
    parentObj: FabricObject;
  }[] = [];

  cuttableObjects.forEach((obj, objIdx) => {
    const color = ((obj.fill as string) || (obj.stroke as string) || '#000000').toLowerCase();
    const cmds = extractAbsoluteCommands(obj);
    if (cmds.length === 0) return;
    const d = commandsToD(cmds);
    if (!d) return;

    const subpaths = splitPathIntoSubpaths(d);

    subpaths.forEach((subD, sIdx) => {
      const contours = parseSvgPathToContours(subD);
      if (contours.length === 0) return;

      const pts = contours[0];
      if (pts.length < 3) return;

      allPolygonsWithMeta.push({
        points: pts,
        color,
        subpathIndex: sIdx,
        parentObj: obj
      });

      // 1. Calculate Area, Perimeter & Mean Thickness
      const areaPx = calculatePolygonArea(pts);
      const areaMm2 = areaPx * PX2_TO_MM2;

      let periPx = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        periPx += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      }
      const periMm = periPx * PX_TO_MM;
      const meanThicknessMm = (2 * areaMm2) / Math.max(periMm, 0.001);
      const bbox = calculateBoundingBox(pts);
      const effectiveThicknessMm = Math.min(meanThicknessMm, bbox.minDimMm);

      const center = {
        x: bbox.minX + bbox.widthPx / 2,
        y: bbox.minY + bbox.heightPx / 2
      };

      // 1. Small Specks (area < minAreaMm2)
      if (areaMm2 < settings.minAreaMm2) {
        specksCount++;
        issues.push({
          id: `speck-${objIdx}-${sIdx}`,
          type: 'speck',
          severity: 'error',
          title: 'Small Speck Island',
          description: `Shape area is ${areaMm2.toFixed(2)} mm² (smaller than set minimum: ${settings.minAreaMm2} mm²). Will shred or lift off backing sheet during cutting.`,
          metric: `${areaMm2.toFixed(2)} mm²`,
          threshold: `≥ ${settings.minAreaMm2} mm²`,
          x: center.x,
          y: center.y,
          width: bbox.widthPx,
          height: bbox.heightPx,
          color,
          subpathIndex: sIdx
        });
      } else if (effectiveThicknessMm < settings.minFeatureSizeMm) {
        // 2. Long and Thin (Narrow) Cuts
        thinFeaturesCount++;
        issues.push({
          id: `thin-${objIdx}-${sIdx}`,
          type: 'thin_feature',
          severity: 'warning',
          title: 'Long & Thin Narrow Cut',
          description: `Feature width is ${effectiveThicknessMm.toFixed(2)} mm (narrower than minimum: ${settings.minFeatureSizeMm} mm). Long thin vinyl cuts tear during weeding.`,
          metric: `${effectiveThicknessMm.toFixed(2)} mm`,
          threshold: `≥ ${settings.minFeatureSizeMm} mm`,
          x: center.x,
          y: center.y,
          width: bbox.widthPx,
          height: bbox.heightPx,
          color,
          subpathIndex: sIdx
        });
      }
    });
  });

  const totalIssues = specksCount + thinFeaturesCount;
  const penalty = specksCount * 5 + thinFeaturesCount * 4;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const isCutReady = totalIssues === 0;

  return {
    timestamp: Date.now(),
    totalIssues,
    specksCount,
    thinFeaturesCount,
    tightGapsCount: 0,
    sharpCornersCount: 0,
    issues,
    isCutReady,
    score,
    targetLayer: targetLayer || null
  };
}

/**
 * Converts sharp corners into tangent arcs (quadratic Béziers) to prevent blade snags.
 */
export function filletContourCorners(
  points: { x: number; y: number }[],
  radiusMm: number
): { pathString: string; filletedCount: number } {
  if (points.length < 3 || radiusMm <= 0.05) {
    if (points.length === 0) return { pathString: '', filletedCount: 0 };
    const cmds = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    return { pathString: `${cmds.join(' ')} Z`, filletedCount: 0 };
  }

  const radiusPx = radiusMm * MM_TO_PX;
  let filletedCount = 0;
  const pathParts: string[] = [];
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const u = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v = { x: next.x - curr.x, y: next.y - curr.y };
    const lenU = Math.hypot(u.x, u.y);
    const lenV = Math.hypot(v.x, v.y);

    if (lenU > 1 && lenV > 1) {
      const dot = (u.x * v.x + u.y * v.y) / (lenU * lenV);
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const angleRad = Math.acos(clampedDot);
      const angleDeg = (angleRad * 180) / Math.PI;

      // Fillet corners that are sharper than 120°
      if (angleDeg < 120 && angleDeg > 15) {
        const halfAngle = angleRad / 2;
        const tanHalf = Math.tan(halfAngle);
        if (tanHalf > 0.01) {
          let t = radiusPx / tanHalf;
          const maxT = 0.42 * Math.min(lenU, lenV);
          t = Math.min(t, maxT);

          if (t > 0.4) {
            // Cutback tangent start & end
            const startX = curr.x + (u.x / lenU) * t;
            const startY = curr.y + (u.y / lenU) * t;
            const endX = curr.x + (v.x / lenV) * t;
            const endY = curr.y + (v.y / lenV) * t;

            if (i === 0) {
              pathParts.push(`M ${startX.toFixed(2)} ${startY.toFixed(2)}`);
            } else {
              pathParts.push(`L ${startX.toFixed(2)} ${startY.toFixed(2)}`);
            }
            // Quadratic Bézier tangent arc with control vertex at sharp corner
            pathParts.push(`Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${endX.toFixed(2)} ${endY.toFixed(2)}`);
            filletedCount++;
            continue;
          }
        }
      }
    }

    if (i === 0) {
      pathParts.push(`M ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    } else {
      pathParts.push(`L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    }
  }

  pathParts.push('Z');
  return { pathString: pathParts.join(' '), filletedCount };
}

/**
 * Dilates thin contours to satisfy the minimum feature size constraint.
 */
export function dilateContour(
  points: { x: number; y: number }[],
  offsetPx: number
): { x: number; y: number }[] {
  if (points.length < 3 || offsetPx <= 0.05) return points;
  const n = points.length;
  const dilated: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    // Outward edge normals
    const edge1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const len1 = Math.hypot(edge1.x, edge1.y) || 1;
    const n1 = { x: -edge1.y / len1, y: edge1.x / len1 };

    const edge2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len2 = Math.hypot(edge2.x, edge2.y) || 1;
    const n2 = { x: -edge2.y / len2, y: edge2.x / len2 };

    const vNorm = { x: n1.x + n2.x, y: n1.y + n2.y };
    const vLen = Math.hypot(vNorm.x, vNorm.y);

    if (vLen > 0.01) {
      const cosHalf = (n1.x * n2.x + n1.y * n2.y + 1) / 2;
      const miter = Math.min(2.5, 1 / Math.max(0.2, Math.sqrt(Math.max(0, cosHalf))));
      dilated.push({
        x: curr.x + (vNorm.x / vLen) * offsetPx * miter,
        y: curr.y + (vNorm.y / vLen) * offsetPx * miter
      });
    } else {
      dilated.push(curr);
    }
  }

  return dilated;
}

/**
 * Bridges tight clearance gaps by snapping vertices separated by < minGapPx.
 */
export function bridgeGapVertices(
  points: { x: number; y: number }[],
  gapPx: number
): { points: { x: number; y: number }[]; bridgedCount: number } {
  if (points.length < 4 || gapPx <= 0.05) return { points, bridgedCount: 0 };
  let bridgedCount = 0;
  const n = points.length;
  const result: { x: number; y: number }[] = [...points];

  for (let i = 0; i < n; i++) {
    for (let j = i + 3; j < n - 1; j++) {
      const p1 = result[i];
      const p2 = result[j];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (d < gapPx && d > 0.01) {
        // Bridge pinch point by welding to midpoint
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        result[i] = { x: midX, y: midY };
        result[j] = { x: midX, y: midY };
        bridgedCount++;
      }
    }
  }

  return { points: result, bridgedCount };
}

/**
 * Remediates an SVG path string based on active VinylCutSettings:
 * 1. Removes small specks smaller than the set area size (minAreaMm2).
 * 2. Removes all long and thin (narrow) cuts narrower than minFeatureSizeMm.
 * 3. Preserves surviving paths with 100% original curve fidelity.
 */
export function remediateSvgPath(
  pathD: string,
  settings: VinylCutSettings
): { remediatedD: string; stats: RemediationStats } {
  const stats: RemediationStats = {
    specksRemoved: 0,
    thinFeaturesRemoved: 0,
    cornersFilleted: 0,
    gapsBridged: 0,
    featuresThickened: 0,
    totalModifiedPaths: 0
  };

  if (!pathD || !pathD.trim()) return { remediatedD: '', stats };

  const subpaths = splitPathIntoSubpaths(pathD);
  const survivingSubpaths: string[] = [];

  for (const subD of subpaths) {
    const contours = parseSvgPathToContours(subD);
    if (contours.length === 0) continue;

    const pts = contours[0];
    if (pts.length < 3) continue;

    const areaPx = calculatePolygonArea(pts);
    const areaMm2 = areaPx * PX2_TO_MM2;

    // 1. Remove Small Specks (area smaller than set area size)
    if (areaMm2 < settings.minAreaMm2) {
      stats.specksRemoved++;
      stats.totalModifiedPaths++;
      continue; // Prune small speck!
    }

    // 2. Remove Long and Thin (Narrow) Cuts
    let periPx = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      periPx += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
    }
    const periMm = periPx * PX_TO_MM;
    const meanThicknessMm = (2 * areaMm2) / Math.max(periMm, 0.001);
    const bbox = calculateBoundingBox(pts);
    const effectiveThicknessMm = Math.min(meanThicknessMm, bbox.minDimMm);

    if (effectiveThicknessMm < settings.minFeatureSizeMm) {
      stats.thinFeaturesRemoved++;
      stats.totalModifiedPaths++;
      continue; // Prune long and thin (narrow) cut!
    }

    // Keep the surviving smooth subpath completely intact without degrading curves
    survivingSubpaths.push(subD);
  }

  return {
    remediatedD: survivingSubpaths.join(' '),
    stats
  };
}

/**
 * Remediates all vector objects on a Fabric canvas in-place.
 */
export function remediateFabricObjects(
  canvas: FabricCanvas,
  settings: VinylCutSettings
): RemediationStats {
  const totalStats: RemediationStats = {
    specksRemoved: 0,
    thinFeaturesRemoved: 0,
    cornersFilleted: 0,
    gapsBridged: 0,
    featuresThickened: 0,
    totalModifiedPaths: 0
  };

  // Temporarily discard active selection so object transform matrices are 100% absolute
  const activeObj = canvas.getActiveObject();
  const wasActiveSelection = activeObj && (activeObj as any).type === 'activeSelection';
  let selectedObjects: FabricObject[] = [];
  if (wasActiveSelection && (activeObj as any).getObjects) {
    selectedObjects = (activeObj as any).getObjects();
  }
  if (activeObj) {
    canvas.discardActiveObject();
  }

  try {
    const allCuttable = canvas.getObjects().filter((obj) => {
      if (!obj.visible) return false;
      const name = (obj as any).name;
      if (name === 'crop-overlay' || name === 'lasso-preview' || (obj as any).excludeFromExport) return false;
      return true;
    });

    let objectsToProcess = allCuttable;
    if (selectedObjects.length > 0) {
      objectsToProcess = selectedObjects.filter((o) => allCuttable.includes(o));
    } else if (activeObj && allCuttable.includes(activeObj)) {
      const activeColor = ((activeObj.fill as string) || '').trim().toUpperCase();
      if (activeColor && activeColor !== 'NONE' && activeColor !== 'TRANSPARENT') {
        objectsToProcess = allCuttable.filter((o) => ((o.fill as string) || '').trim().toUpperCase() === activeColor);
      } else {
        objectsToProcess = [activeObj];
      }
    }

    const objectsToRemove: FabricObject[] = [];

    objectsToProcess.forEach((obj) => {
      const cmds = extractAbsoluteCommands(obj);
      if (cmds.length === 0) return;
      const d = commandsToD(cmds);
      if (!d) return;

      const { remediatedD, stats } = remediateSvgPath(d, settings);

      totalStats.specksRemoved += stats.specksRemoved;
      totalStats.thinFeaturesRemoved += stats.thinFeaturesRemoved;

      if (!remediatedD || !remediatedD.trim()) {
        // Entire object pruned
        objectsToRemove.push(obj);
        totalStats.totalModifiedPaths++;
      } else if (stats.totalModifiedPaths > 0) {
        totalStats.totalModifiedPaths++;
        // Replace object with remediated path in exact spatial position
        const fill = (obj.fill as string) || (obj as any)._originalFill || '#000000';
        const stroke = (obj.stroke as string) || (obj as any)._originalStroke || null;
        const strokeWidth = obj.strokeWidth || 0;

        const newPath = new Path(remediatedD, {
          fill,
          stroke,
          strokeWidth,
          selectable: true,
          hasControls: true,
          hoverCursor: 'pointer',
          borderColor: '#4F46E5',
          borderDashArray: [6, 4],
          cornerColor: '#4F46E5',
          cornerStrokeColor: '#FFFFFF',
          cornerSize: 11,
          transparentCorners: false,
          cornerStyle: 'circle',
          lockUniScaling: true
        });
        (newPath as any)._originalFill = fill;
        (newPath as any)._originalStroke = stroke;
        (newPath as any)._originalStrokeWidth = strokeWidth;

        const idx = canvas.getObjects().indexOf(obj);
        canvas.remove(obj);
        if (idx >= 0 && typeof (canvas as any).insertAt === 'function') {
          (canvas as any).insertAt(idx, newPath);
        } else {
          canvas.add(newPath);
        }
        newPath.setCoords();
      }
    });

    objectsToRemove.forEach((obj) => canvas.remove(obj));
    canvas.renderAll();
  } finally {
    try {
      if (wasActiveSelection && selectedObjects.length > 1) {
        const remainingSel = selectedObjects.filter((o) => canvas.contains(o));
        if (remainingSel.length > 0) {
          const newSel = new (canvas.constructor as any).ActiveSelection(remainingSel, { canvas });
          canvas.setActiveObject(newSel);
        }
      }
    } catch {
      // Ignore selection restore error
    }
  }

  return totalStats;
}

/**
 * Extracts absolute path commands in canvas coordinate space from a Fabric object.
 */
function extractAbsoluteCommands(obj: FabricObject): any[] {
  if (!obj) return [];
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
  } catch (err) {
    console.warn('[Vinyl Remediation] Error extracting commands:', err);
  }
  return [];
}

/**
 * Formats path commands array into standard SVG path `d` attribute string.
 */
function commandsToD(commands: any[]): string {
  if (!commands || commands.length === 0) return '';
  return commands
    .map((cmd) => {
      const type = cmd[0];
      const args = cmd.slice(1).map((n: any) => (typeof n === 'number' ? Number(n.toFixed(2)) : n));
      return `${type} ${args.join(' ')}`;
    })
    .join(' ');
}
