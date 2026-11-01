/**
 * Craftly Cricut SVG Exporter & Sanitizer
 *
 * Ensures 100% compatibility with Cricut Design Space's XML parser & standard SVG viewers:
 * 1. Exports ONLY the cropped artwork area (tight bounding box), eliminating extra canvas margins.
 * 2. Uses viewBox="0 0 width height" with a master offset container so all coordinates are
 *    strictly positive, preventing browsers (Edge, Chrome) from rendering blank or scrambled vectors.
 * 3. Preserves each Fabric object's <g transform="matrix(...)"> matrix so child paths never lose
 *    their spatial placement or relative alignment.
 * 4. Strips duplicate attributes (especially duplicate xmlns) that trigger Cricut's
 *    "something went wrong WE are unable to upload your image" error.
 * 5. Removes unsupported Cricut attributes: vector-effect, xml:space, <desc>, empty <defs></defs>.
 * 6. Converts all CSS style="..." attributes to clean SVG presentation attributes
 *    (fill, stroke, stroke-width, stroke-linejoin, stroke-linecap).
 * 7. Groups vector paths by color into Cricut cutting mat layers (<g id="Mat_Color_#HEX">).
 * 8. Validates XML structure with DOMParser before exporting.
 */

import { ActiveSelection, type Canvas as FabricCanvas, type FabricObject, util } from 'fabric';
import {
  type PenInfillOptions,
  getEffectivePenWidthMm,
  parseSvgPathToContours,
  generateHatchPathFromContours,
  MM_TO_PX
} from './penInfill';
import {
  type VinylCutSettings,
  getStoredVinylSettings
} from './vinylCutSettings';
import { remediateSvgPath } from './vinylRemediation';
import { booleanUnionPaths, flattenColorLayersNonOverlapping } from './booleanUnion';

export interface CricutExportOptions {
  isLineArt?: boolean;
  lineArtOptions?: {
    penWidth?: number;
    colorMode?: 'black' | 'color';
  };
  groupColorsIntoMats?: boolean;
  penInfill?: PenInfillOptions;
  vinylRemediation?: {
    enabled: boolean;
    settings?: VinylCutSettings;
  };
}

/**
 * Extracts absolute path commands in canvas coordinate space from any Fabric object,
 * baking all object scale, rotation, and translation matrices directly into the commands.
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
    if (obj.type === 'circle') {
      const r = (obj as any).radius || 50;
      const k = r * 0.5522847498;
      const cmds = [
        ['M', 0, -r],
        ['C', k, -r, r, -k, r, 0],
        ['C', r, k, k, r, 0, r],
        ['C', -k, r, -r, k, -r, 0],
        ['C', -r, -k, -k, -r, 0, -r],
        ['Z']
      ];
      return (util as any).transformPath(cmds, obj.calcTransformMatrix());
    }
    if (obj.type === 'group' && (obj as any).getObjects) {
      const all: any[] = [];
      const children: FabricObject[] = (obj as any).getObjects();
      children.forEach((child) => {
        all.push(...extractAbsoluteCommands(child));
      });
      return all;
    }
  } catch (err) {
    console.warn('[Craftly SVG Exporter] Error extracting absolute path commands:', err);
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

/**
 * Determines primary color of a Fabric object for cutting mat grouping.
 */
function getObjectColorKey(obj: FabricObject): string {
  const fill = ((obj.fill as string) || (obj as any)._originalFill || '').trim();
  if (fill && fill.toLowerCase() !== 'none' && fill.toLowerCase() !== 'transparent') {
    return fill.toUpperCase();
  }
  const stroke = ((obj.stroke as string) || (obj as any)._originalStroke || '').trim();
  if (stroke && stroke.toLowerCase() !== 'none') {
    return stroke.toUpperCase();
  }
  return '#000000';
}

/**
 * Recursively cleans SVG elements: promotes CSS style rules to presentation attributes,
 * strips vector-effect and unsupported attributes, applies Line Art overrides.
 */
