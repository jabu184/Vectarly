import { Router } from 'express';
import { generateImage, getSamples, checkKeyStatus } from '../controllers/gemini.controller';
import { vectorizeImage } from '../controllers/vector.controller';

export const apiRouter = Router();

apiRouter.post('/generate', generateImage);
apiRouter.post('/vectorize', vectorizeImage);
apiRouter.get('/samples', getSamples);
apiRouter.post('/check-key', checkKeyStatus);
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Craftly AI & Vector Server',
    vtracerLoaded: true,
    timestamp: new Date().toISOString()
  });
});
