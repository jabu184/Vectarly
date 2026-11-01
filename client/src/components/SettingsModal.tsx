import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  Check,
  ExternalLink,
  ShieldCheck,
  Palette,
  Activity,
  Loader2,
  AlertCircle,
  Scissors,
  Sliders,
  Sparkles,
  Info,
  CheckCircle2,
  Wand2,
  Plus,
  Trash2,
  RotateCcw
} from 'lucide-react';
import {
  setStoredApiKey,
  isUsingCustomApiKey,
  getStoredModel,
  setStoredModel,
  checkApiKey
} from '../services/api';
import {
  type MeasurementUnit,
  getStoredUnits,
  setStoredUnits
} from '../services/units';
import {
  type VinylCutSettings,
  type VinylPreset,
  VINYL_PRESETS,
  DEFAULT_VINYL_SETTINGS,
  getStoredVinylSettings,
  setStoredVinylSettings
} from '../services/vinylCutSettings';
import {
  getStoredCustomColors,
  setStoredCustomColors,
  DEFAULT_CUSTOM_PALETTE
} from '../services/customPalette';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyChanged?: () => void;
  units?: MeasurementUnit;
  onUnitsChanged?: (u: MeasurementUnit) => void;
  vinylSettings?: VinylCutSettings;
  onVinylSettingsChanged?: (settings: VinylCutSettings) => void;
  customColors?: string[];
  onCustomColorsChanged?: (colors: string[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onKeyChanged,
  units,
  onUnitsChanged,
  vinylSettings: initialVinylSettings,
  onVinylSettingsChanged,
  customColors,
  onCustomColorsChanged
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'vinyl' | 'palette'>('ai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash-image');
  const [currentUnits, setCurrentUnits] = useState<MeasurementUnit>('in');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(false);
  const [keyDiagnostics, setKeyDiagnostics] = useState<{
    keyMasked: string;
    imageStatus: string;
    quotaDetails: string;
    recommendation: string;
  } | null>(null);

  // Vinyl Cutting Readiness Engine State
  const [vinylSettings, setVinylSettings] = useState<VinylCutSettings>(DEFAULT_VINYL_SETTINGS);

  // Custom Palette State
  const [customPalette, setCustomPalette] = useState<string[]>([]);
  const [newColorHex, setNewColorHex] = useState<string>('#4F46E5');
  const [hexInputText, setHexInputText] = useState<string>('#4F46E5');

  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem('craftly_gemini_api_key') || '');
      setModel(getStoredModel());
      setCurrentUnits(units || getStoredUnits());
      setVinylSettings(initialVinylSettings || getStoredVinylSettings());
      setCustomPalette(customColors && customColors.length > 0 ? customColors : getStoredCustomColors());
      setSavedSuccess(false);
      setKeyDiagnostics(null);
    }
  }, [isOpen, units, initialVinylSettings, customColors]);

  if (!isOpen) return null;

  const handleAddColor = () => {
    const norm = hexInputText.trim().toUpperCase();
    if (!/^#[0-9A-F]{6}$/i.test(norm)) return;
    if (customPalette.includes(norm)) return;
    setCustomPalette((prev) => [...prev, norm]);
  };

  const handleRemoveColor = (col: string) => {
    setCustomPalette((prev) => prev.filter((c) => c !== col));
  };

  const handleResetDefaultPalette = () => {
    setCustomPalette([...DEFAULT_CUSTOM_PALETTE]);
  };

  const handleSelectPreset = (preset: VinylPreset) => {
    if (preset === 'custom') {
      setVinylSettings((prev) => ({ ...prev, preset: 'custom' }));
    } else {
      const presetConfig = VINYL_PRESETS[preset];
      setVinylSettings((prev) => ({
        ...prev,
        preset,
        ...presetConfig.settings
      }));
    }
  };

  const handleSave = () => {
    setStoredApiKey(apiKey);
    setStoredModel(model);
    setStoredUnits(currentUnits);
    setStoredVinylSettings(vinylSettings);
    setStoredCustomColors(customPalette);

    if (onUnitsChanged) onUnitsChanged(currentUnits);
    if (onVinylSettingsChanged) onVinylSettingsChanged(vinylSettings);
    if (onCustomColorsChanged) onCustomColorsChanged(customPalette);

    setSavedSuccess(true);
    if (onKeyChanged) onKeyChanged();
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  const handleResetDefault = () => {
    localStorage.removeItem('craftly_gemini_api_key');
    setApiKey('');
    setKeyDiagnostics(null);
    if (onKeyChanged) onKeyChanged();
  };

  const handleCheckKey = async () => {
    setIsCheckingKey(true);
    try {
      const res = await checkApiKey();
      setKeyDiagnostics(res);
    } catch (err: any) {
      setKeyDiagnostics({
        keyMasked: apiKey ? apiKey.slice(0, 6) + '...' : 'Default Key',
        imageStatus: 'Failed to reach API',
        quotaDetails: err.message,
        recommendation: 'Check network connectivity or verify API key syntax.'
      });
    } finally {
      setIsCheckingKey(false);
    }
  };

  const isCustom = isUsingCustomApiKey();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-craft-text text-base">Studio Preferences &amp; Limits</h3>
              <p className="text-xs text-craft-muted">AI Model configuration &amp; Vinyl Blade physical tolerances</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 border-b border-slate-100 bg-white flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'ai'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>AI Engine &amp; API Keys</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vinyl')}
            className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'vinyl'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Vinyl Cutting &amp; Weed Engine</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono font-bold">
              {vinylSettings.preset.replace('_', ' ').toUpperCase()}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('palette')}
            className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'palette'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Custom Palette</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono font-bold">
              {customPalette.length}
            </span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {activeTab === 'ai' ? (
            <>
              {/* Key Status Banner */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  isCustom
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                    : 'bg-indigo-50/60 border-indigo-200 text-indigo-900'
                }`}
              >
                <ShieldCheck className={`w-5 h-5 shrink-0 ${isCustom ? 'text-emerald-600' : 'text-indigo-600'}`} />
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold">
                    {isCustom ? 'Custom API Key Active' : 'Default Fallback Key Active'}
                  </p>
                  <p className="opacity-90 mt-0.5">
                    {isCustom
                      ? 'Your custom Gemini API key is stored securely in your browser localStorage with precedence over the default fallback.'
                      : 'Vectarly is currently using the provided fallback key (`AQ.Ab8RN6...`). You can paste your own personal Google Gemini key with billing below.'}
                  </p>
                </div>
              </div>

              {/* API Key Input */}
              <div>
                <label className="block text-xs font-bold text-craft-text uppercase tracking-wider mb-1.5">
                  Google Gemini API Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your Gemini API key (e.g. AIzaSy... or AQ...)"
                    className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    onClick={handleCheckKey}
                    disabled={isCheckingKey}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    {isCheckingKey ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Checking limits &amp; quotas...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3 h-3" />
                        <span>Check Key Limits &amp; Quotas</span>
                      </>
                    )}
                  </button>

                  {isCustom && (
                    <button
                      type="button"
                      onClick={handleResetDefault}
                      className="text-[11px] font-medium text-pink-600 hover:text-pink-700 underline cursor-pointer"
                    >
                      Reset to default fallback key
                    </button>
                  )}
                </div>
              </div>

              {/* Diagnostic Result Box (If tested) */}
              {keyDiagnostics && (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">API Key Diagnostic Result</span>
                    <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                      {keyDiagnostics.keyMasked}
                    </span>
                  </div>
                  <div className="text-[11px] space-y-1">
                    <p>
                      <strong>Image Generation Status:</strong>{' '}
                      <span
                        className={
                          keyDiagnostics.imageStatus.includes('429')
                            ? 'text-amber-700 font-bold'
                            : 'text-emerald-700 font-bold'
                        }
                      >
                        {keyDiagnostics.imageStatus}
                      </span>
                    </p>
                    {keyDiagnostics.quotaDetails && (
                      <p className="text-slate-500 font-mono text-[10px] bg-white p-2 rounded border border-slate-200">
                        {keyDiagnostics.quotaDetails}
                      </p>
                    )}
                    <p className="text-slate-600 leading-relaxed pt-1">
                      💡 {keyDiagnostics.recommendation}
                    </p>
                  </div>
                </div>
              )}

              {/* Model Selector */}
              <div>
                <label className="block text-xs font-bold text-craft-text uppercase tracking-wider mb-1.5">
                  Default Generation Model
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'gemini-2.5-flash-image',
                      name: 'Gemini 2.5 Flash / Nano Banana',
                      desc: 'Fast, high-fidelity concept raster'
                    },
                    {
                      id: 'gemini-nano-banana-2.1',
                      name: 'Nano Banana 2.1',
                      desc: 'Enhanced reasoning for complex shapes'
                    }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModel(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        model === m.id
                          ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <p className="text-xs font-bold text-craft-text">{m.name}</p>
                      <p className="text-[11px] text-craft-muted mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Measurement Units Preferences */}
              <div>
                <label className="block text-xs font-bold text-craft-text uppercase tracking-wider mb-1.5">
                  Measurement Units &amp; Rulers
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentUnits('in')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      currentUnits === 'in'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-craft-text">Inches (&quot;)</p>
                    <p className="text-[11px] text-craft-muted mt-0.5">12&quot;x12&quot; Cricut cutting mats standard</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentUnits('cm')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      currentUnits === 'cm'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <p className="text-xs font-bold text-craft-text">Centimeters (cm)</p>
                    <p className="text-[11px] text-craft-muted mt-0.5">Metric 30x30 cm international standard</p>
                  </button>
                </div>
              </div>
            </>
          ) : activeTab === 'vinyl' ? (
            /* VINYL CUTTING READINESS & WEED ENGINE TAB */
            <div className="space-y-5 animate-in fade-in">
              {/* Preset Selector */}
              <div>
                <label className="block text-xs font-bold text-craft-text uppercase tracking-wider mb-2">
                  1. Vinyl Material Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'standard_adhesive' as VinylPreset,
                      name: 'Adhesive Vinyl',
                      badge: 'Oracal 651',
                      desc: 'Decals & Mugs'
                    },
                    {
                      id: 'htv_iron_on' as VinylPreset,
                      name: 'HTV Iron-On',
                      badge: 'T-Shirts',
                      desc: 'Fabric Durability'
                    },
                    {
                      id: 'fine_detail_vinyl' as VinylPreset,
                      name: 'Fine Detail',
                      badge: '60° Blade',
                      desc: 'Intricate Mandala'
                    }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        vinylSettings.preset === p.id
                          ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                        {p.badge}
                      </span>
                      <p className="text-xs font-extrabold text-craft-text mt-1">{p.name}</p>
                      <p className="text-[10px] text-slate-500">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Physical Geometry Constraints */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Physical Geometry Constraints (Millimeters)</span>
                  </span>
                  {vinylSettings.preset !== 'custom' && (
                    <button
                      type="button"
                      onClick={() => setVinylSettings((prev) => ({ ...prev, preset: 'custom' }))}
                      className="text-[10px] text-indigo-600 font-bold hover:underline"
                    >
                      Switch to Custom
                    </button>
                  )}
                </div>

                {/* Min Feature Size */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 font-medium">Minimum Feature Size (`minFeatureSizeMm`)</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {vinylSettings.minFeatureSizeMm.toFixed(2)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="4.0"
                    step="0.1"
                    value={vinylSettings.minFeatureSizeMm}
                    onChange={(e) =>
                      setVinylSettings((prev) => ({
                        ...prev,
                        preset: 'custom',
                        minFeatureSizeMm: parseFloat(e.target.value)
                      }))
                    }
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0.5 mm (Micro)</span>
                    <span>1.5 mm (Standard)</span>
                    <span>4.0 mm (Chunky)</span>
                  </div>
                </div>

                {/* Min Gap Size */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 font-medium">Minimum Clearance Gap (`minGapSizeMm`)</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {vinylSettings.minGapSizeMm.toFixed(2)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3.5"
                    step="0.1"
                    value={vinylSettings.minGapSizeMm}
                    onChange={(e) =>
                      setVinylSettings((prev) => ({
                        ...prev,
                        preset: 'custom',
                        minGapSizeMm: parseFloat(e.target.value)
                      }))
                    }
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0.5 mm (Tight)</span>
                    <span>1.1 mm (Recommended)</span>
                    <span>3.5 mm (Spacious)</span>
                  </div>
                </div>

                {/* Min Area mm² */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 font-medium">Minimum Surface Area (`minAreaMm2`)</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {vinylSettings.minAreaMm2.toFixed(2)} mm²
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="8.0"
                    step="0.25"
                    value={vinylSettings.minAreaMm2}
                    onChange={(e) =>
                      setVinylSettings((prev) => ({
                        ...prev,
                        preset: 'custom',
                        minAreaMm2: parseFloat(e.target.value)
                      }))
                    }
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0.5 mm²</span>
                    <span>2.25 mm² (Blade Limit)</span>
                    <span>8.0 mm²</span>
                  </div>
                </div>

                {/* Corner Fillet Radius */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700 font-medium">Corner Fillet Radius (`cornerFilletRadiusMm`)</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {vinylSettings.cornerFilletRadiusMm.toFixed(2)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.80"
                    step="0.05"
                    value={vinylSettings.cornerFilletRadiusMm}
                    onChange={(e) =>
                      setVinylSettings((prev) => ({
                        ...prev,
                        preset: 'custom',
                        cornerFilletRadiusMm: parseFloat(e.target.value)
                      }))
                    }
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0.05 mm (Sharp)</span>
                    <span>0.25 mm (Smooth Arcs)</span>
                    <span>0.80 mm (Rounded)</span>
                  </div>
                </div>
              </div>

              {/* Automated Remediation Behavior Toggles */}
              <div>
                <label className="block text-xs font-bold text-craft-text uppercase tracking-wider mb-2">
                  2. Automated Remediation Behaviors
                </label>
                <div className="space-y-2">
                  {[
                    {
                      key: 'autoRemoveSpecks' as const,
                      label: 'Auto-Remove Micro-Specks',
                      desc: `Prunes small islands with surface area < ${vinylSettings.minAreaMm2} mm² to prevent blade shredding.`
                    },
                    {
                      key: 'autoBridgeGaps' as const,
                      label: 'Auto-Bridge Tight Clearance Gaps',
                      desc: `Welds narrow pinch points (< ${vinylSettings.minGapSizeMm} mm) so vinyl won't tear during manual pick weeding.`
                    },
                    {
                      key: 'autoThickenThinLines' as const,
                      label: 'Auto-Thicken Narrow Contours',
                      desc: `Dilates thin strokes and bridges (< ${vinylSettings.minFeatureSizeMm} mm) to guarantee mechanical stability.`
                    },
                    {
                      key: 'autoFilletCorners' as const,
                      label: 'Auto-Fillet Blade-Snag Corners',
                      desc: `Inserts tangent arcs (${vinylSettings.cornerFilletRadiusMm} mm radius) at acute corners to stop drag blade hitching.`
                    }
                  ].map((opt) => (
                    <label
                      key={opt.key}
                      className="p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-start gap-3 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={vinylSettings[opt.key]}
                        onChange={(e) =>
                          setVinylSettings((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                        }
                        className="mt-0.5 rounded accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-craft-text">{opt.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Viewport Diagnostic Heatmap Overlay Toggle */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-600 text-white">
                    <Scissors className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-indigo-950">Weed Check &trade; Canvas Overlay</p>
                    <p className="text-[11px] text-indigo-800/80">Highlight at-risk paths live on the 12x12 mat</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vinylSettings.enableWeedCheckOverlay}
                    onChange={(e) =>
                      setVinylSettings((prev) => ({
                        ...prev,
                        enableWeedCheckOverlay: e.target.checked
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in">
              {/* Custom Palette Banner */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-indigo-900 flex items-start gap-3">
                <Palette className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <p className="font-bold">Custom Vinyl Colors &amp; Brand Palette</p>
                  <p className="opacity-90 mt-0.5">
                    Define your personal vinyl roll inventory and brand swatches. These colors appear in the right-click menu under <strong>Custom Colours</strong> for instant 1-click layer assignment and are automatically saved across browser sessions.
                  </p>
                </div>
              </div>

              {/* Add New Color Form */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <label className="block text-xs font-bold text-craft-text uppercase tracking-wider">
                  Add Color to Palette
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newColorHex}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setNewColorHex(val);
                      setHexInputText(val);
                    }}
                    className="w-10 h-10 rounded-xl border border-slate-300 cursor-pointer bg-white p-0.5 shadow-2xs"
                    title="Choose color"
                  />
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={hexInputText}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setHexInputText(val);
                        if (/^#[0-9A-F]{6}$/i.test(val)) {
                          setNewColorHex(val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddColor();
                        }
                      }}
                      placeholder="#RRGGBB"
                      maxLength={7}
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddColor}
                    disabled={!/^#[0-9A-F]{6}$/i.test(hexInputText)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Color</span>
                  </button>
                </div>
              </div>

              {/* Custom Palette Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-craft-text uppercase tracking-wider">
                    Configured Swatches ({customPalette.length} {customPalette.length === 1 ? 'color' : 'colors'})
                  </label>
                  {customPalette.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetDefaultPalette}
                      className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Reset to default vinyl colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset to Defaults</span>
                    </button>
                  )}
                </div>

                {customPalette.length === 0 ? (
                  <div className="p-6 text-center rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                    No custom colors added yet. Pick a color above and click "Add Color".
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {customPalette.map((col) => (
                      <div
                        key={col}
                        className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs group hover:border-indigo-300 transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-5 h-5 rounded-lg border border-black/15 shadow-2xs shrink-0"
                            style={{ backgroundColor: col }}
                          />
                          <span className="font-mono text-xs font-bold text-slate-700 truncate">
                            {col}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveColor(col)}
                          className="text-slate-300 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title={`Remove ${col}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
          <a
            href="https://ai.google.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-craft-muted hover:text-indigo-600 flex items-center gap-1"
          >
            <span>Documentation &amp; Guides</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-100 transition-all active:scale-95 cursor-pointer"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Preferences Saved!</span>
                </>
              ) : (
                <span>Save Preferences</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
