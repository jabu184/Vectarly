import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  DEFAULT_GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_API_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
  DEFAULT_MODELS: [
    'gemini-2.5-flash-image',
    'gemini-nano-banana-2.1',
    'gemini-3.1-flash-image'
  ]
};
