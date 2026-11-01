import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Columns,
  RotateCcw,
  Sparkles,
  Move,
  Search,
  X,
  Layers,
  Image as ImageIcon,
  SlidersHorizontal
} from 'lucide-react';

interface CompareViewProps {
  rasterUrl: string | null;
  svgString: string | null;
  matBackground?: 'transparent' | 'white' | 'black';
  onSwitchToRaster?: () => void;
  onSwitchToVector?: () => void;
  onTriggerVectorize?: () => void;
  isVectorizing?: boolean;
}

export const CompareView: React.FC<CompareViewProps> = ({
  rasterUrl,
  svgString,
  matBackground = 'transparent',
  onSwitchToRaster,
  onSwitchToVector,
  onTriggerVectorize,
  isVectorizing = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);

  // Synchronized Pan, Zoom & Stretch State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [stretch, setStretch] = useState<{ x: number; y: number }>({ x: 1.0, y: 1.0 });
  const [showStretchMenu, setShowStretchMenu] = useState<boolean>(false);

  // Pan Dragging State (Middle-click or Hand tool)
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const lastPanPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Magnifying Glass Loupe State (OFF by default)
  // Left-click initiates the magnifying glass; a subsequent left-click closes it
  const [isMagnifierVisible, setIsMagnifierVisible] = useState<boolean>(false);
  const [magnifierZoom, setMagnifierZoom] = useState<number>(3.5);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [activePane, setActivePane] = useState<'left' | 'right' | null>(null);

  // Measure natural dimensions of the raster image to ensure exact 1-to-1 aspect ratio and scaling
  const [naturalDims, setNaturalDims] = useState<{ width: number; height: number }>({ width: 500, height: 500 });
  const [hasLoadedDims, setHasLoadedDims] = useState<boolean>(false);

  useEffect(() => {
    if (!rasterUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalDims({ width: img.naturalWidth, height: img.naturalHeight });
        setHasLoadedDims(true);
      }
    };
    img.src = rasterUrl;
  }, [rasterUrl]);

  // Anchor Bounding Box: Locks the visual coordinate frame of the artwork on initial load.
  // When the user deletes objects (e.g. removes white background), moves objects, or resizes objects in Vector Studio,
  // this anchor box remains locked so the remaining vector artwork maintains its exact 1:1 relative positioning with the raster image.
  const anchorBoxRef = useRef<{ minX: number; minY: number; width: number; height: number } | null>(null);
  const lastRasterUrlRef = useRef<string | null>(null);

  // If a new raster image is loaded, reset the anchor box
  if (lastRasterUrlRef.current !== rasterUrl) {
    lastRasterUrlRef.current = rasterUrl;
    anchorBoxRef.current = null;
  }

  // Normalize SVG Data URL:
  // Preserves the master anchor viewBox established from the artwork frame.
  // This guarantees that deletions (e.g. removing white background), moving, and resizing
  // maintain exact 1:1 relative positioning and spatial alignment with the raster image.
  const svgDataUrl = useMemo(() => {
    if (!svgString || svgString.trim().length === 0) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (svgEl) {
        // Measure initial anchor box once on initial load if not already locked
        if (!anchorBoxRef.current && typeof document !== 'undefined') {
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'fixed';
          tempDiv.style.left = '-9999px';
          tempDiv.style.top = '-9999px';
          tempDiv.style.visibility = 'hidden';
          tempDiv.style.pointerEvents = 'none';
          tempDiv.innerHTML = svgString;
          document.body.appendChild(tempDiv);
          try {
            const attachedSvg = tempDiv.querySelector('svg');
            if (attachedSvg) {
              const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              while (attachedSvg.firstChild) {
                g.appendChild(attachedSvg.firstChild);
              }
              attachedSvg.appendChild(g);
              const bbox = g.getBBox();
              if (bbox.width > 5 && bbox.height > 5) {
                anchorBoxRef.current = {
                  minX: Math.floor(bbox.x),
                  minY: Math.floor(bbox.y),
                  width: Math.ceil(bbox.width),
                  height: Math.ceil(bbox.height)
                };
              }
            }
          } catch {
            // getBBox fallback
          } finally {
            document.body.removeChild(tempDiv);
          }
        }

        // Apply locked anchor box or fallback to existing viewBox / naturalDims
        if (anchorBoxRef.current) {
          const ab = anchorBoxRef.current;
          svgEl.setAttribute('viewBox', `${ab.minX} ${ab.minY} ${ab.width} ${ab.height}`);
        } else if (!svgEl.getAttribute('viewBox')) {
          const w = svgEl.getAttribute('width') || String(naturalDims.width);
          const h = svgEl.getAttribute('height') || String(naturalDims.height);
          svgEl.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
        }

        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.setAttribute('preserveAspectRatio', 'none');
        const serialized = new XMLSerializer().serializeToString(svgEl);
        return `data:image/svg+xml;utf8,${encodeURIComponent(serialized)}`;
      }
    } catch (err) {
      console.warn('Error formatting CompareView SVG:', err);
    }
    if (svgString.startsWith('data:')) return svgString;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }, [svgString, naturalDims, rasterUrl]);

  // Compute fixed baseline frame dimensions fitting a 460px maximum box while preserving exact aspect ratio
  const BASE_MAX = 460;
  const frameDimensions = useMemo(() => {
    const aspect = naturalDims.width / naturalDims.height;
    if (aspect >= 1) {
      return {
        width: BASE_MAX,
        height: Math.max(80, Math.round(BASE_MAX / aspect))
      };
    } else {
      return {
        width: Math.max(80, Math.round(BASE_MAX * aspect)),
        height: BASE_MAX
      };
    }
  }, [naturalDims]);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setIsSpacePressed(true);
      }
      if (e.key === 'Escape') {
        setIsMagnifierVisible(false);
        setShowStretchMenu(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Synchronized Mouse Wheel Zooming
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.999 ** e.deltaY;
    setZoom((prevZoom) => {
      const nextZoom = Math.min(8.0, Math.max(0.2, Math.round(prevZoom * zoomFactor * 100) / 100));
      return nextZoom;
    });
  }, []);

  // Zoom Controls
  const handleZoomIn = () => setZoom((z) => Math.min(8.0, Math.round((z + 0.25) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(0.2, Math.round((z - 0.25) * 100) / 100));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setStretch({ x: 1.0, y: 1.0 });
  };

  // Synchronized Panning via Middle-Click Drag
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current) {
        e.preventDefault();
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 1 || isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Helper: Calculate normalized cursor coordinates (0.0 to 1.0) relative to the artwork frame
  const getArtworkNormCoord = (clientX: number, clientY: number, pane: 'left' | 'right') => {
    const paneEl = pane === 'left' ? leftPaneRef.current : rightPaneRef.current;
    if (!paneEl) return null;
    const rect = paneEl.getBoundingClientRect();
    const cursorPaneX = clientX - rect.left;
    const cursorPaneY = clientY - rect.top;

    const paneWidth = paneEl.clientWidth;
    const paneHeight = paneEl.clientHeight;

    // Rendered frame dimensions
    const renderedW = frameDimensions.width * zoom * stretch.x;
    const renderedH = frameDimensions.height * zoom * stretch.y;

    // Center of artwork frame in pane coordinates
    const centerX = paneWidth / 2 + pan.x;
    const centerY = paneHeight / 2 + pan.y;

    // Frame top-left
    const frameLeft = centerX - renderedW / 2;
    const frameTop = centerY - renderedH / 2;

    const relX = cursorPaneX - frameLeft;
    const relY = cursorPaneY - frameTop;

    const normX = relX / renderedW;
    const normY = relY / renderedH;

    const isInside = normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1;

    return {
      paneX: cursorPaneX,
      paneY: cursorPaneY,
      normX,
      normY,
      isInside,
      renderedW,
      renderedH
    };
  };

  // Track cursor position inside either pane to place magnifying loupes
  const handlePaneMouseMove = (e: React.MouseEvent<HTMLDivElement>, pane: 'left' | 'right') => {
    const paneEl = pane === 'left' ? leftPaneRef.current : rightPaneRef.current;
    if (!paneEl) return;
    const rect = paneEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    setActivePane(pane);
  };

  const handlePaneMouseLeave = () => {
    // If magnifier is closed, clear mouse position
    if (!isMagnifierVisible) {
      setMousePos(null);
      setActivePane(null);
    }
  };

  // Left-Click Handler:
  // - Left click initiates the magnifying glass tool
  // - A subsequent left click closes the magnifying glass tool
  const handlePaneMouseDown = (e: React.MouseEvent<HTMLDivElement>, pane: 'left' | 'right') => {
    // Middle click or Space+click: start synchronized panning
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
      e.preventDefault();
      e.stopPropagation();
      isPanningRef.current = true;
      setIsPanning(true);
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Left click
    if (e.button === 0) {
      if (isMagnifierVisible) {
        // Subsequent left click closes the magnifying glass tool
        setIsMagnifierVisible(false);
        setMousePos(null);
        setActivePane(null);
        return;
      }

      // Left click initiates the magnifying glass tool
      const coord = getArtworkNormCoord(e.clientX, e.clientY, pane);
      if (!coord) return;

      if (coord.isInside) {
        setIsMagnifierVisible(true);
        setMousePos({ x: coord.paneX, y: coord.paneY });
        setActivePane(pane);
      }
    }
  };

  // Dimensions of magnifying loupe
  const LENS_RADIUS = 90; // 180px diameter
  const LENS_DIAMETER = LENS_RADIUS * 2;

  // Calculate synchronized magnifying glass parameters
  const getLensStyle = (pane: 'left' | 'right') => {
    if (!mousePos) return null;
    const paneEl = pane === 'left' ? leftPaneRef.current : rightPaneRef.current;
    if (!paneEl) return null;

    const paneWidth = paneEl.clientWidth;
    const paneHeight = paneEl.clientHeight;

    // Rendered artwork frame dimensions
    const renderedW = frameDimensions.width * zoom * stretch.x;
    const renderedH = frameDimensions.height * zoom * stretch.y;

    const centerX = paneWidth / 2 + pan.x;
    const centerY = paneHeight / 2 + pan.y;

    const frameLeft = centerX - renderedW / 2;
    const frameTop = centerY - renderedH / 2;

    const relX = mousePos.x - frameLeft;
    const relY = mousePos.y - frameTop;

    const normX = relX / renderedW;
    const normY = relY / renderedH;

    // Inside the lens, the magnified image has dimensions:
    const lensArtW = renderedW * magnifierZoom;
    const lensArtH = renderedH * magnifierZoom;

    // Place the target coordinate (normX, normY) directly at the lens center (LENS_RADIUS, LENS_RADIUS)
    const contentLeft = LENS_RADIUS - normX * lensArtW;
    const contentTop = LENS_RADIUS - normY * lensArtH;

    return {
      lensX: mousePos.x,
      lensY: mousePos.y,
      contentLeft,
      contentTop,
      contentWidth: lensArtW,
      contentHeight: lensArtH
    };
  };

  const leftLens = isMagnifierVisible && mousePos ? getLensStyle('left') : null;
  const rightLens = isMagnifierVisible && mousePos ? getLensStyle('right') : null;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={`relative w-full h-full flex flex-col overflow-hidden select-none ${
        matBackground === 'transparent'
          ? 'cricut-grid-bg'
          : matBackground === 'white'
          ? 'bg-white'
          : 'bg-slate-950'
      } ${
        isPanning || isSpacePressed
          ? 'cursor-grabbing'
          : isMagnifierVisible
          ? 'cursor-zoom-out'
          : 'cursor-zoom-in'
      }`}
    >
      {/* Top Banner Status Bar */}
      <div className="h-9 px-4 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between text-xs z-20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-purple-50 text-purple-600">
            <Columns className="w-3.5 h-3.5" />
          </span>
          <span className="font-extrabold text-slate-800">Side-by-Side Comparison</span>
          <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
            • 1:1 Synchronized Scale &amp; Stretch • Left-click to inspect, left-click again to close
          </span>
        </div>

        {/* Magnifier HUD Badge & Power Selector */}
        {isMagnifierVisible && (
          <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold animate-in fade-in">
            <Search className="w-3 h-3 text-purple-600" />
            <span>Magnifier:</span>
            {[2, 3.5, 5, 8].map((lvl) => (
              <button
                key={lvl}
                onClick={(e) => {
                  e.stopPropagation();
                  setMagnifierZoom(lvl);
                }}
                className={`px-1.5 py-0.2 rounded cursor-pointer transition-colors ${
                  magnifierZoom === lvl
                    ? 'bg-purple-600 text-white font-extrabold shadow-2xs'
                    : 'text-purple-600 hover:bg-purple-100'
                }`}
              >
                {lvl}×
              </button>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMagnifierVisible(false);
              }}
              className="ml-1 text-purple-400 hover:text-purple-800 cursor-pointer p-0.5 rounded"
              title="Close Magnifier (Esc or Left-Click)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Main Dual-Pane Comparison Stage */}
      <div className="flex-1 w-full h-full flex relative overflow-hidden">
        {/* LEFT PANE: RASTER SOURCE */}
        <div
          ref={leftPaneRef}
          onMouseMove={(e) => handlePaneMouseMove(e, 'left')}
          onMouseDown={(e) => handlePaneMouseDown(e, 'left')}
          onMouseLeave={handlePaneMouseLeave}
          className="flex-1 h-full relative overflow-hidden flex items-center justify-center border-r border-slate-300"
        >
          {/* Header Tag */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-200 shadow-xs pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-[11px] text-slate-700">Original Raster Image</span>
            {hasLoadedDims && (
              <span className="text-[10px] text-slate-400 font-mono">
                ({naturalDims.width}×{naturalDims.height})
              </span>
            )}
          </div>

          {/* Raster Artwork Content Frame (Exact Synchronized Scale & Stretch) */}
          <div
            style={{
              width: `${frameDimensions.width * stretch.x}px`,
              height: `${frameDimensions.height * stretch.y}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
            className="flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out shadow-md rounded-sm bg-white/20"
          >
            {rasterUrl ? (
              <img
                src={rasterUrl}
                alt="Original Raster"
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill'
                }}
                className="pointer-events-none rounded-sm"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <ImageIcon className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-xs font-semibold">No raster artwork loaded</p>
              </div>
            )}
          </div>

          {/* LEFT LOUPE (MAGNIFYING GLASS) */}
          {isMagnifierVisible && leftLens && rasterUrl && (
            <div
              style={{
                left: leftLens.lensX,
                top: leftLens.lensY,
                width: LENS_DIAMETER,
                height: LENS_DIAMETER
              }}
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-500 shadow-2xl overflow-hidden bg-white/90 z-30 ring-4 ring-black/20"
            >
              {/* Magnified Image Inside Lens */}
              <div
                style={{
                  position: 'absolute',
                  left: leftLens.contentLeft,
                  top: leftLens.contentTop,
                  width: leftLens.contentWidth,
                  height: leftLens.contentHeight
                }}
                className="pointer-events-none"
              >
                <img
                  src={rasterUrl}
                  alt="Magnified Raster"
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    imageRendering: 'pixelated'
                  }}
                />
              </div>

              {/* Lens Crosshair Target */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                <div className="w-full h-px bg-emerald-700" />
                <div className="h-full w-px bg-emerald-700 absolute" />
              </div>

              {/* Lens HUD Tag */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-slate-900/85 backdrop-blur-md text-emerald-400 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full pointer-events-none flex items-center gap-1 shadow-sm">
                <span>Raster: {magnifierZoom.toFixed(1)}×</span>
              </div>
            </div>
          )}
        </div>

        {/* CENTER DIVIDER BADGE */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="w-7 h-7 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-[10px] font-extrabold text-slate-600 uppercase tracking-tighter">
            vs
          </div>
        </div>

        {/* RIGHT PANE: VECTOR STUDIO */}
        <div
          ref={rightPaneRef}
          onMouseMove={(e) => handlePaneMouseMove(e, 'right')}
          onMouseDown={(e) => handlePaneMouseDown(e, 'right')}
          onMouseLeave={handlePaneMouseLeave}
          className="flex-1 h-full relative overflow-hidden flex items-center justify-center"
        >
          {/* Header Tag */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-200 shadow-xs pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <span className="font-bold text-[11px] text-slate-700">Cricut Cut-Ready Vectors (SVG)</span>
            {hasLoadedDims && (
              <span className="text-[10px] text-slate-400 font-mono">
                ({naturalDims.width}×{naturalDims.height})
              </span>
            )}
          </div>

          {/* Vector Artwork Content Frame (Exact Synchronized Scale & Stretch) */}
          <div
            style={{
              width: `${frameDimensions.width * stretch.x}px`,
              height: `${frameDimensions.height * stretch.y}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
            className="flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out shadow-md rounded-sm bg-white/20"
          >
            {svgDataUrl ? (
              <img
                src={svgDataUrl}
                alt="Converted Vector SVG"
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill'
                }}
                className="pointer-events-none rounded-sm"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 max-w-xs">
                <Layers className="w-10 h-10 mb-2 text-indigo-400 opacity-60" />
                <h4 className="text-xs font-bold text-slate-700">No Vector Conversion Yet</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Convert your image into SVG vector paths to inspect Cricut cutlines side-by-side.
                </p>
                {onTriggerVectorize && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTriggerVectorize();
                    }}
                    disabled={isVectorizing}
                    className="mt-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 pointer-events-auto"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isVectorizing ? 'Vectorizing...' : 'Convert to SVG Vectors'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT LOUPE (MAGNIFYING GLASS) */}
          {isMagnifierVisible && rightLens && svgDataUrl && (
            <div
              style={{
                left: rightLens.lensX,
                top: rightLens.lensY,
                width: LENS_DIAMETER,
                height: LENS_DIAMETER
              }}
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-500 shadow-2xl overflow-hidden bg-white/90 z-30 ring-4 ring-black/20"
            >
              {/* Magnified Image Inside Lens */}
              <div
                style={{
                  position: 'absolute',
                  left: rightLens.contentLeft,
                  top: rightLens.contentTop,
                  width: rightLens.contentWidth,
                  height: rightLens.contentHeight
                }}
                className="pointer-events-none"
              >
                <img
                  src={svgDataUrl}
                  alt="Magnified Vector"
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill'
                  }}
                />
              </div>

              {/* Lens Crosshair Target */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                <div className="w-full h-px bg-indigo-700" />
                <div className="h-full w-px bg-indigo-700 absolute" />
              </div>

              {/* Lens HUD Tag */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-slate-900/85 backdrop-blur-md text-indigo-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full pointer-events-none flex items-center gap-1 shadow-sm">
                <span>Vector: {magnifierZoom.toFixed(1)}×</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Toolbar for Locked Zoom, Synchronized Stretch & Magnifier Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl px-2.5 py-1.5 gap-2 select-none">
        {/* Pan Hand Tool Indicator */}
        <button
          onClick={() => setIsPanning(!isPanning)}
          className={`p-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold ${
            isPanning ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Pan locked view (or drag with Middle Mouse Button)"
        >
          <Move className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pan</span>
        </button>

        <div className="h-4 w-px bg-slate-200" />

        {/* Magnifier Toggle Button */}
        <button
          onClick={() => setIsMagnifierVisible(!isMagnifierVisible)}
          className={`px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold ${
            isMagnifierVisible
              ? 'bg-purple-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Toggle Magnifying Glass (Left-click image to inspect, left-click again to close)"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{isMagnifierVisible ? `${magnifierZoom.toFixed(1)}× Lens` : 'Magnifier'}</span>
        </button>

        <div className="h-4 w-px bg-slate-200" />

        {/* Synchronized Stretch Adjustment Popover Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowStretchMenu(!showStretchMenu)}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold ${
              stretch.x !== 1.0 || stretch.y !== 1.0
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Adjust Synchronized Image Stretch (applies identically to both images)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              Stretch {stretch.x !== 1.0 || stretch.y !== 1.0 ? `(${stretch.x.toFixed(1)}×, ${stretch.y.toFixed(1)}×)` : ''}
            </span>
          </button>

          {/* Stretch Settings Popover */}
          {showStretchMenu && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-3 w-56 space-y-3 z-30 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800 pb-1 border-b border-slate-100">
                <span>Synchronized Stretch</span>
                <button
                  onClick={() => setShowStretchMenu(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Stretch Width (X) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span>Width Stretch (X):</span>
                  <span className="font-mono text-indigo-600 font-bold">{stretch.x.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={stretch.x}
                  onChange={(e) => setStretch((s) => ({ ...s, x: parseFloat(e.target.value) }))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Stretch Height (Y) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  <span>Height Stretch (Y):</span>
                  <span className="font-mono text-indigo-600 font-bold">{stretch.y.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={stretch.y}
                  onChange={(e) => setStretch((s) => ({ ...s, y: parseFloat(e.target.value) }))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              {/* Stretch Quick Actions */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <button
                  onClick={() => setStretch({ x: 1.0, y: 1.0 })}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                >
                  Reset (1:1)
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStretch({ x: 1.25, y: 1.0 })}
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer"
                  >
                    +25% W
                  </button>
                  <button
                    onClick={() => setStretch({ x: 1.0, y: 1.25 })}
                    className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer"
                  >
                    +25% H
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-slate-200" />

        {/* Locked Zoom Controls */}
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom out both views"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleResetZoom}
          className="px-2 py-1 rounded-xl text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom in both views"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
