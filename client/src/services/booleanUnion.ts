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

function batchUnion(multiPolys: number[][][][][]): number[][][][] {
  if (multiPolys.length === 0) return [];
  if (multiPolys.length === 1) return multiPolys[0];

  // Batch union in a single sweep-line operation for ultra-fast performance
  if (multiPolys.length <= 250) {
    try {
      return (polygonClipping as any).union(multiPolys[0], ...multiPolys.slice(1));
    } catch {
      // Fallback to chunked union below
    }
  }

  let current = multiPolys[0];
  const chunkSize = 100;
  for (let i = 1; i < multiPolys.length; i += chunkSize) {
    const chunk = multiPolys.slice(i, i + chunkSize);
    try {
      current = (polygonClipping as any).union(current, ...chunk);
    } catch {
      for (const item of chunk) {
        try {
          current = (polygonClipping as any).union(current, item);
        } catch {
          current.push(...item);
        }
      }
    }
  }
  return current;
}

function getPolygonBBox(poly: number[][][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const outer = poly[0];
  if (!outer || outer.length === 0) return [0, 0, 0, 0];
  for (let i = 0; i < outer.length; i++) {
    const pt = outer[i];
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }
  return [minX, minY, maxX, maxY];
}

function getMultiPolyBBox(multiPoly: number[][][][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of multiPoly) {
    const b = getPolygonBBox(poly);
    if (b[0] < minX) minX = b[0];
    if (b[1] < minY) minY = b[1];
    if (b[2] > maxX) maxX = b[2];
    if (b[3] > maxY) maxY = b[3];
  }
  return [minX, minY, maxX, maxY];
}

function bboxesIntersect(
  b1: [number, number, number, number],
  b2: [number, number, number, number]
): boolean {
  return !(b2[0] > b1[2] || b2[2] < b1[0] || b2[1] > b1[3] || b2[3] < b1[1]);
}

/**
 * Converts a set of SVG path strings into a 2D MultiPolygon geometry.
 * Correctly accounts for SVG fill-rule: evenodd holes within each path via XOR,
 * and batch-unions shapes of the same color in a single sweep-line pass.
 */
export function pathsToMultiPolygon(
  pathStrings: string[],
  contoursList?: { x: number; y: number }[][][]
): number[][][][] {
  // 1. Process contoursList directly if available
  if (contoursList && contoursList.length > 0) {
    const allPathGeoms: number[][][][][] = [];
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
        allPathGeoms.push(pathGeom);
      }
    }
    return batchUnion(allPathGeoms);
  }

  // 2. Otherwise parse pathStrings
  const validDStrings = pathStrings.filter((d) => d && d.trim().length > 0);
  if (validDStrings.length === 0) return [];

  const allPathGeoms: number[][][][][] = [];
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
        allPathGeoms.push(pathGeom);
      }
    } catch (err) {
      console.warn('[BooleanUnion] Failed to convert path to polygon:', err);
    }
  }

  return batchUnion(allPathGeoms);
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
 * Optimized with bounding-box pre-filtering and batch boolean operations.
 */
export function makeLayerSolidUnderOverlays(
  layerMultiPoly: number[][][][],
  upperMultiPoly: number[][][][]
): number[][][][] {
  if (!upperMultiPoly || upperMultiPoly.length === 0) return layerMultiPoly;
  if (!layerMultiPoly || layerMultiPoly.length === 0) return layerMultiPoly;

  let currentLayer = layerMultiPoly;

  // 1. Fill interior cutouts / holes covered by upper layers:
  // An interior hole only exists if poly has more than 1 ring (poly[0] is outer boundary, poly[1...] are holes).
  const polysWithHoles = currentLayer.filter(
    (poly) => poly && poly.length > 1 && poly[0] && poly[0].length >= 3
  );

  if (polysWithHoles.length > 0) {
    const upperBBox = getMultiPolyBBox(upperMultiPoly);
    const candidateEnvelopes: number[][][][] = [];

    for (const poly of polysWithHoles) {
      const pBBox = getPolygonBBox(poly);
      if (bboxesIntersect(pBBox, upperBBox)) {
        candidateEnvelopes.push([poly[0]]);
      }
    }

    if (candidateEnvelopes.length > 0) {
      try {
        const overlay = (polygonClipping as any).intersection(
          upperMultiPoly,
          candidateEnvelopes.length === 1 ? candidateEnvelopes[0] : candidateEnvelopes
        );
        if (overlay && overlay.length > 0) {
          currentLayer = (polygonClipping as any).union(currentLayer, overlay);
        }
      } catch {
        for (const env of candidateEnvelopes) {
          try {
            const overlay = (polygonClipping as any).intersection(upperMultiPoly, env);
            if (overlay && overlay.length > 0) {
              currentLayer = (polygonClipping as any).union(currentLayer, overlay);
            }
          } catch {
            // Continue
          }
        }
      }
    }
  }

  // 2. Incorporate upper layer polygons that overlay or touch this layer (solid stacked / overprint)
  const currentBBox = getMultiPolyBBox(currentLayer);
  const touchingUpperPolys: number[][][][] = [];

  for (const upperPoly of upperMultiPoly) {
    if (!upperPoly || upperPoly.length === 0 || !upperPoly[0] || upperPoly[0].length < 3) continue;
    const uBBox = getPolygonBBox(upperPoly);
    if (!bboxesIntersect(currentBBox, uBBox)) continue;

    try {
      const inter = (polygonClipping as any).intersection(currentLayer, [upperPoly]);
      if (inter && inter.length > 0) {
        touchingUpperPolys.push(upperPoly);
      }
    } catch {
      // Continue
    }
  }

  if (touchingUpperPolys.length > 0) {
    try {
      currentLayer = (polygonClipping as any).union(currentLayer, touchingUpperPolys);
    } catch {
      for (const upperPoly of touchingUpperPolys) {
        try {
          const testUnion = (polygonClipping as any).union(currentLayer, [upperPoly]);
          if (testUnion && testUnion.length <= currentLayer.length) {
            currentLayer = testUnion;
          }
        } catch {
          // Continue
        }
      }
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

/**
 * Calculates the exact outer perimeter boundary SVG path `d`
 * across all provided vector path strings (as if all layers were flattened into a single image).
 * Strips away all interior cutout holes and internal layer seams, leaving only the outer perimeter contour.
 */
export function computeOuterPerimeterD(pathStrings: string[]): string {
  const validDStrings = pathStrings.filter((d) => d && d.trim().length > 0);
  if (validDStrings.length === 0) return '';

  try {
    const multiPoly = pathsToMultiPolygon(validDStrings);
    if (!multiPoly || multiPoly.length === 0) {
      return '';
    }

    // Outer perimeter boundary keeps ONLY the outer ring (poly[0]) of each polygon island
    const outerBoundaryMultiPoly: number[][][][] = multiPoly
      .filter((poly) => poly && poly.length > 0 && poly[0] && poly[0].length >= 3)
      .map((poly) => [poly[0]]);

    if (outerBoundaryMultiPoly.length === 0) {
      return '';
    }

    return multiPolygonToSvgD(outerBoundaryMultiPoly);
  } catch (err) {
    console.warn('[BooleanUnion] Failed to compute outer perimeter:', err);
    return '';
  }
}

