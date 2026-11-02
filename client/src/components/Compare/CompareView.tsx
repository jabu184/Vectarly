import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Columns,
  Sparkles,
  Search,
  X,
  Layers,
  Image as ImageIcon,
  Eye
} from 'lucide-react';

interface CompareViewProps {
  rasterUrl: string | null;
  svgString: string | null;
  matBackground?: 'transparent' | 'white' | 'black';
  onChangeMatBackground?: (bg: 'transparent' | 'white' | 'black') => void;
  onSwitchToRaster?: () => void;
  onSwitchToVector?: () => void;
  onTriggerVectorize?: () => void;
  isVectorizing?: boolean;
}

export const CompareView: React.FC<CompareViewProps> = ({
  rasterUrl,
  svgString,
  matBackground = 'transparent',
  onChangeMatBackground,
  onSwitchToRaster,
  onSwitchToVector,
  onTriggerVectorize,
  isVectorizing = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);

  // Background Preview Mode (Transparent, White, Black)
  const [localMatBackground, setLocalMatBackground] = useState<'transparent' | 'white' | 'black'>(matBackground);

  useEffect(() => {
    setLocalMatBackground(matBackground);
  }, [matBackground]);

  const handleSelectBackground = (bg: 'transparent' | 'white' | 'black') => {
    setLocalMatBackground(bg);
    if (onChangeMatBackground) {
      onChangeMatBackground(bg);
    }
  };

  // Synchronized Pan & Zoom State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan Dragging State (Left-click, Middle-click, or Touch drag by default)
  const [isDraggingPan, setIsDraggingPan] = useState<boolean>(false);
  const isDraggingPanRef = useRef<boolean>(false);
  const lastPanPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasMiddlePannedRef = useRef<boolean>(false);
  const lastMiddleClickTimeRef = useRef<number>(0);

  // Touch Gesture Tracking for Compare View
  const isTouchPinchingRef = useRef<boolean>(false);
  const initialTouchDistRef = useRef<number>(0);
  const initialTouchZoomRef = useRef<number>(1.0);
  const lastTouchPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Magnifying Glass Loupe State (OFF by default)
  // Double-clicking either pane toggles the magnifying glass on/off
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

  // Normalize SVG Data URL:
  // Preserves exact viewBox and aspect ratio so vector artwork aligns 1:1 with raster image
  const svgDataUrl = useMemo(() => {
    if (!svgString || svgString.trim().length === 0) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (svgEl) {
        if (!svgEl.getAttribute('viewBox')) {
          const w = svgEl.getAttribute('width') || String(naturalDims.width);
          const h = svgEl.getAttribute('height') || String(naturalDims.height);
          svgEl.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
        }

        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        const serialized = new XMLSerializer().serializeToString(svgEl);
        return `data:image/svg+xml;utf8,${encodeURIComponent(serialized)}`;
      }
    } catch (err) {
      console.warn('Error formatting CompareView SVG:', err);
    }
    if (svgString.startsWith('data:')) return svgString;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
  }, [svgString, naturalDims]);

  // Compute fixed baseline frame dimensions fitting a 460px maximum box while preserving exact aspect ratio
  const BASE_MAX = 460;
  const frameDimensions = useMemo(() => {
    const w = naturalDims.width || 500;
    const h = naturalDims.height || 500;
    const aspect = w / h;
    if (aspect >= 1) {
      return {
        width: BASE_MAX,
        height: BASE_MAX / aspect
      };
    } else {
      return {
        width: BASE_MAX * aspect,
        height: BASE_MAX
      };
    }
  }, [naturalDims]);

  // Reset View to original 100% zoom and center (0,0 pan)
  const handleResetView = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMagnifierVisible(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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
  };

  // Synchronized Panning via Middle-Click Drag, Left-Click Drag, or Touch Drag
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingPanRef.current) {
        e.preventDefault();
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        if (Math.hypot(dx, dy) > 2) {
          hasMiddlePannedRef.current = true;
        }
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        if (!hasMiddlePannedRef.current) {
          const now = Date.now();
          const timeDiff = now - lastMiddleClickTimeRef.current;
          if (timeDiff > 25 && timeDiff < 550) {
            lastMiddleClickTimeRef.current = 0;
            handleResetView();
          } else {
            lastMiddleClickTimeRef.current = now;
          }
        }
      }
      if (e.button === 1 || isDraggingPanRef.current) {
        isDraggingPanRef.current = false;
        setIsDraggingPan(false);
      }
    };

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('auxclick', handleAuxClick);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('auxclick', handleAuxClick);
    };
  }, [handleResetView]);

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
    const renderedW = frameDimensions.width * zoom;
    const renderedH = frameDimensions.height * zoom;

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
    if (!isMagnifierVisible) {
      setMousePos(null);
      setActivePane(null);
    }
  };

  // Left-Click & Middle-Click Handler:
  // - Double middle-click: restores original pan (0,0) and zoom (1.0)
  // - Left-click and Middle-click drag: pans both images simultaneously by default!
  const handlePaneMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Middle-click (1): check double middle-click to reset view
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      hasMiddlePannedRef.current = false;
      const now = Date.now();
      const timeDiff = now - lastMiddleClickTimeRef.current;
      if (timeDiff > 25 && timeDiff < 550) {
        lastMiddleClickTimeRef.current = 0;
        handleResetView();
        return;
      }
      lastMiddleClickTimeRef.current = now;
    }

    // Left-click (0) or Middle-click (1): pan by default!
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      isDraggingPanRef.current = true;
      setIsDraggingPan(true);
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  // Double-Click Handler:
  // Double left clicking switches the magnifying glass loupe ON and OFF!
  const handlePaneDoubleClick = (e: React.MouseEvent<HTMLDivElement>, pane: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    if (isMagnifierVisible) {
      setIsMagnifierVisible(false);
      setMousePos(null);
      setActivePane(null);
    } else {
      const coord = getArtworkNormCoord(e.clientX, e.clientY, pane);
      if (!coord) return;
      setIsMagnifierVisible(true);
      setMousePos({ x: coord.paneX, y: coord.paneY });
      setActivePane(pane);
    }
  };

  // Touch Gesture Handlers (Pinch to zoom & Touch drag to pan on hands-free/touch devices)
  const handleStageTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isTouchPinchingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      initialTouchDistRef.current = dist > 0 ? dist : 1;
      initialTouchZoomRef.current = zoom;
      lastTouchPosRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
      };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchPosRef.current = { x: t.clientX, y: t.clientY };
      isDraggingPanRef.current = true;
      setIsDraggingPan(true);
    }
  };

  const handleStageTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && isTouchPinchingRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      // Pan delta
      const dx = midX - lastTouchPosRef.current.x;
      const dy = midY - lastTouchPosRef.current.y;
      lastTouchPosRef.current = { x: midX, y: midY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));

      // Pinch zoom
      if (initialTouchDistRef.current > 0) {
        const scale = dist / initialTouchDistRef.current;
        let newZoom = initialTouchZoomRef.current * scale;
        if (newZoom > 8) newZoom = 8;
        if (newZoom < 0.2) newZoom = 0.2;
        setZoom(Math.round(newZoom * 100) / 100);
      }
    } else if (e.touches.length === 1 && isDraggingPanRef.current) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - lastTouchPosRef.current.x;
      const dy = t.clientY - lastTouchPosRef.current.y;
      lastTouchPosRef.current = { x: t.clientX, y: t.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    }
  };

  const handleStageTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      isTouchPinchingRef.current = false;
      initialTouchDistRef.current = 0;
    }
    if (e.touches.length === 0) {
      isDraggingPanRef.current = false;
      setIsDraggingPan(false);
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
    const renderedW = frameDimensions.width * zoom;
    const renderedH = frameDimensions.height * zoom;

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
        localMatBackground === 'transparent'
          ? 'cricut-grid-bg'
          : localMatBackground === 'white'
          ? 'bg-white'
          : 'bg-slate-950'
      } ${
        isDraggingPan
          ? 'cursor-grabbing'
          : 'cursor-grab'
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
            • 1:1 Synchronized Scale • Drag to pan, Double-click to magnify
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
              title="Close Magnifier (Esc or Double-Click)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Main Dual-Pane Comparison Stage */}
      <div
        className="flex-1 w-full h-full flex relative overflow-hidden compare-stage"
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        onTouchCancel={handleStageTouchEnd}
      >
        {/* LEFT PANE: RASTER SOURCE */}
        <div
          ref={leftPaneRef}
          onMouseMove={(e) => handlePaneMouseMove(e, 'left')}
          onMouseDown={handlePaneMouseDown}
          onDoubleClick={(e) => handlePaneDoubleClick(e, 'left')}
          onMouseLeave={handlePaneMouseLeave}
          className={`flex-1 h-full relative overflow-hidden flex items-center justify-center ${
            isDraggingPan ? 'cursor-grabbing' : 'cursor-grab'
          }`}
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

          {/* Raster Artwork Content Frame (Exact Synchronized Scale) */}
          <div
            style={{
              width: `${frameDimensions.width}px`,
              height: `${frameDimensions.height}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
            className="flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out rounded-sm"
          >
            {rasterUrl ? (
              <img
                src={rasterUrl}
                alt="Original Raster"
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
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
              className={`absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-500 shadow-2xl overflow-hidden z-30 ring-4 ring-black/20 ${
                localMatBackground === 'transparent'
                  ? 'cricut-grid-bg bg-white'
                  : localMatBackground === 'white'
                  ? 'bg-white'
                  : 'bg-slate-950'
              }`}
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
                    objectFit: 'contain',
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

        {/* CENTER DIVIDER LINE & BADGE */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-slate-300 z-10 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="w-7 h-7 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-[10px] font-extrabold text-slate-600 uppercase tracking-tighter">
            vs
          </div>
        </div>

        {/* RIGHT PANE: VECTOR STUDIO */}
        <div
          ref={rightPaneRef}
          onMouseMove={(e) => handlePaneMouseMove(e, 'right')}
          onMouseDown={handlePaneMouseDown}
          onDoubleClick={(e) => handlePaneDoubleClick(e, 'right')}
          onMouseLeave={handlePaneMouseLeave}
          className={`flex-1 h-full relative overflow-hidden flex items-center justify-center ${
            isDraggingPan ? 'cursor-grabbing' : 'cursor-grab'
          }`}
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

          {/* Vector Artwork Content Frame (Exact Synchronized Scale) */}
          <div
            style={{
              width: `${frameDimensions.width}px`,
              height: `${frameDimensions.height}px`,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
            className="flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out rounded-sm"
          >
            {svgDataUrl ? (
              <img
                src={svgDataUrl}
                alt="Converted Vector SVG"
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
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
              className={`absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-indigo-500 shadow-2xl overflow-hidden z-30 ring-4 ring-black/20 ${
                localMatBackground === 'transparent'
                  ? 'cricut-grid-bg bg-white'
                  : localMatBackground === 'white'
                  ? 'bg-white'
                  : 'bg-slate-950'
              }`}
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
                    objectFit: 'contain'
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

      {/* Floating Bottom Toolbar for Locked Zoom, Reset View (Eye), Background Mode & Magnifier */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl px-2.5 py-1.5 gap-2 select-none">
        {/* Background Preview Mode Toggle (Transparent / White / Black) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 mr-1">
          <button
            type="button"
            onClick={() => handleSelectBackground('transparent')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              localMatBackground === 'transparent'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Transparent Background (Checkerboard preview)"
          >
            <span className="w-2.5 h-2.5 rounded-full border border-slate-300 cricut-grid-bg inline-block" />
            <span className="hidden sm:inline">Transp</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectBackground('white')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              localMatBackground === 'white'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Solid White Mat Preview"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300 inline-block" />
            <span className="hidden sm:inline">White</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectBackground('black')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              localMatBackground === 'black'
                ? 'bg-white text-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="Solid Black Mat Preview (Ideal for white vinyl & line art)"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700 inline-block" />
            <span className="hidden sm:inline">Black</span>
          </button>
        </div>

        <div className="h-4 w-px bg-slate-200" />

        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom out both views"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Level Indicator */}
        <button
          type="button"
          onClick={() => setZoom(1.0)}
          className="px-2 py-1 rounded-xl text-xs font-mono font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>

        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-1.5 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Zoom in both views"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Reset View / Center Artwork (Eye - Same as double middle-click) */}
        <button
          type="button"
          onClick={handleResetView}
          className="p-1.5 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
          title="Reset View / Fit to Screen (Same as double middle-click)"
        >
          <Eye className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-200" />

        {/* Toggle Magnifier Icon */}
        <button
          type="button"
          onClick={() => setIsMagnifierVisible(!isMagnifierVisible)}
          className={`p-1.5 rounded-xl transition-all cursor-pointer ${
            isMagnifierVisible
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-purple-600'
          }`}
          title={isMagnifierVisible ? 'Turn off Magnifier (Double-click image or click here)' : 'Turn on Magnifier (Double-click image or click here)'}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
