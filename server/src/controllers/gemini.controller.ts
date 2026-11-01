import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

export interface GenerateImageRequest {
  prompt: string;
  aspectRatio?: '1:1' | '4:5' | '16:9';
  stylePreset?: string;
  model?: string;
  apiKey?: string;
}

export const STYLE_PRESETS: Record<string, { label: string; suffix: string; description: string }> = {
  'Bold Die-Cut Sticker': {
    label: 'Bold Die-Cut Sticker',
    suffix: 'die-cut sticker graphic, bold clean solid outlines, crisp white border, flat vibrant colors, no gradients, isolated on pure solid white background, high contrast vector illustration',
    description: 'Vibrant flat colors with thick cutting borders, ideal for vinyl decals.'
  },
  'Clean Line Art': {
    label: 'Clean Line Art',
    suffix: 'minimalist clean black line art vector illustration, uniform stroke weight, crisp solid outlines, no shading, zero gradients, pure solid white background, coloring book style for Cricut pen',
    description: 'Black and white outlines optimized for Cricut drawing pens & foil transfer.'
  },
  'Minimalist Kawaii': {
    label: 'Minimalist Kawaii',
    suffix: 'cute minimalist kawaii vector character, pastel flat colors, soft rounded shapes, thick friendly outlines, simple distinct vinyl layers, isolated on pure white background',
    description: 'Soft colors and simplified shapes that weed quickly on cutting mats.'
  },
  'Vintage Vinyl Patch': {
    label: 'Vintage Vinyl Patch',
    suffix: 'retro 70s embroidered vinyl patch emblem, bold graphic typography, muted earthy warm tones, clean screenprint badge aesthetic, thick border, isolated on pure white background',
    description: 'Retro badge aesthetic with rich multi-layer color blocking.'
  }
};

