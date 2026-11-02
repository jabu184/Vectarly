import React, { useState } from 'react';
import {
  Scissors,
  Sparkles,
  Settings,
  Download,
  FileCode2,
  Image as ImageIcon,
  PenTool,
  Layers,
  ChevronDown,
  CheckCircle2,
  FolderHeart,
  FileText,
  Sliders,
  Columns
} from 'lucide-react';
import type { CanvasMode } from '../../hooks/useFabricCanvas';
import confetti from 'canvas-confetti';

interface HeaderProps {
  mode: CanvasMode;
  setMode: (mode: CanvasMode) => void;
  hasVector: boolean;
  hasImage: boolean;
  onOpenSettings: () => void;
  onOpenAbout?: () => void;
  isCustomKeyActive: boolean;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportLineArt: () => void;
  onOpenExportModal?: () => void;
  onSelectSample: (sampleKey: string) => void;
  stats?: {
    pathCount: number;
    colorCount: number;
    nodeCount: number;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  setMode,
  hasVector,
  hasImage,
  onOpenSettings,
  onOpenAbout,
  isCustomKeyActive,
  onExportSvg,
  onExportPng,
  onExportPdf,
  onExportLineArt,
  onOpenExportModal,
  onSelectSample,
  stats
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);

  const handleExportWithConfetti = (exportFn: () => void) => {
    setExportOpen(false);
    exportFn();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.1 }
    });
  };

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-craft-border px-4 lg:px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenAbout}
          className="flex items-center gap-2 group cursor-pointer border-none bg-transparent p-0 transition-transform hover:scale-[1.02] active:scale-95"
          title="About Vectarly (v1.1)"
        >
          <img
            src="/vectarly-logo.png"
            alt="Vectarly"
            className="h-9 w-auto object-contain select-none"
          />
        </button>
      </div>

      {/* Mode Switcher Pills */}
      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
        <button
          onClick={() => setMode('raster')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            mode === 'raster'
              ? 'bg-white text-craft-text shadow-sm'
              : 'text-craft-muted hover:text-craft-text'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Raster Import</span>
          {hasImage && !hasVector && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>}
        </button>

        <button
          onClick={() => setMode('vector')}
          disabled={!hasVector}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            mode === 'vector'
              ? 'bg-white text-indigo-600 shadow-sm cursor-pointer'
              : hasVector
              ? 'text-craft-muted hover:text-craft-text cursor-pointer'
              : 'text-slate-400 cursor-not-allowed opacity-60'
          }`}
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>Vector Studio</span>
        </button>

        <button
          onClick={() => setMode('compare')}
          disabled={!hasImage && !hasVector}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            mode === 'compare'
              ? 'bg-white text-purple-600 shadow-sm cursor-pointer'
              : hasImage || hasVector
              ? 'text-craft-muted hover:text-craft-text cursor-pointer'
              : 'text-slate-400 cursor-not-allowed opacity-60'
          }`}
          title="Compare raster image and vector cutlines side by side"
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Compare</span>
        </button>
      </div>

      {/* Right Controls & CTAs */}
      <div className="flex items-center gap-2">
        {/* Sample Library Dropdown */}
        <div className="relative">
          <button
            onClick={() => setSamplesOpen(!samplesOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-craft-muted hover:text-craft-text hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
            title="Load sample designs"
          >
            <FolderHeart className="w-3.5 h-3.5 text-pink-500" />
            <span className="hidden md:inline">Sample Gallery</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {samplesOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Test Vector Presets</p>
              </div>
              <button
                onClick={() => {
                  onSelectSample('vectarly');
                  setSamplesOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-between cursor-pointer"
              >
                <span>🦋 Vectarly Logo</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded font-bold">Default</span>
              </button>
              <button
                onClick={() => {
                  onSelectSample('boba_cat');
                  setSamplesOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-between"
              >
                <span>🐱 Kawaii Boba Cat</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded">Pastel</span>
              </button>
              <button
                onClick={() => {
                  onSelectSample('camper');
                  setSamplesOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-between"
              >
                <span>🚐 Retro Camper Van</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded">Vinyl</span>
              </button>
              <button
                onClick={() => {
                  onSelectSample('mandala');
                  setSamplesOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-between"
              >
                <span>🌸 Floral Mandala</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded">Line-art</span>
              </button>
            </div>
          )}
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="relative p-2 rounded-xl text-craft-muted hover:text-craft-text hover:bg-slate-50 border border-slate-200 transition-colors"
          title="Gemini API & Style Settings"
        >
          <Settings className="w-4 h-4" />
          {isCustomKeyActive && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"></span>
          )}
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              if (onOpenExportModal) {
                onOpenExportModal();
              } else {
                setExportOpen(!exportOpen);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-100 transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Cut Files</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {exportOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-1">
              {onOpenExportModal && (
                <button
                  onClick={() => {
                    setExportOpen(false);
                    onOpenExportModal();
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50 border-b border-slate-100 flex items-center justify-between text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Export Modal &amp; Pen Infill...</span>
                  </div>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-semibold">
                    Studio
                  </span>
                </button>
              )}
              <div className="px-3 py-1.5 border-b border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Production Output</p>
              </div>

              {/* Cricut SVG */}
              <button
                onClick={() => handleExportWithConfetti(onExportSvg)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50 group flex items-start gap-3 transition-colors"
              >
                <div className="p-2 rounded-lg bg-indigo-100/60 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <FileCode2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-craft-text flex items-center gap-1.5">
                    <span>Cricut SVG Vector</span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.2 rounded">Recommended</span>
                  </div>
                  <p className="text-[11px] text-craft-muted">Cutout seam layers ready for Design Space mats</p>
                </div>
              </button>

              {/* 300 DPI PNG */}
              <button
                onClick={() => handleExportWithConfetti(onExportPng)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50 group flex items-start gap-3 transition-colors cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-pink-100/60 text-pink-600 group-hover:bg-pink-600 group-hover:text-white transition-colors">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-craft-text">Print Then Cut PNG</div>
                  <p className="text-[11px] text-craft-muted">High-res 300 DPI with transparent background</p>
                </div>
              </button>

              {/* 300 DPI PDF */}
              <button
                onClick={() => handleExportWithConfetti(onExportPdf)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50 group flex items-start gap-3 transition-colors cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-emerald-100/60 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-craft-text flex items-center gap-1.5">
                    <span>Print &amp; Cut PDF</span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-700 font-semibold px-1.5 py-0.2 rounded">300 DPI</span>
                  </div>
                  <p className="text-[11px] text-craft-muted">12&quot;x12&quot; Mat Template for printing &amp; cutting</p>
                </div>
              </button>

              {/* Line-Art SVG */}
              <button
                onClick={() => handleExportWithConfetti(onExportLineArt)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50 group flex items-start gap-3 transition-colors"
              >
                <div className="p-2 rounded-lg bg-amber-100/60 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <PenTool className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-craft-text">Cricut Pen Line Art</div>
                  <p className="text-[11px] text-craft-muted">Strips fills to 2px outlines for drawing &amp; foil tools</p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
