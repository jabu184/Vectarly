/**
 * Geometric Boolean Union / Contour Welding Engine
 *
 * Merges overlapping or adjacent vector shapes into a single unified silhouette
 * using 2D polygon clipping (Martínez-Rueda-Feito algorithm).
 * Dissolves internal seams, overlapping cut paths, and redundant boundaries so
 * vinyl cutters (Cricut, Silhouette) cut a single outer perimeter without slicing
 * through interior vinyl.
 */

import polygonClipping, { type Geom } from 'polygon-clipping';
import { parseSvgPathToContours } from './penInfill';

/**
 * Converts a discretized point contour into a closed polygon ring [x, y][].
 */
export function contourToClosedRing(contour: { x: number; y: number }[]): [number, number][] {
  if (contour.length === 0) return [];
  const ring: [number, number][] = contour.map((p) => [
    Number(p.x.toFixed(3)),
    Number(p.y.toFixed(3))
  ]);

  // Ensure ring is closed (first and last vertex identical)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }

  return ring;
}

/**
 * Direct conversion from Fabric transformed command array to point contours.
 * Completely eliminates string parsing overhead and formatting edge cases.
 */
export function commandsToContours(commands: any[]): { x: number; y: number }[][] {
  if (!commands || commands.length === 0) return [];
  const contours: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let startPt = { x: 0, y: 0 };
  let currPt = { x: 0, y: 0 };

  for (const cmd of commands) {
    if (!cmd || cmd.length === 0) continue;
    const type = cmd[0].toUpperCase();

    if (type === 'M') {
      if (current.length > 2) contours.push(current);
      currPt = { x: Number(cmd[1]), y: Number(cmd[2]) };
      startPt = { ...currPt };
      current = [startPt];
    } else if (type === 'L') {
      currPt = { x: Number(cmd[1]), y: Number(cmd[2]) };
      current.push(currPt);
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
        current.push({ x, y });
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
        current.push({ x, y });
      }
      currPt = p2;
    } else if (type === 'Z') {
      if (current.length > 2) {
        current.push({ ...startPt });
        contours.push(current);
      }
      current = [];
    }
  }
  if (current.length > 2) contours.push(current);
  return contours;
}

/**
 * Formats path commands array into standard SVG path `d` attribute string.
 */
export function commandsToD(commands: any[]): string {
  if (!commands || commands.length === 0) return '';
  return commands
    .map((cmd) => {
      const type = cmd[0];
      const args = cmd.slice(1).map((n: any) => (typeof n === 'number' ? Number(n.toFixed(2)) : n));
      return `${type} ${args.join(' ')}`;
    })
    .join(' ');
}

/**
 * Converts polygon-clipping MultiPolygon output into a clean SVG path `d` string.
 * Filters out microscopic degenerate slivers and collapsed seams.
 */
export function multiPolygonToSvgD(multiPoly: number[][][][]): string {
  if (!multiPoly || multiPoly.length === 0) return '';
  const parts: string[] = [];

  for (const polygon of multiPoly) {
    for (const ring of polygon) {
      if (!ring || ring.length < 3) continue;

      // Filter out microscopic clipping slivers (area < 0.5 px²)
      let ringArea = 0;
      const len = ring.length;
      for (let i = 0; i < len; i++) {
        const next = (i + 1) % len;
        ringArea += ring[i][0] * ring[next][1] - ring[next][0] * ring[i][1];
      }
      if (Math.abs(ringArea) * 0.5 < 0.5) {
        continue;
      }

      const cmds: string[] = [];
      let prevX = Infinity;
      let prevY = Infinity;

      for (let i = 0; i < len; i++) {
        const pt = ring[i];
        // Skip duplicate closing point right before 'Z'
        if (i === len - 1 && i > 0 && pt[0] === ring[0][0] && pt[1] === ring[0][1]) {
          continue;
        }
        const x = Number(pt[0].toFixed(2));
        const y = Number(pt[1].toFixed(2));
        if (cmds.length > 0 && Math.abs(x - prevX) < 0.01 && Math.abs(y - prevY) < 0.01) {
          continue;
        }
        cmds.push(`${cmds.length === 0 ? 'M' : 'L'} ${x} ${y}`);
        prevX = x;
        prevY = y;
      }
      if (cmds.length > 2) {
        cmds.push('Z');
        parts.push(cmds.join(' '));
      }
    }
  }

  return parts.join(' ');
}

/**
 * Performs a true geometric Boolean Union (Weld) across multiple SVG path strings.
 * Dissolves all internal seams and overlapping vector boundaries.
 */
