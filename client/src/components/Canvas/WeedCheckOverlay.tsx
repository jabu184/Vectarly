import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Scissors,
  Wand2,
  X,
  Info,
  Maximize2,
  Layers,
  ChevronRight,
  ShieldCheck,
  AlertOctagon
} from 'lucide-react';
import type { WeedCheckReport, WeedCheckIssue } from '../../services/vinylRemediation';
import type { VinylCutSettings } from '../../services/vinylCutSettings';

interface WeedCheckOverlayProps {
  isVisible: boolean;
  report: WeedCheckReport | null;
  settings: VinylCutSettings;
  zoomLevel: number;
  viewportInfo?: {
    offsetLeft: number;
    offsetTop: number;
    width: number;
    height: number;
    vpt: number[];
  };
  onRemediate: () => void;
  onClose: () => void;
  onOpenSettings?: () => void;
  isRemediating?: boolean;
}

export const WeedCheckOverlay: React.FC<WeedCheckOverlayProps> = ({
  isVisible,
  report,
  settings,
  zoomLevel,
  viewportInfo,
  onRemediate,
  onClose,
  onOpenSettings,
  isRemediating = false
}) => {
  const [activeIssue, setActiveIssue] = useState<WeedCheckIssue | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  if (!isVisible || !report) return null;

  const filteredIssues = report.issues.filter((issue) => {
    if (filterType === 'all') return true;
    return issue.type === filterType;
  });

  const vpt = viewportInfo?.vpt || [zoomLevel, 0, 0, zoomLevel, 0, 0];
  const offsetLeft = viewportInfo?.offsetLeft ?? 0;
  const offsetTop = viewportInfo?.offsetTop ?? 0;
  const canvasWidth = viewportInfo?.width ?? 700;
  const canvasHeight = viewportInfo?.height ?? 600;

  // Zoom scale from matrix
  const effectiveScale = vpt[0] || zoomLevel || 1;
  const invScale = 1 / Math.max(effectiveScale, 0.1);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-rose-600 bg-rose-50 border-rose-200';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {/* SVG Canvas Diagnostics Heatmap Layer - Positioned exactly over Fabric canvas */}
      <svg
        className="pointer-events-none absolute"
        style={{
          left: `${offsetLeft}px`,
          top: `${offsetTop}px`,
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`
        }}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      >
        <defs>
          <radialGradient id="speckGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#f43f5e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="gapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#a855f7" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform={`matrix(${vpt.join(' ')})`}>
          {filteredIssues.map((issue) => {
            const x = issue.x;
            const y = issue.y;
            const markerRadius = Math.max(10 * invScale, ((issue.width || 14) / 2 + 4));
            const isSelected = activeIssue?.id === issue.id;

            if (issue.type === 'speck') {
              return (
                <g
                  key={issue.id}
                  className="cursor-pointer pointer-events-auto transition-transform hover:scale-110"
                  onClick={() => setActiveIssue(issue)}
                >
                  {/* Pulsing Outer Glow */}
                  <circle
                    cx={x}
                    cy={y}
                    r={markerRadius * 1.5}
                    fill="url(#speckGlow)"
                    className="animate-pulse"
                  />
                  {/* Warning Ring */}
                  <circle
                    cx={x}
                    cy={y}
                    r={markerRadius}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth={isSelected ? `${3 * invScale}` : `${2 * invScale}`}
                    strokeDasharray={`${4 * invScale} ${2 * invScale}`}
                  />
                  {/* Center Danger Dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={3.5 * invScale}
                    fill="#e11d48"
                    stroke="#ffffff"
                    strokeWidth={1.5 * invScale}
                  />
                </g>
              );
            }

            if (issue.type === 'tight_gap') {
              return (
                <g
                  key={issue.id}
                  className="cursor-pointer pointer-events-auto transition-transform hover:scale-110"
                  onClick={() => setActiveIssue(issue)}
                >
                  <circle cx={x} cy={y} r={16 * invScale} fill="url(#gapGlow)" />
                  <circle
                    cx={x}
                    cy={y}
                    r={12 * invScale}
                    fill="none"
                    stroke="#9333ea"
                    strokeWidth={isSelected ? `${3 * invScale}` : `${2 * invScale}`}
                  />
                  <line
                    x1={x - 6 * invScale}
                    y1={y}
                    x2={x + 6 * invScale}
                    y2={y}
                    stroke="#ffffff"
                    strokeWidth={2 * invScale}
                    strokeLinecap="round"
                  />
                </g>
              );
            }

            if (issue.type === 'thin_feature') {
              return (
                <g
                  key={issue.id}
                  className="cursor-pointer pointer-events-auto transition-transform hover:scale-110"
                  onClick={() => setActiveIssue(issue)}
                >
                  <rect
                    x={x - 10 * invScale}
                    y={y - 10 * invScale}
                    width={20 * invScale}
                    height={20 * invScale}
                    rx={4 * invScale}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={isSelected ? `${3 * invScale}` : `${2 * invScale}`}
                    strokeDasharray={`${3 * invScale} ${2 * invScale}`}
                  />
                  <circle cx={x} cy={y} r={3 * invScale} fill="#d97706" />
                </g>
              );
            }

            // sharp_corner
            return (
              <g
                key={issue.id}
                className="cursor-pointer pointer-events-auto transition-transform hover:scale-110"
                onClick={() => setActiveIssue(issue)}
              >
                <polygon
                  points={`${x},${y - 7 * invScale} ${x + 6 * invScale},${y + 5 * invScale} ${x - 6 * invScale},${y + 5 * invScale}`}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={1.5 * invScale}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Active Issue Detail Popover (Positioned near selected marker) */}
      {activeIssue && (
        <div
          style={{
            left: `${Math.min(window.innerWidth - 320, Math.max(20, offsetLeft + (activeIssue.x * vpt[0] + vpt[4]) + 16))}px`,
            top: `${Math.min(window.innerHeight - 200, Math.max(60, offsetTop + (activeIssue.y * vpt[3] + vpt[5]) - 40))}px`
          }}
          className="absolute pointer-events-auto z-40 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-4 space-y-2.5 animate-in fade-in duration-150"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className={`p-1 rounded-lg ${
                  activeIssue.type === 'speck'
                    ? 'bg-rose-100 text-rose-600'
                    : activeIssue.type === 'tight_gap'
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-amber-100 text-amber-600'
                }`}
              >
                {activeIssue.type === 'speck' ? (
                  <AlertOctagon className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
              </span>
              <div>
                <h4 className="font-extrabold text-xs text-slate-900">{activeIssue.title}</h4>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                  {activeIssue.type.replace('_', ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveIssue(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">{activeIssue.description}</p>

          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-[11px]">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Metric</span>
              <span className="font-mono font-bold text-rose-600">{activeIssue.metric}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Required Threshold</span>
              <span className="font-mono font-bold text-emerald-700">{activeIssue.threshold}</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating HUD Card: Vinyl Readiness & Auto-Remediation */}
      <div className="absolute top-4 right-4 pointer-events-auto z-40 max-w-sm w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden transition-all duration-200">
        {/* HUD Header */}
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5 flex-wrap">
                <span>Weed Check &trade;</span>
                <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">
                  {settings.preset.replace('_', ' ').toUpperCase()}
                </span>
                <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                  {report.targetLayer ? (
                    <>
                      <span
                        className="w-2 h-2 rounded-full border border-black/20"
                        style={{ backgroundColor: report.targetLayer }}
                      />
                      <span>Layer: {report.targetLayer}</span>
                    </>
                  ) : (
                    <span>All Layers</span>
                  )}
                </span>
              </h3>
              <p className="text-[10px] text-slate-500">
                {report.targetLayer ? `Targeting selected layer (${report.targetLayer})` : 'Evaluating entire design'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title={isMinimized ? 'Expand HUD' : 'Collapse HUD'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Close Weed Check overlay"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className="p-4 space-y-3.5">
            {/* Cut Readiness Score Bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-bold text-slate-700 flex items-center gap-1">
                  <span>Cutting Readiness Score</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${getScoreColor(report.score)}`}>
                  {report.score}% {report.isCutReady ? '• Ready' : '• At Risk'}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${getScoreBarColor(report.score)}`}
                  style={{ width: `${report.score}%` }}
                />
              </div>
            </div>

            {/* Diagnostic Categories Grid */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <button
                type="button"
                onClick={() => setFilterType(filterType === 'speck' ? 'all' : 'speck')}
                className={`p-2.5 rounded-xl border transition-all ${
                  filterType === 'speck'
                    ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-400'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-sm font-mono font-bold text-rose-600">{report.specksCount}</p>
                <p className="text-[10px] font-bold text-slate-600 mt-0.5">Small Specks (&lt; {settings.minAreaMm2}mm²)</p>
              </button>

              <button
                type="button"
                onClick={() => setFilterType(filterType === 'thin_feature' ? 'all' : 'thin_feature')}
                className={`p-2.5 rounded-xl border transition-all ${
                  filterType === 'thin_feature'
                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-400'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-sm font-mono font-bold text-amber-600">{report.thinFeaturesCount}</p>
                <p className="text-[10px] font-bold text-slate-600 mt-0.5">Thin Cuts (&lt; {settings.minFeatureSizeMm}mm)</p>
              </button>
            </div>

            {/* Auto-Remediation Primary Action */}
            {report.totalIssues > 0 ? (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={onRemediate}
                  disabled={isRemediating}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-bold text-xs shadow-md shadow-indigo-100 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Wand2 className={`w-4 h-4 ${isRemediating ? 'animate-spin' : ''}`} />
                  <span>{isRemediating ? 'Removing Specks & Thin Cuts...' : '1-Click Remove Specks & Thin Cuts'}</span>
                </button>
                <p className="text-[10px] text-center text-slate-500 leading-tight">
                  Prunes micro-specks smaller than {settings.minAreaMm2}mm² and removes long, narrow cuts (&lt; {settings.minFeatureSizeMm}mm).
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="leading-tight">
                  <p className="font-bold">Zero Weeding Hazards!</p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">
                    All paths satisfy minimum feature, gap, and corner constraints for {settings.preset}.
                  </p>
                </div>
              </div>
            )}

            {/* Quick Link to Adjust Constraints */}
            {onOpenSettings && (
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[11px]">
                <span className="text-slate-400">Tolerance: {settings.minFeatureSizeMm}mm min size</span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="font-bold text-indigo-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Adjust Constraints</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