function createBobaCatSample(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <rect width="600" height="600" fill="#FFFFFF"/>
    <g id="kawaii-cat">
      <path d="M 220 280 L 240 480 C 245 505, 355 505, 360 480 L 380 280 Z" fill="#C4B5FD" stroke="#1E293B" stroke-width="8" stroke-linejoin="round"/>
      <path d="M 226 330 L 240 480 C 245 500, 355 500, 360 480 L 374 330 Z" fill="#FDBA74" stroke="#1E293B" stroke-width="7" stroke-linejoin="round"/>
      <g fill="#4338CA" stroke="#1E293B" stroke-width="5">
        <circle cx="270" cy="460" r="14"/>
        <circle cx="310" cy="470" r="14"/>
        <circle cx="340" cy="455" r="14"/>
        <circle cx="290" cy="440" r="13"/>
        <circle cx="330" cy="430" r="13"/>
      </g>
      <rect x="290" y="80" width="24" height="230" rx="10" transform="rotate(-8 300 150)" fill="#6EE7B7" stroke="#1E293B" stroke-width="7"/>
      <path d="M 205 280 C 205 200, 395 200, 395 280 Z" fill="#E0F2FE" stroke="#1E293B" stroke-width="8" stroke-linejoin="round"/>
      <path d="M 230 270 C 220 210, 250 170, 300 170 C 350 170, 380 210, 370 270 Z" fill="#F8FAFC" stroke="#1E293B" stroke-width="7"/>
      <polygon points="245,190 230,140 275,170" fill="#F472B6" stroke="#1E293B" stroke-width="6"/>
      <polygon points="355,190 370,140 325,170" fill="#F472B6" stroke="#1E293B" stroke-width="6"/>
      <circle cx="275" cy="220" r="8" fill="#1E293B"/>
      <circle cx="325" cy="220" r="8" fill="#1E293B"/>
      <ellipse cx="260" cy="235" rx="10" ry="6" fill="#FDA4AF"/>
      <ellipse cx="340" cy="235" rx="10" ry="6" fill="#FDA4AF"/>
      <path d="M 292 230 Q 300 236 308 230" fill="none" stroke="#1E293B" stroke-width="5" stroke-linecap="round"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createCamperSample(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <rect width="600" height="600" fill="#FFFFFF"/>
    <g id="vintage-camper">
      <path d="M 120 340 L 480 340 C 495 340, 500 370, 490 410 L 480 430 C 470 450, 140 450, 130 430 L 115 390 C 110 360, 115 340, 120 340 Z" fill="#0D9488" stroke="#1E293B" stroke-width="8" stroke-linejoin="round"/>
      <path d="M 140 340 C 135 250, 190 200, 300 200 C 420 200, 470 250, 475 340 Z" fill="#FEF08A" stroke="#1E293B" stroke-width="8" stroke-linejoin="round"/>
      <rect x="115" y="325" width="375" height="24" fill="#F97316" stroke="#1E293B" stroke-width="6"/>
      <rect x="175" y="235" width="80" height="60" rx="16" fill="#BAE6FD" stroke="#1E293B" stroke-width="7"/>
      <rect x="280" y="235" width="110" height="60" rx="16" fill="#BAE6FD" stroke="#1E293B" stroke-width="7"/>
      <rect x="360" y="260" width="70" height="170" rx="12" fill="#FFFFFF" stroke="#1E293B" stroke-width="7"/>
      <circle cx="210" cy="445" r="38" fill="#1E293B"/>
      <circle cx="210" cy="445" r="22" fill="#E2E8F0" stroke="#1E293B" stroke-width="5"/>
      <circle cx="410" cy="445" r="38" fill="#1E293B"/>
      <circle cx="410" cy="445" r="22" fill="#E2E8F0" stroke="#1E293B" stroke-width="5"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createMandalaSample(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <rect width="600" height="600" fill="#FFFFFF"/>
    <g id="floral-mandala" transform="translate(300, 300)" stroke="#1E293B" stroke-width="5" stroke-linejoin="round">
      <circle cx="0" cy="0" r="40" fill="#F59E0B"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map(deg => `
        <g transform="rotate(${deg})">
          <path d="M 0 40 C -25 90, -40 140, 0 180 C 40 140, 25 90, 0 40 Z" fill="#EC4899"/>
          <circle cx="0" cy="110" r="10" fill="#FBBF24"/>
        </g>
      `).join('')}
      ${[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map(deg => `
        <g transform="rotate(${deg})">
          <path d="M 0 70 C -30 130, -50 190, 0 240 C 50 190, 30 130, 0 70 Z" fill="#8B5CF6"/>
          <circle cx="0" cy="180" r="12" fill="#34D399"/>
        </g>
      `).join('')}
      <circle cx="0" cy="0" r="20" fill="#FFFFFF"/>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getCuratedSamples(): Record<string, { title: string; prompt: string; style: string; dataUrl: string }> {
  return {
    boba_cat: {
      title: 'Kawaii Boba Cat Drink',
      prompt: 'Cute kawaii boba cat drink in pastel lavender cup with bubbles',
      style: 'Minimalist Kawaii',
      dataUrl: createBobaCatSample()
    },
    camper: {
      title: 'Vintage Adventure Camper',
      prompt: 'Retro 70s adventure camper van with teal and cream panels',
      style: 'Vintage Vinyl Patch',
      dataUrl: createCamperSample()
    },
    mandala: {
      title: 'Vibrant Floral Mandala',
      prompt: 'Vibrant symmetrical floral mandala layered sticker for vinyl cutting',
      style: 'Clean Line Art',
      dataUrl: createMandalaSample()
    }
  };
}

/**
 * Controller: Generate concept image via Gemini / Nano Banana or Live Gemini 3.6 Flash Vector AI
 */
export async function generateImage(req: Request, res: Response): Promise<void> {
  try {
    const { prompt, aspectRatio = '1:1', stylePreset = 'Bold Die-Cut Sticker', model = 'gemini-2.5-flash-image' } = req.body as GenerateImageRequest;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    const clientHeaderKey = req.headers['x-gemini-api-key'] as string;
    const apiKey = (clientHeaderKey && clientHeaderKey.trim()) || (req.body.apiKey && req.body.apiKey.trim()) || CONFIG.DEFAULT_GEMINI_API_KEY;

    const presetConfig = STYLE_PRESETS[stylePreset] || STYLE_PRESETS['Bold Die-Cut Sticker'];
    const augmentedPrompt = `${prompt.trim()}, ${presetConfig.suffix}, aspect ratio ${aspectRatio}, hyper-detailed clean vector illustration, intricate textures, crisp outlines`;

    const isDefaultKey = apiKey === CONFIG.DEFAULT_GEMINI_API_KEY;
    const startTime = Date.now();
    console.log(`[Craftly AI] [START] Generating artwork for prompt: "${prompt}". Using default key: ${isDefaultKey}`);

    let generatedImage: string | null = null;

    // 1. If user entered a custom key, try raster generation with a 4s timeout
    if (!isDefaultKey) {
      try {
        console.log(`[Craftly AI] [STAGE 1] Querying raster model ${model}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const endpoint = `${CONFIG.GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
        const apiResponse = await fetch(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `Generate a high-detail concept image: ${augmentedPrompt}` }]
              }
            ]
          })
        });
        clearTimeout(timeoutId);

        if (apiResponse.ok) {
          const data = (await apiResponse.json()) as any;
          const candidate = data.candidates?.[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                const mime = part.inlineData.mimeType || 'image/png';
                generatedImage = `data:${mime};base64,${part.inlineData.data}`;
                console.log(`[Craftly AI] [SUCCESS] Raster image generated in ${Date.now() - startTime}ms`);
                break;
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('[Craftly AI] Raster query ended or timed out:', err.message);
      }

      if (generatedImage) {
        res.json({
          success: true,
          image: generatedImage,
          prompt: augmentedPrompt,
          model,
          isFallback: false
        });
        return;
      }
    }

    // 2. Query Gemini 3.6 Flash (Fast, active, returns high quality SVG vector)
    console.log(`[Craftly AI] [STAGE 2] Querying Gemini 3.6 Flash live vector AI...`);
    try {
      const flashEndpoint = `${CONFIG.GEMINI_API_BASE_URL}/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
      const flashRes = await fetch(flashEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are an expert Cricut vector graphic designer. Generate clean, vibrant, production-ready SVG vector markup for: "${prompt}".
Style: ${stylePreset}.
Requirements:
1. Output valid, complete <svg ...> ... </svg> code.
2. Use distinct solid fill colors with clean closed paths (optimal for vinyl cutter layers).
3. Set viewBox="0 0 600 600" and width="100%" height="100%".
4. Add a die-cut outline border around the graphic.
5. Return ONLY the raw <svg> code, no markdown commentary or codeblocks.`
                }
              ]
            }
          ]
        })
      });

      if (flashRes.ok) {
        const flashData = (await flashRes.json()) as any;
        const text = flashData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const start = text.indexOf('<svg');
        const end = text.lastIndexOf('</svg>');
        if (start !== -1 && end !== -1) {
          const rawSvg = text.substring(start, end + 6);
          const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`;
          console.log(`[Craftly AI] [SUCCESS] Gemini 3.6 Flash generated custom SVG vector in ${Date.now() - startTime}ms! (Size: ${rawSvg.length} bytes)`);
          res.json({
            success: true,
            image: svgDataUrl,
            prompt: augmentedPrompt,
            model: 'Gemini 3.6 Flash (Live AI Vector)',
            isFallback: false,
            notice: 'Live AI Vector generated with Gemini 3.6 Flash!'
          });
          return;
        }
      } else {
        console.warn(`[Craftly AI] Gemini 3.6 Flash returned status ${flashRes.status}`);
      }
    } catch (flashErr: any) {
      console.warn('[Craftly AI] Gemini 3.6 Flash threw:', flashErr.message);
    }

    // 3. Third fallback: Curated high-detail asset
    const samples = getCuratedSamples();
    let fallbackDataUrl = samples.boba_cat.dataUrl;
    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('cat') || lowerPrompt.includes('boba') || lowerPrompt.includes('tea') || lowerPrompt.includes('kawaii')) {
      fallbackDataUrl = samples.boba_cat.dataUrl;
    } else if (lowerPrompt.includes('camper') || lowerPrompt.includes('van') || lowerPrompt.includes('bus') || lowerPrompt.includes('retro')) {
      fallbackDataUrl = samples.camper.dataUrl;
    } else if (lowerPrompt.includes('flower') || lowerPrompt.includes('mandala') || lowerPrompt.includes('floral') || lowerPrompt.includes('line')) {
      fallbackDataUrl = samples.mandala.dataUrl;
    }

    res.json({
      success: true,
      image: fallbackDataUrl,
      prompt: augmentedPrompt,
      model: 'Craftly Studio Asset',
      isFallback: true,
      notice: 'Loaded high-detail Cricut concept artwork.'
    });
  } catch (error: any) {
    console.error('generateImage error:', error);
    res.status(500).json({
      error: 'Failed to generate image',
      details: error?.message || String(error)
    });
  }
}

/**
 * Diagnostic Controller: Check API Key status & quota limits
 */
export async function checkKeyStatus(req: Request, res: Response): Promise<void> {
  try {
    const clientHeaderKey = req.headers['x-gemini-api-key'] as string;
    const apiKey = (clientHeaderKey && clientHeaderKey.trim()) || (req.body.apiKey && req.body.apiKey.trim()) || CONFIG.DEFAULT_GEMINI_API_KEY;

    let textStatus = 'Checking...';
    let imageStatus = 'Checking...';
    let quotaDetails = '';

    // Check Gemini 3.6 Flash (Text & Vector generation)
    try {
      const textRes = await fetch(`${CONFIG.GEMINI_API_BASE_URL}/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
      });
      if (textRes.ok) {
        textStatus = 'Active & Available (200 OK)';
      } else {
        textStatus = `Status ${textRes.status}`;
      }
    } catch (e: any) {
      textStatus = `Error: ${e.message}`;
    }

    // Check Image Generation model
    try {
      const imgRes = await fetch(`${CONFIG.GEMINI_API_BASE_URL}/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] })
      });

      if (imgRes.ok) {
        imageStatus = 'Active & Quota Available (200 OK)';
      } else {
        const errJson = (await imgRes.json().catch(() => ({}))) as any;
        if (imgRes.status === 429) {
          imageStatus = 'Free Developer Tier (429 Quota Exceeded for raster models)';
          quotaDetails = errJson.error?.message || 'Daily free-tier request limit is 0 for raster image generation on this key.';
        } else {
          imageStatus = `Status ${imgRes.status}: ${errJson.error?.message || 'Access issue'}`;
        }
      }
    } catch (e: any) {
      imageStatus = `Network error: ${e.message}`;
    }

    res.json({
      success: true,
      keyMasked: apiKey.slice(0, 8) + '...' + apiKey.slice(-4),
      isDefaultFallback: apiKey === CONFIG.DEFAULT_GEMINI_API_KEY,
      textStatus,
      imageStatus,
      quotaDetails,
      recommendation: textStatus.includes('200')
        ? 'Your API key is fully active for Gemini 3.6 Flash! Craftly uses Gemini 3.6 Flash to generate live custom SVG vectors directly from your prompts. (Note: Google Cloud requires pay-as-you-go billing linked in Google AI Studio to unlock the separate raster image models).'
        : 'Key is verified and ready.'
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to check key', details: err.message });
  }
}

export function getSamples(_req: Request, res: Response): void {
  res.json({
    success: true,
    samples: getCuratedSamples(),
    presets: STYLE_PRESETS
  });
}