export function booleanUnionPaths(pathStrings: string[]): string {
  const validDStrings = pathStrings.filter((d) => d && d.trim().length > 0);
  if (validDStrings.length === 0) return '';
  if (validDStrings.length === 1) return validDStrings[0];

  try {
    const allPolygons: Geom[] = [];

    for (const d of validDStrings) {
      const contours = parseSvgPathToContours(d);
      for (const contour of contours) {
        if (contour.length < 3) continue;
        const ring = contourToClosedRing(contour);
        if (ring.length >= 4) {
          // Polygon structure in polygon-clipping: [outerRing, ...holeRings]
          allPolygons.push([ring]);
        }
      }
    }

    if (allPolygons.length === 0) {
      return validDStrings.join(' ');
    }

    if (allPolygons.length === 1) {
      return validDStrings[0];
    }

    // Execute 2D Boolean Union across all input polygons
    const unitedMultiPoly = (polygonClipping as any).union(
      allPolygons[0],
      ...allPolygons.slice(1)
    );

    const unitedD = multiPolygonToSvgD(unitedMultiPoly);
    if (unitedD && unitedD.trim().length > 0) {
      return unitedD;
    }
  } catch (err) {
    console.warn('[BooleanUnion] Geometric union failed, falling back to compound path:', err);
  }

  // Fallback: concatenate subpaths
  return validDStrings.join(' ');
}

/**
 * Converts a set of SVG path strings into a 2D MultiPolygon geometry.
 * Correctly accounts for SVG fill-rule: evenodd holes within each path via XOR,
 * and unions shapes of the same color.
 */
export function pathsToMultiPolygon(
  pathStrings: string[],
  contoursList?: { x: number; y: number }[][][]
): number[][][][] {
  let accumulatedMultiPoly: number[][][][] = [];

  // 1. Process contoursList directly if available
  if (contoursList && contoursList.length > 0) {
    for (const contours of contoursList) {
      if (!contours || contours.length === 0) continue;
      let pathGeom: number[][][][] = [];
      for (const contour of contours) {
        if (contour.length < 3) continue;
        const ring = contourToClosedRing(contour);
        if (ring.length >= 4) {
          const poly: number[][][] = [ring];
          if (pathGeom.length === 0) {
            pathGeom = [poly];
          } else {
            try {
              pathGeom = (polygonClipping as any).xor(pathGeom, [poly]);
            } catch {
              pathGeom.push(poly);
            }
          }
        }
      }
      if (pathGeom.length > 0) {
        if (accumulatedMultiPoly.length === 0) {
          accumulatedMultiPoly = pathGeom;
        } else {
          try {
            accumulatedMultiPoly = (polygonClipping as any).union(accumulatedMultiPoly, pathGeom);
          } catch {
            accumulatedMultiPoly.push(...pathGeom);
          }
        }
      }
    }
    return accumulatedMultiPoly;
  }

  // 2. Otherwise parse pathStrings
  const validDStrings = pathStrings.filter((d) => d && d.trim().length > 0);
  if (validDStrings.length === 0) return [];

  for (const d of validDStrings) {
    try {
      const contours = parseSvgPathToContours(d);
      if (contours.length === 0) continue;

      let pathGeom: number[][][][] = [];
      for (const contour of contours) {
        if (contour.length < 3) continue;
        const ring = contourToClosedRing(contour);
        if (ring.length >= 4) {
          const poly: number[][][] = [ring];
          if (pathGeom.length === 0) {
            pathGeom = [poly];
          } else {
            try {
              pathGeom = (polygonClipping as any).xor(pathGeom, [poly]);
            } catch {
              pathGeom.push(poly);
            }
          }
        }
      }

      if (pathGeom.length > 0) {
        if (accumulatedMultiPoly.length === 0) {
          accumulatedMultiPoly = pathGeom;
        } else {
          try {
            accumulatedMultiPoly = (polygonClipping as any).union(accumulatedMultiPoly, pathGeom);
          } catch {
            accumulatedMultiPoly.push(...pathGeom);
          }
        }
      }
    } catch (err) {
      console.warn('[BooleanUnion] Failed to convert path to polygon:', err);
    }
  }

  return accumulatedMultiPoly;
}

export interface FlattenColorGroup {
  color: string;
  pathStrings: string[];
  contoursList?: { x: number; y: number }[][][];
}

export interface FlattenResultLayer {
  color: string;
  d: string;
}

export type FlattenMode = 'knockout' | 'stacked';

/**
 * Ensures that where any upper layer overlays a lower layer,
 * the lower layer is solid in that area (fills cutouts and interior holes
 * covered by upper layers, creating solid background bases).
 */
export function makeLayerSolidUnderOverlays(
  layerMultiPoly: number[][][][],
  upperMultiPoly: number[][][][]
): number[][][][] {
  if (!upperMultiPoly || upperMultiPoly.length === 0) return layerMultiPoly;
  if (!layerMultiPoly || layerMultiPoly.length === 0) return layerMultiPoly;

  let currentLayer = layerMultiPoly;

  // 1. For each polygon in currentLayer, fill interior cutouts / holes covered by upper layers
  for (const poly of currentLayer) {
    if (!poly || poly.length === 0 || !poly[0] || poly[0].length < 3) continue;
    const extRing = poly[0];
    const envelope: number[][][][] = [[extRing]];

    try {
      const overlay = (polygonClipping as any).intersection(upperMultiPoly, envelope);
      if (overlay && overlay.length > 0) {
        currentLayer = (polygonClipping as any).union(currentLayer, overlay);
      }
    } catch {
      // Continue
    }
  }

  // 2. Also incorporate upper layer polygons that overlay or touch this layer (solid stacked / overprint)
  for (const upperPoly of upperMultiPoly) {
    if (!upperPoly || upperPoly.length === 0 || !upperPoly[0] || upperPoly[0].length < 3) continue;
    const uMulti: number[][][][] = [upperPoly];
    try {
      const testUnion = (polygonClipping as any).union(currentLayer, uMulti);
      // If the union merges (number of polygons doesn't increase by 1), it touches/stacks!
      if (testUnion && testUnion.length <= currentLayer.length) {
        currentLayer = testUnion;
      }
    } catch {
      // Continue
    }
  }

  return currentLayer;
}

