import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header/Header';
import { PromptBar } from './components/Toolbar/PromptBar';
import { StudioActionBar } from './components/Toolbar/StudioActionBar';
import { CanvasViewport } from './components/Canvas/CanvasViewport';
import { RasterInspector } from './components/Toolbar/RasterInspector';
import { VectorInspector } from './components/Palette/VectorInspector';
import { CompareInspector } from './components/Compare/CompareInspector';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import { AboutModal } from './components/AboutModal';
import { FlattenProgressOverlay } from './components/Canvas/FlattenProgressOverlay';
import { CanvasContextMenu } from './components/Canvas/CanvasContextMenu';
import { getStoredCustomColors } from './services/customPalette';
import { type PenInfillOptions } from './services/penInfill';
import { useFabricCanvas, type CanvasMode } from './hooks/useFabricCanvas';
import { useBackgroundRemover } from './hooks/useBackgroundRemover';
import {
  generateImage,
  vectorizeImage,
  fetchSamples,
  isUsingCustomApiKey,
  type VectorStats
} from './services/api';
import confetti from 'canvas-confetti';

export function App() {
  const {
    canvasRef,
    containerRef,
    mode,
    setMode,
    zoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    recenterArtwork,
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
    setLineArtPenWidth,
    setLineArtColorMode,
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
    saveCurrentVectorSnapshot,
    // Cropping Suite
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
    // Display Preferences & Units
    units,
    setUnits,
    toggleUnits,
    matBackground,
    setMatBackground,
    showRulers,
    setShowRulers,
    cursorPos,
    // Dynamic Color Mats & Selection
    colorLayers,
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
    // Vinyl Cutting Readiness & Weed Check Engine
    vinylSettings,
    setVinylSettings,
    isWeedCheckActive,
    toggleWeedCheck,
    weedCheckReport,
    runWeedCheck,
    remediateCanvasVectors,
    isRemediating,
    canvasViewportInfo,
    brushMode,
    setBrushMode,
    brushSize,
    setBrushSize,
    activeBrushColor,
    setActiveBrushColor,
    isResizingBrush,
    brushResizePos,
    outlineSmoothing,
    setOutlineSmoothing,
    compareData,
    exportProjectJSON,
    loadProjectJSON
  } = useFabricCanvas();

  const { removeBg, isRemoving: isRemovingBg, progress: bgProgress, statusText: bgStatusText } = useBackgroundRemover();

  // App State
  const [currentProjectName, setCurrentProjectName] = useState<string>('My Design');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('Bold Die-Cut Sticker');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [isVectorizing, setIsVectorizing] = useState<boolean>(false);
  const [vectorStats, setVectorStats] = useState<VectorStats | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isCustomKeyActive, setIsCustomKeyActive] = useState<boolean>(isUsingCustomApiKey());
  const [customColors, setCustomColors] = useState<string[]>(getStoredCustomColors);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'info' | 'warning' | 'success';
    message: string;
  } | null>(null);

  // Download helper utility
  const triggerDownload = (data: string, filename: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Phase 1: Handle AI Concept Generation
   */
  const handleGenerate = async (prompt: string, aspectRatio: '1:1' | '4:5' | '16:9', stylePreset: string) => {
    setIsGenerating(true);
    setActivePrompt(prompt);
    setCurrentProjectName(prompt.slice(0, 28).trim() || 'Cricut Design');
    setStatusBanner(null);

    try {
      const res = await generateImage({
        prompt,
        aspectRatio,
        stylePreset
      });

      if (res.image.startsWith('data:image/svg+xml') || res.image.startsWith('<svg')) {
        let svgStr = res.image;
        if (svgStr.startsWith('data:image/svg+xml;utf8,')) {
          svgStr = decodeURIComponent(svgStr.replace('data:image/svg+xml;utf8,', ''));
        } else if (svgStr.startsWith('data:image/svg+xml;base64,')) {
          svgStr = atob(svgStr.replace('data:image/svg+xml;base64,', ''));
        }
        await loadVectorSvg(svgStr, true);
        setMode('vector');
        setStatusBanner({
          type: 'success',
          message: `${res.model || 'Gemini 3.6 Flash'} generated crisp SVG vector artwork! Adjust vinyl mats & detail below.`
        });
      } else {
        await loadRasterImage(res.image, true);
        setMode('raster');
        setStatusBanner({
          type: 'success',
          message: 'Loaded high-detail Cricut concept artwork! Ready to crop, vectorize & swap vinyl colors.'
        });
      }
    } catch (err: any) {
      console.error('Generation failed:', err);
      // Fallback directly to Vectarly logo
      await loadRasterImage('/samples/vectarly-logo.jpg');
      setMode('raster');
      setStatusBanner({
        type: 'info',
        message: 'Loaded high-detail Cricut concept artwork! (You can configure a custom Gemini key in Settings).'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Project Save & Load Engine
   */
  const handleSaveProject = () => {
    if (!hasVector && !hasImage) {
      setStatusBanner({
        type: 'warning',
        message: 'No artwork on canvas to save yet. Import an image or generate vector cutlines first.'
      });
      return;
    }

    const jsonStr = exportProjectJSON(currentProjectName);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const baseName = currentProjectName ? currentProjectName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'vectarly-project';
    const filename = `${baseName}-${dateStr}.vectarly`;

    triggerDownload(jsonStr, filename, 'application/json');
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.1 }
    });
    setStatusBanner({
      type: 'success',
      message: `Project saved as "${filename}"! You can load this file anytime or transfer it to another PC.`
    });
  };

  /**
   * Phase 2: Client-Side Background Removal
   */
  const handleRemoveBackground = async () => {
    try {
      const currentDataUrl = getRasterDataUrl();
      if (!currentDataUrl) return;

      pushUndoSnapshot();

      const transparentPng = await removeBg(currentDataUrl);
      await loadRasterImage(transparentPng);

      setStatusBanner({
        type: 'success',
        message: 'Background removed! Ready for Cricut vectorization.'
      });
    } catch (err: any) {
      console.error('Background removal failed:', err);
      setStatusBanner({
        type: 'warning',
        message: `Background removal: ${err?.message || 'Could not process background.'}`
      });
    }
  };

  /**
   * Phase 3: Server-Side Vector Conversion with VTracer
   */
  const handleVectorize = async (options: {
    mode: 'spline' | 'polygon';
    hierarchical: 'cutout' | 'stacked';
    filterSpeckle: number;
    colorPrecision: number;
    maxColors: number;
    simplify: number;
  }) => {
    setIsVectorizing(true);
    try {
      const currentRaster = getRasterDataUrl();
      if (!currentRaster) {
        throw new Error('No raster image found on canvas');
      }

      pushUndoSnapshot();

      const res = await vectorizeImage({
        image: currentRaster,
        ...options
      });

      if (res.success && res.svg) {
        setVectorStats(res.stats);
        await loadVectorSvg(res.svg, true);
        setMode('vector');

        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.2 }
        });

        setStatusBanner({
          type: 'success',
          message: `Vectorized into ${res.stats.colorCount} Cricut vinyl mats (${res.stats.pathCount} paths, ${res.stats.nodeCount} smooth nodes)!`
        });
      } else {
        throw new Error(res.error || 'Vectorization failed');
      }
    } catch (err: any) {
      console.error('Vectorization error:', err);
      setStatusBanner({
        type: 'warning',
        message: `Vector conversion error: ${err?.message || 'Could not vectorize image'}`
      });
    } finally {
      setIsVectorizing(false);
    }
  };

  const handleOpenProject = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleLoadProjectFile = (file: File) => {
    const isImage = file.type.startsWith('image/') && !file.type.includes('svg');
    const isImageExt = /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
    if (isImage || isImageExt) {
      handleUploadImage(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const isSvgFile =
        file.name.toLowerCase().endsWith('.svg') ||
        content.trim().startsWith('<svg') ||
        content.trim().startsWith('<?xml');

      if (isSvgFile) {
        await loadVectorSvg(content, true);
        setMode('vector');
        setCurrentProjectName(file.name.replace(/\.svg$/i, ''));
        setStatusBanner({
          type: 'success',
          message: `Loaded SVG file "${file.name}" with full vector layers!`
        });
        return;
      }

      const result = await loadProjectJSON(content, mode);
      if (result.success) {
        if (result.mode) {
          setMode(result.mode);
        }
        setCurrentProjectName(file.name.replace(/\.(vectarly|json)$/i, ''));
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.1 }
        });
        setStatusBanner({
          type: 'success',
          message: `Project "${result.title || file.name}" loaded successfully with all layers & vector paths!`
        });
      } else {
        setStatusBanner({
          type: 'warning',
          message: `Could not load project: ${result.error || 'Invalid project file format'}`
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoadProjectFile(file);
    }
  };

  /**
   * Handle Manual Image Upload:
   * Imports raster image onto canvas in raster cleanup mode without auto-converting.
   * User can click "Convert to SVG Vectors" when ready.
   */
  const handleUploadImage = (file: File) => {
    if (
      file.name.toLowerCase().endsWith('.vectarly') ||
      file.name.toLowerCase().endsWith('.json') ||
      file.name.toLowerCase().endsWith('.svg')
    ) {
      handleLoadProjectFile(file);
      return;
    }
    setCurrentProjectName(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await loadRasterImage(dataUrl, true);
      setMode('raster');

      setStatusBanner({
        type: 'info',
        message: `Imported "${file.name}". Ready to crop, vectorize & swap vinyl colors.`
      });
    };
    reader.readAsDataURL(file);
  };

  /**
   * Switch workspace mode
   */
  const handleSetMode = async (nextMode: CanvasMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'raster') {
      if (mode === 'vector') {
        saveCurrentVectorSnapshot();
      }
      if (hasImage) {
        await switchToRasterMode();
      }
      setMode('raster');
    } else if (nextMode === 'vector') {
      if (hasVector) {
        await switchToVectorMode();
      }
      setMode('vector');
    } else if (nextMode === 'compare') {
      if (mode === 'vector') {
        saveCurrentVectorSnapshot();
      }
      setMode('compare');
    }
  };

  /**
   * Load Curated Samples
   */
  const handleSelectSample = async (sampleKey: string, isInitialMount = false) => {
    try {
      if (sampleKey === 'vectarly') {
        setCurrentProjectName('Vectarly Logo');
        await loadRasterImage('/samples/vectarly-logo.jpg', !isInitialMount);
        setMode('raster');
        setStatusBanner({
          type: 'info',
          message: 'Loaded Vectarly Logo! Click "Convert to SVG Vectors" to vectorize into clean cut mats.'
        });
        return;
      }

      const data = await fetchSamples();
      const sample = data.samples[sampleKey];
      if (sample) {
        setCurrentProjectName(sample.title || sampleKey);
        await loadRasterImage(sample.dataUrl, true);
        setMode('raster');
        setStatusBanner({
          type: 'info',
          message: `Loaded sample: "${sample.title}". Click "Convert to SVG Vectors" to vectorize!`
        });
      }
    } catch (err) {
      console.error('Error loading sample:', err);
      await loadRasterImage('/samples/vectarly-logo.jpg', false);
    }
  };

  /**
   * Phase 5: Exporting Functions
   */
  const handleExportSvg = (options?: { isLineArt?: boolean; penInfill?: PenInfillOptions }) => {
    const svgData = exportSvg(options);
    if (!svgData) return;
    const suffix = options?.penInfill?.enabled
      ? '-pen-infill'
      : options?.isLineArt
      ? '-pen-lineart'
      : '-cut';
    triggerDownload(svgData, `craftly-cricut${suffix}-${Date.now()}.svg`, 'image/svg+xml');
    setStatusBanner({
      type: 'success',
      message: `Exported Cricut SVG${options?.penInfill?.enabled ? ' with Solid Pen Infill' : ''}!`
    });
  };

  const handleExportPng = () => {
    const pngDataUrl = exportPng(3);
    if (!pngDataUrl) return;

    fetch(pngDataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `craftly-print-cut-300dpi-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
  };

  const handleExportPdf = () => {
    exportPdf('12x12');
    setStatusBanner({
      type: 'success',
      message: 'Exported 300 DPI Print & Cut PDF (12"x12" Cricut Mat format)!'
    });
  };

  const handleExportLineArt = () => {
    if (!isLineArt) {
      toggleLineArt();
    }
    setTimeout(() => {
      const svgData = exportSvg({
        isLineArt: true,
        lineArtOptions: {
          penWidth: lineArtPenWidth,
          colorMode: lineArtColorMode
        },
        groupColorsIntoMats: lineArtColorMode === 'color'
      });
      if (!svgData) return;
      triggerDownload(svgData, `vectarly-lineart-${Date.now()}.svg`, 'image/svg+xml');
    }, 100);
  };

  // Global Keyboard Shortcuts (Ctrl+S / Cmd+S for Save, Ctrl+O / Cmd+O for Open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveProject();
      } else if (isCmdOrCtrl && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleOpenProject();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasVector, hasImage, currentProjectName, exportProjectJSON]);

  // On first mount, load Vectarly logo sample
  useEffect(() => {
    handleSelectSample('vectarly', true);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-craft-bg text-craft-text select-none">
      {/* Hidden File Input for Loading Projects (.vectarly, .json, .svg, and images) */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".vectarly,.json,.svg,.png,.jpg,.jpeg,.webp,image/*,application/json,image/svg+xml"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Top Header */}
      <Header
        mode={mode}
        setMode={handleSetMode}
        hasVector={hasVector}
        hasImage={hasImage}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        isCustomKeyActive={isCustomKeyActive}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        onExportLineArt={handleExportLineArt}
        onOpenExportModal={() => setIsExportOpen(true)}
        onSelectSample={handleSelectSample}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        stats={vectorStats}
      />

      {/* Top Prompt Rail (shown only on Raster Cleanup tab) */}
      {mode === 'raster' && (
        <PromptBar
          onGenerate={handleGenerate}
          onUploadImage={handleUploadImage}
          isGenerating={isGenerating}
          selectedPreset={selectedPreset}
          setSelectedPreset={setSelectedPreset}
        />
      )}

      {/* Dedicated Studio Action & Crop Toolbar Row (Cleanly placed, NO overlap) */}
      <StudioActionBar
        mode={mode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onResetArtwork={resetArtwork}
        activeCropType={activeCropType}
        lassoPointsCount={lassoPointsCount}
        onStartRectCrop={startRectCrop}
        onStartCircleCrop={startCircleCrop}
        onStartLassoCrop={startLassoCrop}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
        onRemoveBackground={handleRemoveBackground}
        isRemovingBg={isRemovingBg}
        hasImage={hasImage}
        hasVector={hasVector}
        brushMode={brushMode}
        onSetBrushMode={setBrushMode}
        brushSize={brushSize}
        onSetBrushSize={setBrushSize}
        activeBrushColor={activeBrushColor}
        onSelectBrushColor={setActiveBrushColor}
        colorLayers={colorLayers}
        zoomLevel={zoomLevel}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
      />

      {/* Main Workspace Stage */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Center Fabric.js Canvas Viewport (Unobstructed 12x12 Cricut Mat) */}
        <CanvasViewport
          canvasRef={canvasRef}
          containerRef={containerRef}
          mode={mode}
          zoomLevel={zoomLevel}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          hasImage={hasImage}
          hasVector={hasVector}
          statusBanner={statusBanner}
          onDismissBanner={() => setStatusBanner(null)}
          isLassoActive={activeCropType.startsWith('lasso')}
          isGenerating={isGenerating}
          activePrompt={activePrompt}
          onInstantSample={() => handleSelectSample('vectarly')}
          contextMenuState={contextMenuState}
          onCloseContextMenu={() => setContextMenuState((prev) => ({ ...prev, isOpen: false }))}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
          selectedObject={selectedObject}
          onRecenterView={recenterArtwork}
          onDeleteSelected={deleteSelectedObject}
          onDuplicateSelected={duplicateSelectedObject}
          onCombineSelected={combineSelectedObjects}
          onSelectThisLayer={selectObjectsByColor}
          onSelectSimilarColor={selectObjectsBySimilarColor}
          onClearSelection={clearSelection}
          selectedColor={selectedColor}
          selectedColors={selectedLayerColors}
          onChangeSelectedColor={changeSelectedObjectColor}
          selectionBounds={selectionBounds}
          onSelectAllVectors={selectAllVectors}
          units={units}
          onToggleUnits={toggleUnits}
          showRulers={showRulers}
          onToggleRulers={() => setShowRulers(!showRulers)}
          cursorPos={cursorPos}
          matBackground={matBackground}
          onChangeMatBackground={setMatBackground}
          isWeedCheckActive={isWeedCheckActive}
          onToggleWeedCheck={toggleWeedCheck}
          weedCheckReport={weedCheckReport}
          onRemediateVinyl={remediateCanvasVectors}
          isRemediating={isRemediating}
          vinylSettings={vinylSettings}
          onOpenSettings={() => setIsSettingsOpen(true)}
          viewportInfo={canvasViewportInfo}
          brushMode={brushMode}
          brushSize={brushSize}
          activeBrushColor={activeBrushColor}
          isResizingBrush={isResizingBrush}
          brushResizePos={brushResizePos}
          compareData={compareData}
          onSwitchToRaster={switchToRasterMode}
          onSwitchToVector={switchToVectorMode}
          onTriggerVectorize={() => {
            handleVectorize({
              mode: 'spline',
              hierarchical: 'cutout',
              filterSpeckle: 4,
              colorPrecision: 6,
              maxColors: 6,
              simplify: 1
            });
          }}
          isVectorizing={isVectorizing}
        />

        {/* Right Inspector Panel */}
        {mode === 'raster' ? (
          <RasterInspector
            onRemoveBackground={handleRemoveBackground}
            isRemovingBg={isRemovingBg}
            bgProgress={bgProgress}
            bgStatusText={bgStatusText}
            activeCropType={activeCropType}
            lassoPointsCount={lassoPointsCount}
            onStartRectCrop={startRectCrop}
            onStartCircleCrop={startCircleCrop}
            onStartLassoCrop={startLassoCrop}
            onApplyCrop={applyCrop}
            onCancelCrop={cancelCrop}
            onVectorize={handleVectorize}
            isVectorizing={isVectorizing}
            hasImage={hasImage}
            onResetArtwork={resetArtwork}
          />
        ) : mode === 'vector' ? (
          <VectorInspector
            stats={vectorStats}
            canvasLayers={colorLayers}
            onSelectColorLayer={selectObjectsByColor}
            onSwapColor={swapColor}
            onCombineMats={combineMats}
            onReorderColorLayers={reorderColorLayers}
            onToggleLayerVisibility={toggleLayerVisibility}
            onDeleteColorLayer={deleteColorLayer}
            selectedObject={selectedObject}
            selectedColor={selectedColor}
            selectedMatColors={selectedLayerColors}
            onSelectMatColors={setSelectedLayerColors}
            onChangeSelectedColor={changeSelectedObjectColor}
            onDeleteSelectedObject={deleteSelectedObject}
            isLineArt={isLineArt}
            lineArtPenWidth={lineArtPenWidth}
            lineArtColorMode={lineArtColorMode}
            onToggleLineArt={toggleLineArt}
            onChangeLineArtPenWidth={setLineArtPenWidth}
            onChangeLineArtColorMode={setLineArtColorMode}
            onExportSvg={handleExportSvg}
            onExportPng={handleExportPng}
            onExportPdf={handleExportPdf}
            onExportLineArt={handleExportLineArt}
            onOpenExportModal={() => setIsExportOpen(true)}
            onResetArtwork={resetArtwork}
            onOpenMatContextMenu={openContextMenuForMat}
            onStartRectCrop={startRectCrop}
            onStartCircleCrop={startCircleCrop}
            onStartLassoCrop={startLassoCrop}
            maxColorCount={maxColorCount}
            activeColorCount={activeColorCount}
            activeDetailPercent={activeDetailPercent}
            onSimplifyColors={simplifyColorsLive}
            onSimplifyDetails={simplifyDetailsLive}
            onFlattenArtwork={flattenArtwork}
            isWeedCheckActive={isWeedCheckActive}
            onToggleWeedCheck={toggleWeedCheck}
            weedCheckReport={weedCheckReport}
            onRemediateVinyl={remediateCanvasVectors}
            isRemediating={isRemediating}
            vinylSettings={vinylSettings}
            onOpenSettings={() => setIsSettingsOpen(true)}
            brushMode={brushMode}
            onSetBrushMode={setBrushMode}
            activeBrushColor={activeBrushColor}
            onSelectBrushColor={setActiveBrushColor}
            outlineSmoothing={outlineSmoothing}
            onSmoothOutlines={setOutlineSmoothing}
          />
        ) : (
          <CompareInspector
            stats={vectorStats}
            hasImage={hasImage}
            hasVector={hasVector}
            onSwitchToRaster={async () => {
              await switchToRasterMode();
              setMode('raster');
            }}
            onSwitchToVector={async () => {
              await switchToVectorMode();
              setMode('vector');
            }}
            onTriggerVectorize={() => {
              handleVectorize({
                mode: 'spline',
                hierarchical: 'cutout',
                filterSpeckle: 4,
                colorPrecision: 6,
                maxColors: 6,
                simplify: 1
              });
            }}
            isVectorizing={isVectorizing}
          />
        )}
      </div>

      {/* Settings Modal with Key Diagnostics & Preferences */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onKeyChanged={() => setIsCustomKeyActive(isUsingCustomApiKey())}
        units={units}
        onUnitsChanged={setUnits}
        vinylSettings={vinylSettings}
        onVinylSettingsChanged={setVinylSettings}
        customColors={customColors}
        onCustomColorsChanged={setCustomColors}
      />

      {/* Production Export Modal with Cricut Pen Infill Suite */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        isLineArtActive={isLineArt}
        matsCount={colorLayers.length || vectorStats?.colorCount || 1}
        vinylSettings={vinylSettings}
      />

      {/* About Splash Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Flatten Progress Popup Prompt */}
      <FlattenProgressOverlay
        isFlattening={isFlattening}
        mode={activeFlattenMode}
      />

      {/* Unified Right-Click Context Menu for Canvas Elements & Active Mat Cards */}
      {contextMenuState.isOpen && (
        <CanvasContextMenu
          menuState={contextMenuState}
          onClose={() => setContextMenuState((prev) => ({ ...prev, isOpen: false, targetObject: null }))}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
          onDelete={deleteSelectedObject}
          onDuplicate={duplicateSelectedObject}
          onSelectThisLayer={selectObjectsByColor}
          onSelectSimilarColor={selectObjectsBySimilarColor}
          onSelectAll={selectAllVectors}
          onSelectInverse={selectInverseVectors}
          onUnionSelection={combineSelectedObjects}
          onClearSelection={clearSelection}
          onToggleHideShowAll={toggleHideShowAll}
          onShowAll={showAllVectors}
          onHideAll={hideAllVectors}
          areAllVisible={colorLayers.length > 0 ? colorLayers.every((l) => l.visible !== false) : true}
          onToggleHideShowSelection={toggleHideShowSelection}
          currentColor={selectedColor || null}
          selectedColors={selectedLayerColors}
          customColors={customColors}
          onChangeColor={changeSelectedObjectColor}
        />
      )}
    </div>
  );
}

export default App;
