/**
 * Vinyl Decal Vector Brush & Eraser Engine
 *
 * Converts freehand mouse strokes into exact 2D MultiPolygon geometries
 * and performs Boolean Union (Paint) and Boolean Difference (Erase)
 * on targeted vector color layers.
 */

import polygonClipping, { type Geom } from 'polygon-clipping';
import { multiPolygonToSvgD } from './booleanUnion';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Generates an N-vertex regular polygon approximation of a circle.
 */
export function createCirclePolygon(center: Point2D, radius: number, segments: number = 16): [number, number][] {
  const ring: [number, number][] = [];
  const safeRadius = Math.max(radius, 0.5);

  for (let i = 0; i < segments; i++) {
    const angle = (i * 2 * Math.PI) / segments;
    const x = Number((center.x + safeRadius * Math.cos(angle)).toFixed(2));
    const y = Number((center.y + safeRadius * Math.sin(angle)).toFixed(2));
    ring.push([x, y]);
  }
  // Ensure ring is closed
  ring.push([ring[0][0], ring[0][1]]);
  return ring;
}

/**
 * Converts a sequence of continuous stroke coordinates into a unified 2D MultiPolygon.
 * Approximates a swept circular brush by sweeping capsule quads between consecutive points
 * and joining with circular end-caps and joints.
 */
export function strokeToMultiPolygon(points: Point2D[], brushDiameter: number): number[][][][] {
  if (!points || points.length === 0) return [];

  const radius = Math.max(brushDiameter / 2, 1);
  const circleSegments = 16;

  // Single click / dot: circle of diameter brushDiameter
  if (points.length === 1) {
    const circleRing = createCirclePolygon(points[0], radius, circleSegments);
    return [[circleRing]];
  }

  // individualPolys holds an array of Polygons ([ring][])
  const individualPolys: [number, number][][][] = [];

  // Circle at stroke origin
  individualPolys.push([createCirclePolygon(points[0], radius, circleSegments)]);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > 0.05) {
      // Normal vector perpendicular to segment
      const nx = -dy / len;
      const ny = dx / len;

      const ox = nx * radius;
      const oy = ny * radius;

      // Swept quad coordinates
      const v1: [number, number] = [Number((p0.x + ox).toFixed(2)), Number((p0.y + oy).toFixed(2))];
      const v2: [number, number] = [Number((p1.x + ox).toFixed(2)), Number((p1.y + oy).toFixed(2))];
      const v3: [number, number] = [Number((p1.x - ox).toFixed(2)), Number((p1.y - oy).toFixed(2))];
      const v4: [number, number] = [Number((p0.x - ox).toFixed(2)), Number((p0.y - oy).toFixed(2))];

      const quadRing: [number, number][] = [v1, v2, v3, v4, [v1[0], v1[1]]];
      individualPolys.push([quadRing]);
    }

    // Joint circle at p1
    individualPolys.push([createCirclePolygon(p1, radius, circleSegments)]);
  }

  if (individualPolys.length === 0) return [];
  if (individualPolys.length === 1) return [individualPolys[0]];

  try {
    // Fast batch union across all swept capsules and circle caps
    const united: number[][][][] = (polygonClipping as any).union(
      individualPolys[0],
      ...individualPolys.slice(1)
    );
    return united;
  } catch (err) {
    console.warn('[BrushEngine] Stroke union failed, returning combined segments:', err);
    return individualPolys;
  }
}

/**
 * Applies a brush stroke to a target layer geometry.
 *
 * - In 'paint' mode: unions the stroke with the target layer geometry.
 * - In 'erase' mode: subtracts the stroke from the target layer geometry.
 */
export function applyStrokeToLayerGeometry(
  layerMultiPoly: number[][][][],
  strokeMultiPoly: number[][][][],
  mode: 'paint' | 'erase'
): {
  updatedMultiPoly: number[][][][];
  svgD: string;
} {
  if (!strokeMultiPoly || strokeMultiPoly.length === 0) {
    return {
      updatedMultiPoly: layerMultiPoly || [],
      svgD: multiPolygonToSvgD(layerMultiPoly || [])
    };
  }

  if (mode === 'paint') {
    if (!layerMultiPoly || layerMultiPoly.length === 0) {
      return {
        updatedMultiPoly: strokeMultiPoly,
        svgD: multiPolygonToSvgD(strokeMultiPoly)
      };
    }

    try {
      const united = (polygonClipping as any).union(layerMultiPoly, strokeMultiPoly);
      return {
        updatedMultiPoly: united,
        svgD: multiPolygonToSvgD(united)
      };
    } catch (err) {
      console.warn('[BrushEngine] Boolean Paint Union failed:', err);
      // Fallback: concatenate
      const currentD = multiPolygonToSvgD(layerMultiPoly);
      const strokeD = multiPolygonToSvgD(strokeMultiPoly);
      return {
        updatedMultiPoly: layerMultiPoly,
        svgD: `${currentD} ${strokeD}`.trim()
      };
    }
  }

  // mode === 'erase'
  if (!layerMultiPoly || layerMultiPoly.length === 0) {
    return {
      updatedMultiPoly: [],
      svgD: ''
    };
  }

  try {
    const subtracted = (polygonClipping as any).difference(layerMultiPoly, strokeMultiPoly);
    return {
      updatedMultiPoly: subtracted,
      svgD: multiPolygonToSvgD(subtracted)
    };
  } catch (err) {
    console.warn('[BrushEngine] Boolean Erase Difference failed:', err);
    return {
      updatedMultiPoly: layerMultiPoly,
      svgD: multiPolygonToSvgD(layerMultiPoly)
    };
  }
}
