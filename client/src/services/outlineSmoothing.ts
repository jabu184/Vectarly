/**
 * Vector Outline Smoothing Engine for Vinyl Cutting
 *
 * Smooths isolated vector islands and boundaries using:
 * 1. Ramer-Douglas-Peucker (RDP) polygon simplification (prunes micro-steps and jitter)
 * 2. Chaikin corner-cutting (converts sharp polygonal facets into smooth parabolic arcs)
 * 3. Tangent-continuous Cubic Bézier spline fitting (generates silky smooth SVG cut paths)
 */

import { parseSvgPathToContours } from './penInfill';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Calculates perpendicular distance from a point to a line segment.
 */
function perpendicularDistance(p: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLenSq = dx * dx + dy * dy;

  if (lineLenSq === 0) {
    const distDx = p.x - lineStart.x;
    const distDy = p.y - lineStart.y;
    return Math.sqrt(distDx * distDx + distDy * distDy);
  }

  const t = Math.max(0, Math.min(1, ((p.x - lineStart.x) * dx + (p.y - lineStart.y) * dy) / lineLenSq));
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  const diffX = p.x - projX;
  const diffY = p.y - projY;
  return Math.sqrt(diffX * diffX + diffY * diffY);
}

/**
 * Ramer-Douglas-Peucker (RDP) polyline simplification.
 */
export function simplifyPointsRdp(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2 || epsilon <= 0) return points;

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPointsRdp(points.slice(0, index + 1), epsilon);
    const right = simplifyPointsRdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[end]];
}

/**
 * RDP simplification for a closed polygon ring.
 * Finds the two points furthest apart, splits into two arcs, simplifies each, and rejoins.
 */
export function simplifyClosedRingRdp(ring: Point2D[], epsilon: number): Point2D[] {
  if (ring.length <= 4 || epsilon <= 0) return ring;

  // Ensure first and last are identical for closed loop
  const isClosed =
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.01;
  const pts = isClosed ? ring.slice(0, -1) : [...ring];
  const n = pts.length;
  if (n < 4) return ring;

  // Find the index furthest from pts[0]
  let maxDistSq = 0;
  let splitIndex = Math.floor(n / 2);

  for (let i = 1; i < n; i++) {
    const dSq = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      splitIndex = i;
    }
  }

  const arc1 = pts.slice(0, splitIndex + 1);
  const arc2 = pts.slice(splitIndex).concat([pts[0]]);

  const simpArc1 = simplifyPointsRdp(arc1, epsilon);
  const simpArc2 = simplifyPointsRdp(arc2, epsilon);

  const merged = simpArc1.slice(0, -1).concat(simpArc2);
  return merged;
}

/**
 * Chaikin's corner-cutting algorithm for closed polygonal loops.
 * Iteratively subdivides each edge at 25% and 75% to produce smooth B-splines.
 */
export function chaikinSmoothClosedRing(ring: Point2D[], iterations: number = 1): Point2D[] {
  if (ring.length < 3 || iterations <= 0) return ring;

  // Remove duplicate closing point if present
  const isClosed =
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.01;
  let current = isClosed ? ring.slice(0, -1) : [...ring];

  for (let iter = 0; iter < iterations; iter++) {
    const next: Point2D[] = [];
    const n = current.length;

    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];

      // Q = 0.75 * p0 + 0.25 * p1
      const q: Point2D = {
        x: Number((0.75 * p0.x + 0.25 * p1.x).toFixed(2)),
        y: Number((0.75 * p0.y + 0.25 * p1.y).toFixed(2))
      };

      // R = 0.25 * p0 + 0.75 * p1
      const r: Point2D = {
        x: Number((0.25 * p0.x + 0.75 * p1.x).toFixed(2)),
        y: Number((0.25 * p0.y + 0.75 * p1.y).toFixed(2))
      };

      next.push(q, r);
    }

    current = next;
  }

  // Close ring
  current.push({ ...current[0] });
  return current;
}

/**
 * Converts a smoothed closed point loop into a sequence of tangent-continuous
 * cubic Bézier curve commands ('C').
 */
export function ringToSmoothCubicBezierSvg(ring: Point2D[], tension: number = 0.5): string {
  if (ring.length < 3) return '';

  const isClosed =
    Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 0.01;
  const pts = isClosed ? ring.slice(0, -1) : [...ring];
  const n = pts.length;
  if (n < 3) return '';

  const cmds: string[] = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];

  for (let i = 0; i < n; i++) {
    const pPrev = pts[(i - 1 + n) % n];
    const pCurr = pts[i];
    const pNext = pts[(i + 1) % n];
    const pNextNext = pts[(i + 2) % n];

    // Catmull-Rom style tangents scaled by tension
    const cp1x = pCurr.x + ((pNext.x - pPrev.x) / 6) * tension;
    const cp1y = pCurr.y + ((pNext.y - pPrev.y) / 6) * tension;

    const cp2x = pNext.x - ((pNextNext.x - pCurr.x) / 6) * tension;
    const cp2y = pNext.y - ((pNextNext.y - pCurr.y) / 6) * tension;

    cmds.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${pNext.x.toFixed(2)} ${pNext.y.toFixed(2)}`
    );
  }

  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Smooths an isolated island contour according to smoothPercent (0 - 100).
 */
export function smoothIslandContour(contour: Point2D[], smoothPercent: number): string {
  if (!contour || contour.length < 3 || smoothPercent <= 0) {
    if (!contour || contour.length < 2) return '';
    const parts = contour.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    return `${parts.join(' ')} Z`;
  }

  const s = Math.max(0, Math.min(100, smoothPercent)) / 100;

  // 1. RDP simplification: filters high-frequency noise & micro-jaggies
  const epsilon = 0.15 + s * 1.5; // 0.15px to 1.65px
  const simplified = simplifyClosedRingRdp(contour, epsilon);
  if (simplified.length < 3) return '';

  // 2. Chaikin subdivision passes: softens corners into smooth curves
  const iterations = s > 0.65 ? 2 : 1;
  const chaikinSmoothed = chaikinSmoothClosedRing(simplified, iterations);

  // 3. Tangent-continuous cubic Bézier curve fitting
  const tension = 0.5 + s * 0.45; // 0.5 to 0.95
  return ringToSmoothCubicBezierSvg(chaikinSmoothed, tension);
}

/**
 * Smooths every isolated island vector in an SVG path `d` string.
 * Each subpath (M ... Z) is parsed, smoothed independently, and rejoined.
 */
export function smoothSvgPathString(d: string, smoothPercent: number): string {
  if (!d || d.trim().length === 0 || smoothPercent <= 0) {
    return d || '';
  }

  try {
    const islandContours = parseSvgPathToContours(d);
    if (!islandContours || islandContours.length === 0) {
      return d;
    }

    const smoothedSubpaths: string[] = [];

    for (const contour of islandContours) {
      if (!contour || contour.length < 3) continue;
      const subpathD = smoothIslandContour(contour, smoothPercent);
      if (subpathD && subpathD.trim()) {
        smoothedSubpaths.push(subpathD.trim());
      }
    }

    if (smoothedSubpaths.length === 0) {
      return d;
    }

    return smoothedSubpaths.join(' ');
  } catch (err) {
    console.warn('[OutlineSmoothing] Failed to smooth vector path:', err);
    return d;
  }
}
