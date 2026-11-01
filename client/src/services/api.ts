export interface GenerateRequest {
  prompt: string;
  aspectRatio?: '1:1' | '4:5' | '16:9';
  stylePreset?: string;
  model?: string;
  apiKey?: string;
}

export interface GenerateResponse {
  success: boolean;
  image: string;
  prompt: string;
  model: string;
  isFallback: boolean;
  warning?: string;
  error?: string;
}

export interface VectorizeRequest {
  image: string; // base64 or data URL
  mode?: 'spline' | 'polygon';
  hierarchical?: 'cutout' | 'stacked';
  filterSpeckle?: number;
  colorPrecision?: number;
  maxColors?: number;
  simplify?: number;
  cornerThreshold?: number;
}

export interface VectorLayer {
  color: string;
  count: number;
}

export interface VectorStats {
  pathCount: number;
  nodeCount: number;
  colorCount: number;
  colors: string[];
  colorLayers: VectorLayer[];
  width: number;
  height: number;
  viewBox: string;
}

export interface VectorizeResponse {
  success: boolean;
  svg: string;
  stats: VectorStats;
  optionsApplied?: any;
  error?: string;
  details?: string;
}

export interface SampleItem {
  title: string;
  prompt: string;
  style: string;
  dataUrl: string;
}

const STORAGE_KEY_API_KEY = 'craftly_gemini_api_key';
const STORAGE_KEY_MODEL = 'craftly_gemini_model';
const DEFAULT_API_KEY = '';

export function getStoredApiKey(): string {
  const custom = localStorage.getItem(STORAGE_KEY_API_KEY);
  if (custom && custom.trim()) {
    return custom.trim();
  }
  return DEFAULT_API_KEY;
}

export function setStoredApiKey(key: string): void {
  if (key && key.trim()) {
    localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
  }
}

export function isUsingCustomApiKey(): boolean {
  const custom = localStorage.getItem(STORAGE_KEY_API_KEY);
  return Boolean(custom && custom.trim() && custom.trim() !== DEFAULT_API_KEY);
}

export function getStoredModel(): string {
  return localStorage.getItem(STORAGE_KEY_MODEL) || 'gemini-2.5-flash-image';
}

export function setStoredModel(model: string): void {
  localStorage.setItem(STORAGE_KEY_MODEL, model);
}

export async function generateImage(req: GenerateRequest): Promise<GenerateResponse> {
  const apiKey = getStoredApiKey();
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gemini-api-key': apiKey
    },
    body: JSON.stringify({
      ...req,
      apiKey
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }

  return res.json();
}

export async function vectorizeImage(req: VectorizeRequest): Promise<VectorizeResponse> {
  const res = await fetch('/api/vectorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(req)
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || `Vectorization failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchSamples(): Promise<{ samples: Record<string, SampleItem>; presets: Record<string, any> }> {
  const res = await fetch('/api/samples');
  if (!res.ok) {
    throw new Error('Failed to load samples');
  }
  return res.json();
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkApiKey(): Promise<{
  success: boolean;
  keyMasked: string;
  isDefaultFallback: boolean;
  imageStatus: string;
  quotaDetails: string;
  recommendation: string;
}> {
  const apiKey = getStoredApiKey();
  const res = await fetch('/api/check-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gemini-api-key': apiKey
    },
    body: JSON.stringify({ apiKey })
  });
  if (!res.ok) {
    throw new Error('Failed to check API key');
  }
  return res.json();
}
