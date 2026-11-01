import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { CONFIG } from './config';
import { apiRouter } from './routes/api';

const app = express();

// Middleware
app.use(cors());
// Set generous body parser limits for high-resolution PNG/SVG payload transfers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Mount API routes
app.use('/api', apiRouter);

// Check for compiled client dist directory for full-stack production serving
const potentialDistPaths = [
  process.env.CLIENT_DIST_PATH,
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(__dirname, '../../client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(__dirname, './client/dist')
].filter(Boolean) as string[];

const clientDistPath = potentialDistPaths.find((p) => fs.existsSync(p));

if (clientDistPath) {
  console.log(`[Vectarly Server] Serving compiled frontend from ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/assets')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Root route - Welcome / Status Dashboard for API-only dev mode
  app.get('/', (_req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vectarly API Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #FAF9F6; color: #0F172A; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: white; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); padding: 36px; max-width: 580px; width: 100%; border: 1px solid #E2E8F0; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: #EEF2FF; color: #4F46E5; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; }
    .dot { width: 8px; height: 8px; background: #10B981; border-radius: 50%; }
    h1 { font-size: 24px; font-weight: 800; margin: 0 0 8px; color: #0F172A; }
    p { font-size: 14px; color: #64748B; margin: 0 0 24px; line-height: 1.5; }
    .endpoints { background: #F8FAFC; border-radius: 12px; padding: 16px; border: 1px solid #E2E8F0; font-size: 13px; font-family: ui-monospace, monospace; }
    .endpoints div { margin-bottom: 8px; }
    .method { font-weight: bold; color: #4F46E5; }
    .btn { display: inline-block; background: #4F46E5; color: white; text-decoration: none; font-weight: 600; font-size: 13px; padding: 12px 20px; border-radius: 12px; margin-top: 20px; transition: background 0.2s; }
    .btn:hover { background: #4338CA; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Vectarly Engine Online</div>
    <h1>Vectarly Backend API (Port ${CONFIG.PORT})</h1>
    <p>The Vectarly Express backend and VTracer WebAssembly vectorizer engine are running and ready.</p>
    
    <div class="endpoints">
      <div><span class="method">POST</span> /api/generate ➔ Gemini Concept Generator</div>
      <div><span class="method">POST</span> /api/vectorize ➔ VTracer SVG Engine</div>
      <div><span class="method">GET</span> /api/samples ➔ Curated Vector Presets</div>
      <div><span class="method">GET</span> /api/health ➔ Service Status</div>
    </div>

    <a href="http://localhost:5173" class="btn">Open Vectarly Studio App (Port 5173) &rarr;</a>
  </div>
</body>
</html>
    `);
  });
}

// Start HTTP server (bind to 0.0.0.0 for LAN access)
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`[Craftly Server] Running at http://localhost:${CONFIG.PORT} and on network interfaces`);
  console.log(`[Craftly Server] Ready for VTracer vectorization and Gemini generation.`);
});
