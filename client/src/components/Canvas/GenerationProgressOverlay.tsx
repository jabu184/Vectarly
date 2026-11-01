import React, { useState, useEffect } from 'react';
import { Sparkles, Cpu, Clock, CheckCircle, Wand2, Zap } from 'lucide-react';

interface GenerationProgressOverlayProps {
  isGenerating: boolean;
  prompt: string;
  onInstantSample?: () => void;
}

const GENERATION_STAGES = [
  { text: 'Connecting to Gemini AI Engine...', duration: 1800 },
  { text: 'Synthesizing vector contours & Cricut cut layers...', duration: 2500 },
  { text: 'Optimizing Bézier spline nodes & weeding paths...', duration: 2500 },
  { text: 'Quantizing vinyl color layers & packaging SVG...', duration: 4000 }
];

export const GenerationProgressOverlay: React.FC<GenerationProgressOverlayProps> = ({
  isGenerating,
  prompt,
  onInstantSample
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [currentStageIdx, setCurrentStageIdx] = useState<number>(0);

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      setCurrentStageIdx(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 100) / 10;
      setElapsedSeconds(elapsed);

      // Determine stage based on elapsed time
      if (elapsed < 2.0) {
        setCurrentStageIdx(0);
      } else if (elapsed < 4.5) {
        setCurrentStageIdx(1);
      } else if (elapsed < 7.5) {
        setCurrentStageIdx(2);
      } else {
        setCurrentStageIdx(3);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isGenerating]);

  if (!isGenerating) return null;

  // Calculate approximate percentage progress (bounded at 95% until complete)
  const approxProgress = Math.min(95, Math.round((elapsedSeconds / 7.5) * 90) + 10);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/80 p-6 max-w-md w-full mx-auto relative overflow-hidden">
        {/* Animated Top Ambient Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-rose-500 to-amber-500 animate-pulse" />

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs relative">
            <Wand2 className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
            </span>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
              Gemini AI Studio Synthesis
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                Live
              </span>
            </h3>
            <p className="text-xs text-slate-500 truncate max-w-[280px]" title={prompt}>
              &quot;{prompt}&quot;
            </p>
          </div>
        </div>

        {/* Stage Feedback */}
        <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3.5 mb-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              {GENERATION_STAGES[currentStageIdx]?.text || 'Finalizing SVG...'}
            </span>
            <span className="font-mono text-slate-500 font-bold flex items-center gap-1 text-[11px]">
              <Clock className="w-3 h-3 text-slate-400" />
              {elapsedSeconds.toFixed(1)}s
            </span>
          </div>

          {/* Smooth Progress Bar */}
          <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${approxProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>Model: Gemini 3.6 Flash / Vector AI</span>
            <span>{approxProgress}%</span>
          </div>
        </div>

        {/* Workflow Steps Preview */}
        <div className="space-y-1.5 mb-5 px-1">
          {GENERATION_STAGES.map((stage, idx) => {
            const isDone = idx < currentStageIdx;
            const isCurrent = idx === currentStageIdx;
            return (
              <div
                key={idx}
                className={`flex items-center gap-2 text-xs transition-opacity duration-200 ${
                  isCurrent
                    ? 'text-indigo-600 font-semibold'
                    : isDone
                    ? 'text-emerald-600'
                    : 'text-slate-400 opacity-60'
                }`}
              >
                {isDone ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                ) : isCurrent ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin flex-shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0" />
                )}
                <span className="truncate">{stage.text}</span>
              </div>
            );
          })}
        </div>

        {/* Footer / Instant Fallback Option */}
        {onInstantSample && elapsedSeconds >= 3.0 && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Taking longer than expected?</span>
            <button
              onClick={onInstantSample}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              Use instant sample
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
