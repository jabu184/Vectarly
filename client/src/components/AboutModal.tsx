import React, { useEffect } from 'react';
import { X, User, Sparkles, Scissors, Layers, CheckCircle2 } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden relative text-center p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo Banner */}
        <div className="pt-2 flex flex-col items-center">
          <img
            src="/vectarly-logo.png"
            alt="Vectarly"
            className="h-16 w-auto object-contain select-none"
          />
          <div className="flex items-center gap-2 mt-3">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Version 1.0
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Cricut &amp; Vinyl Ready</span>
            </span>
          </div>
        </div>

        {/* Author & Credits Box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center justify-center gap-2 text-slate-800 font-bold text-sm">
            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <span>Author: James Burnley</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            AI Vectorization, live SVG path clustering, multi-layer vinyl mat separation, and physical weed checks built for professional crafters and makers.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-2 gap-2 text-left text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <p className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
              <Scissors className="w-3.5 h-3.5 text-indigo-600" />
              <span>Die-Cut Clean</span>
            </p>
            <p className="text-[10px] text-slate-500">Zero overlapping seams with true Boolean union welding.</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
            <p className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
              <Layers className="w-3.5 h-3.5 text-pink-600" />
              <span>Mat Clustering</span>
            </p>
            <p className="text-[10px] text-slate-500">Color simplify and assign custom vinyl brand palettes.</p>
          </div>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-100 transition-all active:scale-98 cursor-pointer"
          >
            Explore Vectarly
          </button>
        </div>
      </div>
    </div>
  );
};
