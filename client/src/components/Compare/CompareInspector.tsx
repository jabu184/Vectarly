import React from 'react';
import {
  Columns,
  Search,
  PenTool,
  Image as ImageIcon,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
  CheckCircle2
} from 'lucide-react';
import type { VectorStats } from '../../services/api';

interface CompareInspectorProps {
  stats: VectorStats | null;
  hasImage: boolean;
  hasVector: boolean;
  onSwitchToRaster: () => void;
  onSwitchToVector: () => void;
  onTriggerVectorize?: () => void;
  isVectorizing?: boolean;
}

export const CompareInspector: React.FC<CompareInspectorProps> = ({
  stats,
  hasImage,
  hasVector,
  onSwitchToRaster,
  onSwitchToVector,
  onTriggerVectorize,
  isVectorizing = false
}) => {
  return (
    <div className="w-80 lg:w-96 bg-white border-l border-craft-border h-full flex flex-col justify-between overflow-y-auto p-4 space-y-5">
      <div className="space-y-5">
        {/* Header */}
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                <Columns className="w-4 h-4" />
              </span>
              <h3 className="font-extrabold text-sm text-craft-text">Compare Workspace</h3>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Eye className="w-3 h-3 text-purple-600" />
              <span>Locked Sync</span>
            </span>
          </div>
          <p className="text-[11px] text-craft-muted mt-1">
            Compare source raster artwork directly against generated Cricut cutting vectors side-by-side.
          </p>
        </div>

        {/* Navigation & Loupe Card */}
        <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-purple-900 font-extrabold text-xs">
            <Search className="w-4 h-4 text-purple-600" />
            <span>Interactive Navigation & Loupe</span>
          </div>
          <p className="text-[11px] text-purple-800 leading-relaxed">
            • <strong>Pan by Default</strong>: Left-click and drag anywhere to pan both images synchronously.
          </p>
          <p className="text-[11px] text-purple-800 leading-relaxed">
            • <strong>Double-click</strong> within either image (or click the Magnifier icon) to toggle the magnifying loupe.
          </p>
          <p className="text-[11px] text-purple-800 leading-relaxed">
            • <strong>Reset View</strong>: Double middle-click (or click the Eye icon) to restore default pan and zoom.
          </p>
          <p className="text-[11px] text-purple-800 leading-relaxed">
            • <strong>1:1 Sync</strong>: Both images stay perfectly locked and aligned at all zoom levels.
          </p>
        </div>

        {/* Side-by-Side Status Summary */}
        <div className="space-y-2.5">
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Artwork Overview</h4>

          {/* Left: Raster Status */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                <ImageIcon className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">Raster Image</p>
                <p className="text-[10px] text-slate-500">Source bitmap pixels</p>
              </div>
            </div>
            <button
              onClick={onSwitchToRaster}
              className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <span>Edit</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Right: Vector Status */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                <PenTool className="w-4 h-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">Vector Studio</p>
                <p className="text-[10px] text-slate-500">
                  {stats ? `${stats.colorCount} mats • ${stats.pathCount} paths` : 'Cut-ready Bezier lines'}
                </p>
              </div>
            </div>
            {hasVector ? (
              <button
                onClick={onSwitchToVector}
                className="px-2.5 py-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <span>Edit</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            ) : (
              onTriggerVectorize && (
                <button
                  onClick={onTriggerVectorize}
                  disabled={isVectorizing}
                  className="px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{isVectorizing ? '...' : 'Vectorize'}</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Quality Check Comparison Tips */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
          <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Inspection Checklist</span>
          </h4>
          <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc pl-4">
            <li>Verify vector curves trace clean silhouette contours without jagged artifacts.</li>
            <li>Inspect text letterforms to verify cutout holes are completely retained.</li>
            <li>Ensure small isolated speckles are filtered out for clean vinyl weeding.</li>
          </ul>
        </div>
      </div>

      {/* Return Actions */}
      <div className="border-t border-slate-100 pt-3 flex gap-2">
        <button
          onClick={onSwitchToRaster}
          className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>Raster Cleanup</span>
        </button>

        <button
          onClick={onSwitchToVector}
          disabled={!hasVector}
          className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
        >
          <PenTool className="w-3.5 h-3.5" />
          <span>Vector Studio</span>
        </button>
      </div>
    </div>
  );
};
