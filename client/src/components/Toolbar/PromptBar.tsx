import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  UploadCloud,
  ChevronDown,
  Layers,
  Loader2,
  Info
} from 'lucide-react';

interface PromptBarProps {
  onGenerate: (prompt: string, aspectRatio: '1:1' | '4:5' | '16:9', stylePreset: string) => void;
  onUploadImage: (file: File) => void;
  isGenerating: boolean;
  selectedPreset: string;
  setSelectedPreset: (preset: string) => void;
}

export const PromptBar: React.FC<PromptBarProps> = ({
  onGenerate,
  onUploadImage,
  isGenerating,
  selectedPreset,
  setSelectedPreset
}) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '16:9'>('1:1');
  const [isDragOver, setIsDragOver] = useState(false);

  const stylePresets = [
    { id: 'Bold Die-Cut Sticker', label: 'Bold Die-Cut Sticker', badge: 'Vinyl Decal' },
    { id: 'Clean Line Art', label: 'Clean Line Art', badge: 'Cricut Pen' },
    { id: 'Minimalist Kawaii', label: 'Minimalist Kawaii', badge: 'Pastel Mats' },
    { id: 'Vintage Vinyl Patch', label: 'Vintage Vinyl Patch', badge: 'Multi-Layer' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt.trim(), aspectRatio, selectedPreset);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUploadImage(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`bg-white border-b border-craft-border p-3 shadow-xs transition-colors ${
        isDragOver ? 'bg-indigo-50/60 ring-2 ring-indigo-400 ring-inset' : ''
      }`}
    >
      {/* Top Controls: Prompt Form */}
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
        {/* Main Prompt Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Wand2 className="w-4 h-4 text-indigo-500" />
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your vinyl sticker, decal, or Cricut design..."
            className="w-full pl-10 pr-24 py-2.5 text-xs font-medium text-craft-text rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50 hover:bg-white transition-all"
          />
          {/* Suffix Hint */}
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">Press Enter ↵</span>
          </div>
        </div>

        {/* Style Preset Selector */}
        <div className="relative">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-300 bg-slate-50/50 hover:bg-white text-craft-text transition-all">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer pr-4"
            >
              {stylePresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          {(['1:1', '4:5', '16:9'] as const).map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setAspectRatio(ratio)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                aspectRatio === ratio
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>

        {/* Action Group: Generate & Upload */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-sm shadow-indigo-100 transition-all cursor-pointer shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Concept...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Concept</span>
              </>
            )}
          </button>

          {/* Upload Button */}
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-craft-muted hover:text-craft-text bg-white hover:bg-slate-50 border border-slate-300 cursor-pointer transition-colors shrink-0">
            <UploadCloud className="w-4 h-4 text-indigo-500" />
            <span className="hidden lg:inline">Upload Image</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onUploadImage(e.target.files[0]);
                }
              }}
            />
          </label>
        </div>
      </form>
    </div>
  );
};
