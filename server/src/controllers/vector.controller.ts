import { Request, Response } from 'express';
// @visioncortex/vtracer WebAssembly wrapper
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vtracer = require('@visioncortex/vtracer');

export interface VectorizeRequest {
  image: string; // base64 or data URL
  mode?: 'spline' | 'polygon' | 'pixel';
  hierarchical?: 'cutout' | 'stacked';
  filterSpeckle?: number;
  filter_speckle?: number;
  colorPrecision?: number;
  color_precision?: number;
  maxColors?: number;
  simplify?: number;
  cornerThreshold?: number;
  layerDifference?: number;
  pathPrecision?: number;
}

export interface VectorStats {
  pathCount: number;
  nodeCount: number;
  colorCount: number;
  colors: string[];
  colorLayers: { color: string; count: number }[];
  width: number;
  height: number;
  viewBox: string;
}

/**
 * Normalizes hex color strings to uppercase #RRGGBB
 */
function normalizeColor(color: string): string {
  color = color.trim();
  if (color.startsWith('#')) {
    if (color.length === 4) {
      return (
        '#' +
        color[1] +
        color[1] +
        color[2] +
        color[2] +
        color[3] +
        color[3]
      ).toUpperCase();
    }
    return color.toUpperCase();
  }
  if (color.startsWith('rgb')) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      const r = parseInt(matches[0], 10).toString(16).padStart(2, '0');
      const g = parseInt(matches[1], 10).toString(16).padStart(2, '0');
      const b = parseInt(matches[2], 10).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`.toUpperCase();
    }
  }
  return color;
}

/**
 * Analyze SVG string for Cricut cut layers, node count, and color groupings
 */
function analyzeSvg(svg: string): VectorStats {
  const pathRegex = /<path\b([^>]*)\/?>/gi;
  let pathCount = 0;
  let nodeCount = 0;
  const colorMap = new Map<string, number>();

  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(svg)) !== null) {
    pathCount++;
    const attrs = match[1];

    // Find fill
    const fillMatch = attrs.match(/fill="([^"]+)"/i) || attrs.match(/fill:([^;"]+)/i);
    let fill = fillMatch ? fillMatch[1].trim() : 'none';
    if (fill.toLowerCase() !== 'none') {
      fill = normalizeColor(fill);
      colorMap.set(fill, (colorMap.get(fill) || 0) + 1);
    }

    // Estimate nodes from 'd' attribute
    const dMatch = attrs.match(/d="([^"]+)"/i);
    if (dMatch) {
      const commands = dMatch[1].match(/[MmLlHhVvCcSsQqTtAaZz]/g);
      nodeCount += commands ? commands.length : 1;
    }
  }

  // Extract viewBox and dimensions
  const vbMatch = svg.match(/viewBox="([^"]+)"/i);
  const viewBox = vbMatch ? vbMatch[1] : '0 0 800 800';

  const wMatch = svg.match(/width="([^"]+)"/i);
  const hMatch = svg.match(/height="([^"]+)"/i);
  let width = wMatch ? parseFloat(wMatch[1]) : 0;
  let height = hMatch ? parseFloat(hMatch[1]) : 0;

  if (!width || !height) {
    const parts = viewBox.split(/[\s,]+/).map(parseFloat);
    if (parts.length >= 4) {
      width = parts[2];
      height = parts[3];
    } else {
      width = 800;
      height = 800;
    }
  }

  const colorLayers = Array.from(colorMap.entries()).map(([color, count]) => ({
    color,
    count
  })).sort((a, b) => b.count - a.count);

  return {
    pathCount,
    nodeCount,
    colorCount: colorLayers.length,
    colors: colorLayers.map(l => l.color),
    colorLayers,
    width,
    height,
    viewBox
  };
}

export async function vectorizeImage(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as VectorizeRequest;
    if (!body || !body.image) {
      res.status(400).json({ error: 'Image data is required (base64 string or data URL)' });
      return;
    }

    let base64Data = body.image.trim();

    // Check if input is already an SVG (either raw or data URL)
    if (base64Data.startsWith('<svg') || base64Data.includes('data:image/svg+xml')) {
      let rawSvg = base64Data;
      if (base64Data.includes('data:image/svg+xml')) {
        const afterComma = base64Data.split(',')[1] || '';
        if (base64Data.includes(';base64,')) {
          rawSvg = Buffer.from(afterComma, 'base64').toString('utf8');
        } else {
          rawSvg = decodeURIComponent(afterComma);
        }
      }
      const stats = analyzeSvg(rawSvg);
      res.json({
        success: true,
        svg: rawSvg,
        stats,
        optionsApplied: { source: 'svg-direct' }
      });
      return;
    }

    // Strip data URL scheme if present (e.g., data:image/png;base64,...)
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');
    if (imageBuffer.length === 0) {
      res.status(400).json({ error: 'Decoded image buffer is empty' });
      return;
    }

    // Configure options optimized for Cricut plotting
    const mode = body.mode || 'spline';
    const hierarchical = body.hierarchical || 'cutout';
    const filterSpeckle = body.filterSpeckle ?? body.filter_speckle ?? 4;
    const colorPrecision = body.colorPrecision ?? body.color_precision ?? 7;
    const maxColors = body.maxColors ?? 16;
    const simplify = body.simplify ?? 1.5;
    const cornerThreshold = body.cornerThreshold ?? 60;
    const layerDifference = body.layerDifference ?? 16;
    const pathPrecision = body.pathPrecision ?? 3;

    const options: Record<string, any> = {
      mode,
      hierarchical, // 'cutout' produces seamless shapes for vinyl without overlapping layers!
      filterSpeckle, // eliminates tiny flecks that snag cutter blades
      colorPrecision, // cluster colors cleanly into cut mats
      maxColors,
      simplify,
      cornerThreshold,
      layerDifference,
      pathPrecision
    };

    // Vectorize using visioncortex vtracer
    const svgOutput: string = vtracer.convertBuffer(imageBuffer, options);

    if (!svgOutput || typeof svgOutput !== 'string' || !svgOutput.includes('<svg')) {
      throw new Error('VTracer produced invalid or empty SVG output');
    }

    const stats = analyzeSvg(svgOutput);

    res.json({
      success: true,
      svg: svgOutput,
      stats,
      optionsApplied: options
    });
  } catch (error: any) {
    console.error('Vectorization error:', error);
    res.status(500).json({
      error: 'Failed to vectorize image',
      details: error?.message || String(error)
    });
  }
}