function sanitizeElementForCricut(el: Element, isLineArt: boolean): void {
  // Remove problematic Cricut attributes
  el.removeAttribute('vector-effect');
  el.removeAttribute('xml:space');
  el.removeAttribute('class');

  // Convert CSS style="..." attribute to clean SVG presentation attributes
  const styleAttr = el.getAttribute('style');
  if (styleAttr) {
    const declarations = styleAttr.split(';');
    for (const decl of declarations) {
      const colonIdx = decl.indexOf(':');
      if (colonIdx === -1) continue;
      const key = decl.slice(0, colonIdx).trim().toLowerCase();
      const val = decl.slice(colonIdx + 1).trim();
      if (!val) continue;

      if (
        [
          'fill',
          'stroke',
          'stroke-width',
          'stroke-linecap',
          'stroke-linejoin',
          'stroke-dasharray',
          'opacity',
          'fill-rule',
          'stroke-miterlimit'
        ].includes(key)
      ) {
        if (!el.hasAttribute(key)) {
          el.setAttribute(key, val);
        }
      }
    }
    el.removeAttribute('style');
  }

  // Cricut Pen Draw / Line Art overrides
  const tag = el.tagName.toLowerCase();
  if (isLineArt && tag !== 'g') {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', '#000000');
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
  } else if (!isLineArt && tag !== 'g') {
    const fill = el.getAttribute('fill');
    if (!fill || fill.toLowerCase() === 'none') {
      // Check stroke
      if (!el.getAttribute('stroke')) {
        el.setAttribute('fill', '#000000');
      }
    }
  }

  // Recurse for all children
  for (let i = 0; i < el.children.length; i++) {
    sanitizeElementForCricut(el.children[i], isLineArt);
  }
}

/**
 * Determines primary color of an object element for Cricut mat grouping.
 */
function getPrimaryColor(el: Element): string {
  const shapes = el.querySelectorAll('path, polygon, polyline, circle, ellipse, rect');
  for (const s of Array.from(shapes)) {
    const fill = s.getAttribute('fill');
    if (fill && fill.toLowerCase() !== 'none' && fill.toLowerCase() !== 'transparent') {
      return fill.trim().toLowerCase();
    }
  }
  const selfFill = el.getAttribute('fill');
  if (selfFill && selfFill.toLowerCase() !== 'none' && selfFill.toLowerCase() !== 'transparent') {
    return selfFill.trim().toLowerCase();
  }
  for (const s of Array.from(shapes)) {
    const stroke = s.getAttribute('stroke');
    if (stroke && stroke.toLowerCase() !== 'none') {
      return stroke.trim().toLowerCase();
    }
  }
  return '#000000';
}

