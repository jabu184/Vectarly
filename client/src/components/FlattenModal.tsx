import React, { useState, useEffect } from 'react';
import { X, Layers, Puzzle, Check, Sparkles, Scissors, Info } from 'lucide-react';
import type { FlattenMode } from '../services/booleanUnion';

interface FlattenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: FlattenMode) => void;
}

export const FlattenModal: React.FC<FlattenModalProps> = ({
  isOpen,
  onClose,
  onConfirm
}) => {
  const [selectedMode, setSelectedMode] = useState<FlattenMode>('knockout');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        onConfirm(selectedMode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedMode, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm shadow-indigo-100">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">Flatten Artwork &amp; Color Layers</h3>
              <p className="text-xs text-slate-500 font-medium">
                Choose how overlapping color layers are cut and assembled for your vinyl plotter
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content / Comparison Cards */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* OPTION 1: KNOCKOUT / INLAY */}
            <div
              onClick={() => setSelectedMode('knockout')}
              className={`relative rounded-2xl p-5 border-2 cursor-pointer transition-all flex flex-col justify-between text-left ${
                selectedMode === 'knockout'
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-md shadow-indigo-100 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                    <Puzzle className="w-3.5 h-3.5" />
                    <span>Knockout / Inlay</span>
                  </span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                      selectedMode === 'knockout'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {selectedMode === 'knockout' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Non-Overlapping (Jigsaw)</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Carves out cutouts so each layer <strong className="text-slate-800">only colors areas where no other layer does</strong>. Pieces fit flush together with 0% overlap.
                  </p>
                </div>

                {/* Visual Diagram */}
                <div className="rounded-xl bg-slate-100/80 p-3 border border-slate-200/80 flex flex-col items-center justify-center gap-2">
                  <svg className="w-full h-20" viewBox="0 0 200 80" fill="none">
                    {/* Flush puzzle-like blocks */}
                    <path
                      d="M 20 15 L 90 15 C 95 25 105 25 105 40 C 105 55 95 55 90 65 L 20 65 Z"
                      fill="#4F46E5"
                      fillOpacity="0.85"
                    />
                    <path
                      d="M 92 15 L 180 15 L 180 65 L 92 65 C 97 55 107 55 107 40 C 107 25 97 25 92 15 Z"
                      fill="#F59E0B"
                      fillOpacity="0.9"
                    />
                    {/* Seam line */}
                    <line x1="91" y1="12" x2="91" y2="68" stroke="#312E81" strokeWidth="1" strokeDasharray="2 2" />
                    {/* Arrow badge */}
                    <text x="100" y="76" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">
                      Flush Seam · Zero Height Buildup
                    </text>
                  </svg>
                </div>

                {/* Key Benefits */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>No stiff vinyl ridge or bulk</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Best for Heat Transfer Vinyl (HTV) &amp; shirts</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Saves vinyl material</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                Recommended for HTV / Apparel
              </div>
            </div>

            {/* OPTION 2: STAGGERED / STACKED */}
            <div
              onClick={() => setSelectedMode('stacked')}
              className={`relative rounded-2xl p-5 border-2 cursor-pointer transition-all flex flex-col justify-between text-left ${
                selectedMode === 'stacked'
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-md shadow-indigo-100 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Staggered / Stacked</span>
                  </span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                      selectedMode === 'stacked'
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {selectedMode === 'stacked' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Solid Stacked (Overlapping)</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Where upper layers overlay, the layer below is <strong className="text-slate-800">made solid in that area</strong> (fills cutouts and creates solid bases). Matches your Active Layers order.
                  </p>
                </div>

                {/* Visual Diagram */}
                <div className="rounded-xl bg-slate-100/80 p-3 border border-slate-200/80 flex flex-col items-center justify-center gap-2">
                  <svg className="w-full h-20" viewBox="0 0 200 80" fill="none">
                    {/* Solid background base */}
                    <rect x="25" y="20" width="150" height="45" rx="8" fill="#1E293B" />
                    {/* Foreground detail layered on top */}
                    <rect x="55" y="10" width="90" height="40" rx="6" fill="#F59E0B" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))" />
                    <text x="100" y="34" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold">
                      Upper Layer
                    </text>
                    <text x="100" y="75" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="600">
                      Solid Base Silhouette Underneath
                    </text>
                  </svg>
                </div>

                {/* Key Benefits */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>100% gap-proof: zero light leaks</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Easiest alignment during transfer</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Best for decals, tumblers &amp; car stickers</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Recommended for Adhesive Decals
              </div>
            </div>
          </div>

          {/* Quick Notice Tip */}
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Both styles unite vectors of the same color into compound layers. You can undo anytime with{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-mono font-bold text-slate-700 shadow-xs">
                Ctrl+Z
              </kbd>
              .
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedMode)}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              Flatten Artwork ({selectedMode === 'knockout' ? 'Knockout Inlay' : 'Solid Stacked'})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
