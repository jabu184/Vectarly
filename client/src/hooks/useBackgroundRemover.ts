import { useState, useCallback } from 'react';
import { removeBackground } from '@imgly/background-removal';

export interface UseBackgroundRemoverReturn {
  removeBg: (imageSource: string | HTMLImageElement | Blob) => Promise<string>;
  isRemoving: boolean;
  progress: number;
  statusText: string;
  error: string | null;
}

/**
 * Fallback color-key background stripper using HTML5 canvas
 * (Detects outer corner background colors and removes them smoothly with alpha feathering)
 */
async function fallbackRemoveBackground(imageSource: string | HTMLImageElement | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Sample corner pixels to determine background color
        const corners = [
          0, // Top-left
          (canvas.width - 1) * 4, // Top-right
          ((canvas.height - 1) * canvas.width) * 4, // Bottom-left
          ((canvas.height - 1) * canvas.width + (canvas.width - 1)) * 4 // Bottom-right
        ];

        let bgR = 255, bgG = 255, bgB = 255;
        let validCorners = 0;
        let sumR = 0, sumG = 0, sumB = 0;

        for (const idx of corners) {
          if (idx < data.length) {
            sumR += data[idx];
            sumG += data[idx + 1];
            sumB += data[idx + 2];
            validCorners++;
          }
        }

        if (validCorners > 0) {
          bgR = Math.round(sumR / validCorners);
          bgG = Math.round(sumG / validCorners);
          bgB = Math.round(sumB / validCorners);
        }

        // Color difference threshold
        const threshold = 32;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const diff = Math.sqrt(
            Math.pow(r - bgR, 2) +
            Math.pow(g - bgG, 2) +
            Math.pow(b - bgB, 2)
          );

          if (diff < threshold) {
            // Feather edge
            const alphaRatio = diff / threshold;
            data[i + 3] = Math.round(data[i + 3] * (alphaRatio < 0.4 ? 0 : alphaRatio));
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for background removal'));

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else if (imageSource instanceof Blob) {
      img.src = URL.createObjectURL(imageSource);
    } else if (imageSource instanceof HTMLImageElement) {
      img.src = imageSource.src;
    }
  });
}

export function useBackgroundRemover(): UseBackgroundRemoverReturn {
  const [isRemoving, setIsRemoving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const removeBg = useCallback(async (imageSource: string | HTMLImageElement | Blob): Promise<string> => {
    setIsRemoving(true);
    setProgress(5);
    setStatusText('Initializing AI background stripper...');
    setError(null);

    try {
      // First attempt local @imgly/background-removal neural inference
      const blobResult = await removeBackground(imageSource, {
        progress: (key: string, current: number, total: number) => {
          if (total > 0) {
            const percent = Math.round((current / total) * 100);
            setProgress(percent);
            setStatusText(`Stripping background: ${key.replace('fetch:', 'loading ')} (${percent}%)`);
          }
        }
      });

      setStatusText('Converting transparent PNG...');
      setProgress(95);

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blobResult);
      });

      setProgress(100);
      setStatusText('Background removed successfully!');
      return dataUrl;
    } catch (err: any) {
      console.warn('imgly background removal failed, switching to instant canvas color-key fallback:', err);
      setStatusText('Using edge color-key background removal...');
      try {
        const fallbackResult = await fallbackRemoveBackground(imageSource);
        setProgress(100);
        setStatusText('Background isolated via smart edge detection!');
        return fallbackResult;
      } catch (fallbackErr: any) {
        const msg = fallbackErr?.message || 'Background removal failed';
        setError(msg);
        throw fallbackErr;
      }
    } finally {
      setIsRemoving(false);
    }
  }, []);

  return {
    removeBg,
    isRemoving,
    progress,
    statusText,
    error
  };
}
