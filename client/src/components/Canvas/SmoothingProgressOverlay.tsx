import React from 'react';
import { Sparkles } from 'lucide-react';

interface SmoothingProgressOverlayProps {
  isSmoothing: boolean;
  percent: number;
  onCancel?: () => void;
}

export const SmoothingProgressOverlay: React.FC<SmoothingProgressOverlayProps> = ({
  isSmoothing,
  percent,
  onCancel
}) => {
  if (!isSmoothing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150 select-none cursor-wait"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 p-6 max-w-sm w-full mx-auto relative overflow-hidden flex flex-col items-center text-center animate-in zoom-in-95 duration-150">
        {/* Animated Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-indigo-500 to-pink-500 animate-pulse" />

        {/* Animated Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 mb-3 shadow-xs relative mt-1">
          <Sparkles className="w-7 h-7 animate-spin" style={{ animationDuration: '4s' }} />
        </div>

        {/* Title */}
        <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
          Smoothing Vector Artwork
        </h3>

        {/* Subtitle / Percent */}
        <p className="text-xs text-slate-600 mt-1.5 font-medium leading-relaxed max-w-xs">
          Applying {percent}% smoothing and noise reduction to vector layers and outer cut perimeter...
        </p>

        {/* Indeterminate Smooth Progress Bar */}
        <div className="w-full bg-slate-100 rounded-full h-2 mt-5 overflow-hidden border border-slate-200/60 relative">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-full w-3/4 animate-[shimmer_1.2s_infinite_linear] relative overflow-hidden">
            <div className="absolute inset-0 bg-white/30 skew-x-12 animate-pulse" />
          </div>
        </div>

        {/* Footnote */}
        <p className="text-[11px] font-mono text-cyan-800 mt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-ping" />
          <span>Updating vector paths &amp; perimeter boundary...</span>
        </p>

        {/* Cancel Button */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs transition-all cursor-pointer border border-slate-200 active:scale-95"
          >
            Cancel Smoothing
          </button>
        )}
      </div>
    </div>
  );
};
