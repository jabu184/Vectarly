import React from 'react';
import { Layers, Sparkles } from 'lucide-react';
import type { FlattenMode } from '../../services/booleanUnion';

interface FlattenProgressOverlayProps {
  isFlattening: boolean;
  mode?: FlattenMode;
}

export const FlattenProgressOverlay: React.FC<FlattenProgressOverlayProps> = ({
  isFlattening,
  mode = 'knockout'
}) => {
  if (!isFlattening) return null;

  const isStacked = mode === 'stacked';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 p-6 max-w-sm w-full mx-auto relative overflow-hidden flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
        {/* Animated Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 animate-pulse" />

        {/* Animated Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3 shadow-xs relative mt-1">
          <Layers className="w-7 h-7 animate-bounce" />
          <Sparkles
            className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-spin"
            style={{ animationDuration: '3s' }}
          />
        </div>

        {/* Title */}
        <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
          Flattening Artwork
        </h3>

        {/* Subtitle / Mode Info */}
        <p className="text-xs text-slate-600 mt-1.5 font-medium leading-relaxed max-w-xs">
          {isStacked
            ? 'Merging overlapping layers into solid stacked base mats...'
            : 'Carving non-overlapping puzzle inlay cut paths...'}
        </p>

        {/* Indeterminate Smooth Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 mt-5 overflow-hidden border border-slate-200/60 relative">
          <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full w-2/3 animate-[shimmer_1.5s_infinite_linear] relative overflow-hidden">
            <div className="absolute inset-0 bg-white/30 skew-x-12 animate-pulse" />
          </div>
        </div>

        {/* Stage Status Footnote */}
        <p className="text-[11px] font-mono text-slate-600 mt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span>Dissolving seams &amp; welding cut contours...</span>
        </p>
      </div>
    </div>
  );
};