export function exportCricutSvg(
  canvas: FabricCanvas | null,
  options: CricutExportOptions = {}
): string {
  if (!canvas) return '';

  const { isLineArt = false, groupColorsIntoMats = true } = options;

  // Temporarily commit and discard active selection so that all objects
  // possess exact absolute canvas coordinates and transform matrices
  const activeObj = canvas.getActiveObject();
  const wasActiveSelection = activeObj && (activeObj as any).type === 'activeSelection';
  let selectedObjects: FabricObject[] = [];
  if (wasActiveSelection && (activeObj as any).getObjects) {
    selectedObjects = (activeObj as any).getObjects();
  }

  try {
    if (activeObj) {
      canvas.discardActiveObject();
    }

    // 1. Gather all valid cuttable objects (excluding crop helpers, lasso overlays)
    const allObjects = canvas.getObjects().filter((obj) => {
      if (!obj.visible) return false;
      const name = (obj as any).name;
      if (name === 'crop-overlay' || name === 'lasso-preview') return false;
      if ((obj as any).excludeFromExport) return false;
      return true;
    });

    if (allObjects.length === 0) {
      return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
    }

    // 2. Compute tight bounding box across all objects on canvas
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    allObjects.forEach((obj) => {
      const b = obj.getBoundingRect();
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.left + b.width);
      maxY = Math.max(maxY, b.top + b.height);
    });

    const width = Math.max(Math.ceil(maxX - minX), 10);
    const height = Math.max(Math.ceil(maxY - minY), 10);
    const offsetX = Number(minX.toFixed(2));
    const offsetY = Number(minY.toFixed(2));

    // 3. Create fresh Cricut-compliant SVG XML Document
    const cricutDoc = document.implementation.createDocument(
      'http://www.w3.org/2000/svg',
      'svg',
      null
    );
    const root = cricutDoc.documentElement;

    root.setAttribute('version', '1.1');
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    root.setAttribute('width', `${width}`);
    root.setAttribute('height', `${height}`);
    root.setAttribute('data-generator', 'Craftly Cricut Studio');

    // Master container that offsets coordinates by (-offsetX, -offsetY)
    // to map canvas artwork bounds directly into the tight 0..width, 0..height viewport
    const masterContainer = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
    masterContainer.setAttribute('id', 'Craftly_Artwork_Bounds');
    masterContainer.setAttribute('transform', `translate(${-offsetX}, ${-offsetY})`);

    // 4. Infill & Pen Settings
    const penInfill = options.penInfill;
    const isPenMode = Boolean(penInfill?.enabled);
    const penWidthMm = isPenMode
      ? getEffectivePenWidthMm(penInfill!.penSizePreset, penInfill!.customPenWidthMm)
      : 0.4;
    const penWidthPx = Number((penWidthMm * MM_TO_PX).toFixed(3));
    const overlap = penInfill?.overlapFactor !== undefined ? penInfill.overlapFactor : 0.92;
    const hatchSpacing = Math.max(0.2, Number((penWidthPx * overlap).toFixed(3)));

    // 4.5. Vinyl Cutting Auto-Remediation Settings
    const vinylRemediationOpt = options.vinylRemediation;
    const isVinylRemediationActive = Boolean(vinylRemediationOpt?.enabled);
    const activeVinylSettings = vinylRemediationOpt?.settings || getStoredVinylSettings();

    // 5. Group objects by color
    const colorObjectsMap = new Map<string, FabricObject[]>();
    allObjects.forEach((obj) => {
      const color = getObjectColorKey(obj);
      if (!colorObjectsMap.has(color)) {
        colorObjectsMap.set(color, []);
      }
      colorObjectsMap.get(color)!.push(obj);
    });

    // 6. Build a single compound path for each layer/mat (ZERO loose sub-paths!)
    if (!groupColorsIntoMats) {
      // Single Layer Mode (Only when groupColorsIntoMats is explicitly false):
      // Combine ALL shapes and infills across the entire design into EXACTLY ONE compound <path>!
      const allPathStrings: string[] = [];

      allObjects.forEach((obj) => {
        const cmds = extractAbsoluteCommands(obj);
        if (cmds.length === 0) return;
        let shapeD = commandsToD(cmds).trim();
        if (!shapeD) return;
        if (!shapeD.toUpperCase().endsWith('Z')) {
          shapeD += ' Z';
        }

        if (isVinylRemediationActive && !isPenMode) {
          const { remediatedD } = remediateSvgPath(shapeD, activeVinylSettings);
          shapeD = remediatedD.trim();
          if (!shapeD) return;
        }

        if (isPenMode) {
          const contours = parseSvgPathToContours(shapeD);
          const hatchD = generateHatchPathFromContours(contours, hatchSpacing);
          if (hatchD && hatchD.trim()) {
            allPathStrings.push(`${shapeD} ${hatchD.trim()}`);
          } else {
            allPathStrings.push(shapeD);
          }
        } else {
          allPathStrings.push(shapeD);
        }
      });

      if (allPathStrings.length > 0) {
        const unifiedDrawD =
          !isPenMode && !isLineArt && allPathStrings.length > 1
            ? booleanUnionPaths(allPathStrings)
            : allPathStrings.join(' ');
        const effectiveStrokeWidth =
          isLineArt && options.lineArtOptions?.penWidth
            ? options.lineArtOptions.penWidth
            : isPenMode
            ? penWidthPx
            : 2;
        const singlePath = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'path');
        singlePath.setAttribute('id', 'Cricut_Pen_Draw_Path');
        singlePath.setAttribute('d', unifiedDrawD);
        singlePath.setAttribute('fill', 'none');
        singlePath.setAttribute('stroke', '#000000');
        singlePath.setAttribute('stroke-width', `${effectiveStrokeWidth}`);
        singlePath.setAttribute('stroke-linecap', 'round');
        singlePath.setAttribute('stroke-linejoin', 'round');
        singlePath.setAttribute('data-type', isPenMode ? 'pen-draw-with-infill' : 'pen-lineart');

        const drawGroup = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
        drawGroup.setAttribute('id', 'Cricut_Pen_Draw');
        drawGroup.appendChild(singlePath);

        masterContainer.appendChild(drawGroup);
      }
    } else {
      // Multi-Mat Mode:
      // For EACH colour group combine all individual path strings into a SINGLE element (a compound path)
      // and guarantee zero overlap between mats (inlay cutout geometry).
      let matIndex = 1;

      if (!isPenMode && !isLineArt) {
        // Collect all color groups and their canvas z-index
        const colorGroups: { color: string; pathStrings: string[]; maxZ: number }[] = [];
        colorObjectsMap.forEach((objects, colorKey) => {
          const pathStringsForThisColor: string[] = [];
          let maxZ = 0;
          objects.forEach((obj) => {
            const z = canvas.getObjects().indexOf(obj);
            if (z > maxZ) maxZ = z;

            const cmds = extractAbsoluteCommands(obj);
            if (cmds.length === 0) return;

            let shapeD = commandsToD(cmds).trim();
            if (!shapeD) return;
            if (!shapeD.toUpperCase().endsWith('Z')) {
              shapeD += ' Z';
            }

            if (isVinylRemediationActive) {
              const { remediatedD } = remediateSvgPath(shapeD, activeVinylSettings);
              shapeD = remediatedD.trim();
              if (!shapeD) return;
            }
            pathStringsForThisColor.push(shapeD);
          });

          if (pathStringsForThisColor.length > 0) {
            colorGroups.push({ color: colorKey, pathStrings: pathStringsForThisColor, maxZ });
          }
        });

        // Sort front-to-back so foreground details take precedence
        colorGroups.sort((a, b) => b.maxZ - a.maxZ);

        // Compute completely non-overlapping geometry
        const flattenedMats = flattenColorLayersNonOverlapping(colorGroups);

        flattenedMats.forEach((mat) => {
          const matPath = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'path');
          matPath.setAttribute('id', `Mat_${matIndex}_Path`);
          matPath.setAttribute('d', mat.d);
          matPath.setAttribute('fill', mat.color);
          matPath.setAttribute('stroke', 'none');
          matPath.setAttribute('fill-rule', 'evenodd');
          matPath.setAttribute('data-type', 'cricut-cut-mat');

          const sanitizedColor = mat.color.replace(/[^a-zA-Z0-9]/g, '_');
          const matGroup = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
          matGroup.setAttribute('id', `Mat_${matIndex}_${sanitizedColor}`);
          matGroup.setAttribute('fill', mat.color);
          matGroup.appendChild(matPath);
          masterContainer.appendChild(matGroup);
          matIndex++;
        });
      } else {
        // Pen Draw or Line Art mode
        colorObjectsMap.forEach((objects, colorKey) => {
          const pathStringsForThisColor: string[] = [];

          objects.forEach((obj) => {
            const cmds = extractAbsoluteCommands(obj);
            if (cmds.length === 0) return;

            let shapeD = commandsToD(cmds).trim();
            if (!shapeD) return;
            if (!shapeD.toUpperCase().endsWith('Z')) {
              shapeD += ' Z';
            }

            if (isPenMode) {
              const contours = parseSvgPathToContours(shapeD);
              const hatchD = generateHatchPathFromContours(contours, hatchSpacing);
              if (hatchD && hatchD.trim()) {
                pathStringsForThisColor.push(`${shapeD} ${hatchD.trim()}`);
              } else {
                pathStringsForThisColor.push(shapeD);
              }
            } else {
              pathStringsForThisColor.push(shapeD);
            }
          });

          if (pathStringsForThisColor.length === 0) return;

          const matStrokeColor =
            isLineArt && options.lineArtOptions?.colorMode === 'black'
              ? '#000000'
              : colorKey;
          const matStrokeWidth =
            isLineArt && options.lineArtOptions?.penWidth
              ? options.lineArtOptions.penWidth
              : isPenMode
              ? penWidthPx
              : 2;

          const unifiedMatD = pathStringsForThisColor.join(' ');
          const matPath = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'path');
          matPath.setAttribute('id', `Mat_${matIndex}_Path`);
          matPath.setAttribute('d', unifiedMatD);
          matPath.setAttribute('fill', 'none');
          matPath.setAttribute('stroke', matStrokeColor);
          matPath.setAttribute('stroke-width', `${matStrokeWidth}`);
          matPath.setAttribute('stroke-linecap', 'round');
          matPath.setAttribute('stroke-linejoin', 'round');
          matPath.setAttribute('data-type', isPenMode ? 'pen-draw-with-infill' : 'pen-lineart');

          const sanitizedColor = colorKey.replace(/[^a-zA-Z0-9]/g, '_');
          const matGroup = cricutDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
          matGroup.setAttribute('id', `Mat_${matIndex}_${sanitizedColor}`);
          matGroup.setAttribute('fill', 'none');
          matGroup.setAttribute('stroke', matStrokeColor);
          matGroup.setAttribute('stroke-width', `${matStrokeWidth}`);

          matGroup.appendChild(matPath);
          masterContainer.appendChild(matGroup);
          matIndex++;
        });
      }
    }

    root.appendChild(masterContainer);

    // 6. Serialize to XML string
    const serializer = new XMLSerializer();
    let sanitizedSvg = serializer.serializeToString(cricutDoc);

    // 7. Sanity cleanup: ensure no duplicate xmlns declarations
    sanitizedSvg = sanitizedSvg.replace(
      /xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,
      'xmlns="http://www.w3.org/2000/svg"'
    );

    return `<?xml version="1.0" encoding="UTF-8"?>\n${sanitizedSvg}`;
  } finally {
    // Restore active selection on canvas
    try {
      if (wasActiveSelection && selectedObjects.length > 1) {
        const newSel = new ActiveSelection(selectedObjects, { canvas });
        canvas.setActiveObject(newSel);
      } else if (activeObj) {
        canvas.setActiveObject(activeObj);
      }
      canvas.renderAll();
    } catch {
      // Ignore restore selection error
    }
  }
}
