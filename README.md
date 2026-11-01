# Craftly ✂️🎨

> **AI Vector & Line-Art Studio for Cricut & Vinyl Plotters**

Craftly is a modern, lightweight, and inviting web studio designed specifically for crafters, vinyl makers, and Cricut owners. It transforms text prompts or uploaded sketches into production-grade multi-layer SVG vectors with interactive color swapping, Bézier curve smoothing, and Cricut Pen line-art conversion.

---

## ✨ Features & User Workflow

### Phase 1: AI Prompting & Generation
- **Google Gemini & Nano Banana Engine**: Powered by Google Gemini image models (`gemini-2.5-flash-image` / `gemini-nano-banana-2.1`) via REST endpoints.
- **Smart Suffix Augmentation**: Automatically enriches prompts with Cricut-optimal keywords (`die-cut sticker graphic, bold clean solid outlines, flat vibrant colors, no gradients, isolated on pure solid white background`).
- **Prompt Presets**: Quick presets including the required test case (*"A black and white whippet wearing a Christmas jumper and festive hat"*), Kawaii Boba Cat, Vintage Camper, and Floral Mandala.
- **Aspect Ratio Selector**: 1:1 (Square), 4:5 (Sticker sheet), 16:9 (Banner).
- **Manual Image Dropzone**: Drag and drop any PNG, JPG, or WebP to edit immediately.

### Phase 2: Raster Pre-Processing & Isolation
- **Client-Side AI Background Stripping**: Fast in-browser background removal using `@imgly/background-removal` (WASM neural inference) with an intelligent canvas color-key fallback.
- **Interactive Fabric.js Crop**:
  - Rectangular bounding box crop with live resizing and placement.
  - Live posterize and color reduction visual preview.

### Phase 3: High-Fidelity Server Vectorization (`POST /api/vectorize`)
- Powered by `@visioncortex/vtracer` WebAssembly engine running on Node.js:
  - **`hierarchical: 'cutout'`**: Produces seam-free, tessellated SVG shapes without overlapping vinyl layers (essential for Cricut cutting mats).
  - **`mode: 'spline' | 'polygon'`**: High-precision Bézier curve smoothing that minimizes excessive nodes.
  - **`filterSpeckle: 4`**: Cleans up tiny cut-chads that snag cutter blades.
  - **`colorPrecision: 6-8`**: Quantizes colors into distinct, weedable Cricut cutting layers.

### Phase 4: Vector Studio & Interactive Cricut Mats
- **Interactive Vinyl Swatch Tray**:
  - Automatically identifies all distinct `fill` colors.
  - Clicking any color swatch opens a color picker that swaps that color across every matching path in the SVG simultaneously.
  - Layer visibility toggles (hide/show individual mats to preview physical vinyl sheets).
  - Layer delete tool to strip unwanted background shapes or elements.
- **Direct Canvas Path Selection**: Click any vector element directly on the Fabric.js canvas to view its bounds, change its fill color, or delete it.
- **Line-Art / Coloring Page Converter**: One-click toggle that strips all fills (`fill: none`) and generates uniform `2px` black outlines optimized for Cricut fine-point drawing pens and foil transfer tools.

### Phase 5: Production Exporting
- **Cricut SVG**: Sanitized IDs, clean viewBox, organized layers ready to upload to Cricut Design Space.
- **Print Then Cut PNG**: 300 DPI transparent PNG.
- **Pen Line-Art SVG**: Outlines with zero fill.

---

## 🛠️ Tech Stack & Directory Structure

```text
craftly/
├── server/
│   ├── src/
│   │   ├── config.ts              # API keys and environment defaults
│   │   ├── controllers/
│   │   │   ├── gemini.controller.ts # Proxy for Gemini/Nano Banana image calls
│   │   │   └── vector.controller.ts # VTracer conversion service
│   │   ├── routes/
│   │   │   └── api.ts
│   │   └── index.ts               # Express bootstrap (port 5000)
│   ├── tsconfig.json
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header/            # Craftly navigation, mode switch, export CTA
│   │   │   ├── Canvas/            # Fabric.js editor wrapper with 12x12 mat grid
│   │   │   ├── Toolbar/           # PromptBar & RasterInspector tools
│   │   │   ├── Palette/           # VectorInspector with vinyl mat swapper
│   │   │   └── SettingsModal.tsx  # API key storage & configuration
│   │   ├── hooks/
│   │   │   ├── useFabricCanvas.ts # Fabric.js v6 canvas engine
│   │   │   └── useBackgroundRemover.ts # @imgly/background-removal WASM
│   │   ├── services/
│   │   │   └── api.ts             # API client & localStorage manager
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── package.json
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
Dependencies for both backend and frontend are already installed. To reinstall if ever needed:
```bash
# In the root directory:
cd server && npm install
cd ../client && npm install
```

### 2. Run the Development Servers

Start the Express backend:
```bash
cd server
npm run dev
# Server runs on http://localhost:5000
```

In a second terminal, start the Vite frontend:
```bash
cd client
npm run dev
# Frontend runs on http://localhost:5173 (proxied to backend at /api)
```

Or from the root directory:
```bash
npm run server    # starts server
npm run client    # starts client
```

### 3. API Key & Settings
- You can configure your Gemini API key via a `server/.env` file (`GEMINI_API_KEY=your_key_here`) or via the ⚙️ **Settings Modal** in the top navigation bar.
- Custom keys are stored securely in your browser's `localStorage` and take precedence.
- If Google API rate limits or quota triggers occur on the free tier, Craftly automatically provides intelligent, high-resolution concept fallback artwork so you can test all cropping, background stripping, VTracer vectorizing, color swapping, and exporting without interruption!

---

## 📄 License
MIT License. Crafted with precision for the vinyl cutting community.