/**
 * Combines all vectors of the same color into a single united path.
 *
 * In 'knockout' mode:
 * Ensures color mats do not overlap each other (each subsequent layer only
 * colors in areas that no previous layer colors). Produces seamless, non-overlapping
 * jigsaw/inlay decal cut geometry for vinyl plotters (ideal for HTV).
 *
 * In 'stacked' mode:
 * Layers are ordered from TOP to BOTTOM. Where any upper layer overlays a lower layer,
 * the lower layer is made SOLID in that area (fills cutouts and interior holes),
 * creating solid background bases for multi-layer vinyl assembly.
 */
export function flattenColorLayers(
  colorGroups: FlattenColorGroup[],
  mode: FlattenMode = 'knockout'
): FlattenResultLayer[] {
  if (colorGroups.length === 0) return [];

  const results: FlattenResultLayer[] = [];

  if (mode === 'knockout') {
    let accumulatedMask: number[][][][] = [];

    for (const group of colorGroups) {
      const rawMultiPoly = pathsToMultiPolygon(group.pathStrings, group.contoursList);
      if (!rawMultiPoly || rawMultiPoly.length === 0) {
        // Fallback: simple boolean union
        const fallbackD = booleanUnionPaths(group.pathStrings);
        if (fallbackD && fallbackD.trim()) {
          results.push({ color: group.color, d: fallbackD });
        }
        continue;
      }

      let finalMultiPoly = rawMultiPoly;

      // Cut out all areas covered by previous layers so mats never overlap
      if (accumulatedMask.length > 0) {
        try {
          finalMultiPoly = (polygonClipping as any).difference(rawMultiPoly, accumulatedMask);
        } catch (err) {
          console.warn(`[BooleanUnion] Difference failed for color ${group.color}:`, err);
          finalMultiPoly = rawMultiPoly;
        }
      }

      // Accumulate this layer's original footprint into the mask
      if (accumulatedMask.length === 0) {
        accumulatedMask = rawMultiPoly;
      } else {
        try {
          accumulatedMask = (polygonClipping as any).union(accumulatedMask, rawMultiPoly);
        } catch (err) {
          console.warn(`[BooleanUnion] Mask union failed for color ${group.color}:`, err);
        }
      }

      const d = multiPolygonToSvgD(finalMultiPoly);
      if (d && d.trim().length > 0) {
        results.push({ color: group.color, d });
      }
    }
  } else {
    // STACKED MODE:
    // Layers are ordered from TOP (foreground) to BOTTOM (background).
    // Where any upper layer overlays a layer below it, the lower layer is SOLID in that area!
    let accumulatedUpper: number[][][][] = [];

    for (let i = 0; i < colorGroups.length; i++) {
      const group = colorGroups[i];
      const rawMultiPoly = pathsToMultiPolygon(group.pathStrings, group.contoursList);
      if (!rawMultiPoly || rawMultiPoly.length === 0) {
        const fallbackD = booleanUnionPaths(group.pathStrings);
        if (fallbackD && fallbackD.trim()) {
          results.push({ color: group.color, d: fallbackD });
        }
        continue;
      }

      let finalMultiPoly = rawMultiPoly;

      // Make this layer solid under all upper layers that overlay it
      if (accumulatedUpper.length > 0) {
        finalMultiPoly = makeLayerSolidUnderOverlays(rawMultiPoly, accumulatedUpper);
      }

      // Add this layer's footprint into accumulatedUpper for subsequent layers below it
      if (accumulatedUpper.length === 0) {
        accumulatedUpper = finalMultiPoly;
      } else {
        try {
          accumulatedUpper = (polygonClipping as any).union(accumulatedUpper, finalMultiPoly);
        } catch {
          accumulatedUpper.push(...finalMultiPoly);
        }
      }

      const d = multiPolygonToSvgD(finalMultiPoly);
      if (d && d.trim().length > 0) {
        results.push({ color: group.color, d });
      }
    }
  }

  return results;
}

/**
 * Backwards compatibility wrapper for knockout flattening.
 */
export function flattenColorLayersNonOverlapping(
  colorGroups: FlattenColorGroup[]
): FlattenResultLayer[] {
  return flattenColorLayers(colorGroups, 'knockout');
}

