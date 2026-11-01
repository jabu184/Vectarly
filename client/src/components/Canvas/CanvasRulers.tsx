import React, { useRef, useEffect } from 'react';
import type { MeasurementUnit } from '../../services/units';
import { PIXELS_PER_INCH, PIXELS_PER_CM } from '../../services/units';

interface CanvasRulersProps {
  isVisible: boolean;
  unit: MeasurementUnit;
  onToggleUnit: () => void;
  zoomLevel: number;
  canvasWidth: number;
  canvasHeight: number;
  cursorPos: { x: number; y: number } | null;
}

const RULER_THICKNESS = 22; // px

export const CanvasRulers: React.FC<CanvasRulersProps> = ({
  isVisible,
  unit,
  onToggleUnit,
  zoomLevel,
  canvasWidth,
  canvasHeight,
  cursorPos
}) => {
  const topCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw Horizontal & Vertical Rulers
  useEffect(() => {
    if (!isVisible) return;

    const topCanvas = topCanvasRef.current;
    const leftCanvas = leftCanvasRef.current;
    if (!topCanvas || !leftCanvas) return;

    const pxPerUnit = (unit === 'in' ? PIXELS_PER_INCH : PIXELS_PER_CM) * zoomLevel;

    // --- 1. Draw Top Horizontal Ruler ---
    const topCtx = topCanvas.getContext('2d');
    if (topCtx) {
      topCtx.clearRect(0, 0, topCanvas.width, topCanvas.height);
      topCtx.fillStyle = '#FFFFFF';
      topCtx.fillRect(0, 0, topCanvas.width, topCanvas.height);

      topCtx.strokeStyle = '#CBD5E1';
      topCtx.lineWidth = 1;
      topCtx.beginPath();
      topCtx.moveTo(0, RULER_THICKNESS - 0.5);
      topCtx.lineTo(topCanvas.width, RULER_THICKNESS - 0.5);
      topCtx.stroke();

      topCtx.fillStyle = '#64748B';
      topCtx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      topCtx.textAlign = 'left';

      const totalUnits = Math.ceil(topCanvas.width / pxPerUnit) + 1;
      for (let i = 0; i <= totalUnits; i++) {
        const x = Math.round(i * pxPerUnit);

        // Major tick
        topCtx.beginPath();
        topCtx.moveTo(x + 0.5, 0);
        topCtx.lineTo(x + 0.5, RULER_THICKNESS);
        topCtx.strokeStyle = '#94A3B8';
        topCtx.stroke();

        // Label
        if (i > 0 || unit === 'cm') {
          topCtx.fillText(`${i}${unit === 'in' ? '"' : ''}`, x + 3, 11);
        }

        // Sub-ticks
        const subDivisions = unit === 'in' ? 4 : 2;
        for (let s = 1; s < subDivisions; s++) {
          const subX = Math.round(x + (s * pxPerUnit) / subDivisions);
          if (subX < topCanvas.width) {
            topCtx.beginPath();
            topCtx.moveTo(subX + 0.5, s === 2 && unit === 'in' ? 10 : 14);
            topCtx.lineTo(subX + 0.5, RULER_THICKNESS);
            topCtx.strokeStyle = '#CBD5E1';
            topCtx.stroke();
          }
        }
      }

      // Cursor indicator on top ruler
      if (cursorPos && cursorPos.x >= 0 && cursorPos.x <= topCanvas.width) {
        topCtx.strokeStyle = '#4F46E5';
        topCtx.lineWidth = 1.5;
        topCtx.beginPath();
        topCtx.moveTo(cursorPos.x, 0);
        topCtx.lineTo(cursorPos.x, RULER_THICKNESS);
        topCtx.stroke();
      }
    }

    // --- 2. Draw Left Vertical Ruler ---
    const leftCtx = leftCanvas.getContext('2d');
    if (leftCtx) {
      leftCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
      leftCtx.fillStyle = '#FFFFFF';
      leftCtx.fillRect(0, 0, leftCanvas.width, leftCanvas.height);

      leftCtx.strokeStyle = '#CBD5E1';
      leftCtx.lineWidth = 1;
      leftCtx.beginPath();
      leftCtx.moveTo(RULER_THICKNESS - 0.5, 0);
      leftCtx.lineTo(RULER_THICKNESS - 0.5, leftCanvas.height);
      leftCtx.stroke();

      leftCtx.fillStyle = '#64748B';
      leftCtx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

      const totalUnitsY = Math.ceil(leftCanvas.height / pxPerUnit) + 1;
      for (let i = 0; i <= totalUnitsY; i++) {
        const y = Math.round(i * pxPerUnit);

        // Major tick
        leftCtx.beginPath();
        leftCtx.moveTo(0, y + 0.5);
        leftCtx.lineTo(RULER_THICKNESS, y + 0.5);
        leftCtx.strokeStyle = '#94A3B8';
        leftCtx.stroke();

        // Label
        if (i > 0 || unit === 'cm') {
          leftCtx.save();
          leftCtx.translate(11, y + 3);
          leftCtx.fillText(`${i}${unit === 'in' ? '"' : ''}`, 0, 0);
          leftCtx.restore();
        }

        // Sub-ticks
        const subDivisions = unit === 'in' ? 4 : 2;
        for (let s = 1; s < subDivisions; s++) {
          const subY = Math.round(y + (s * pxPerUnit) / subDivisions);
          if (subY < leftCanvas.height) {
            leftCtx.beginPath();
            leftCtx.moveTo(s === 2 && unit === 'in' ? 10 : 14, subY + 0.5);
            leftCtx.lineTo(RULER_THICKNESS, subY + 0.5);
            leftCtx.strokeStyle = '#CBD5E1';
            leftCtx.stroke();
          }
        }
      }

      // Cursor indicator on left ruler
      if (cursorPos && cursorPos.y >= 0 && cursorPos.y <= leftCanvas.height) {
        leftCtx.strokeStyle = '#4F46E5';
        leftCtx.lineWidth = 1.5;
        leftCtx.beginPath();
        leftCtx.moveTo(0, cursorPos.y);
        leftCtx.lineTo(RULER_THICKNESS, cursorPos.y);
        leftCtx.stroke();
      }
    }
  }, [isVisible, unit, zoomLevel, canvasWidth, canvasHeight, cursorPos]);

  if (!isVisible) return null;

  return (
    <>
      {/* Corner Switcher: Click to toggle between Inches (in) and Centimeters (cm) */}
      <button
        onClick={onToggleUnit}
        title={`Units: ${unit.toUpperCase()} (Click to toggle to ${unit === 'in' ? 'cm' : 'in'})`}
        style={{ width: RULER_THICKNESS, height: RULER_THICKNESS }}
        className="absolute top-0 left-0 z-25 bg-slate-200 border-r border-b border-slate-300 font-mono text-[9px] font-bold text-slate-700 flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-700 transition-colors cursor-pointer select-none"
      >
        {unit}
      </button>

      {/* Top Horizontal Ruler */}
      <div
        style={{ left: RULER_THICKNESS, height: RULER_THICKNESS, right: 0 }}
        className="absolute top-0 z-20 overflow-hidden pointer-events-none select-none"
      >
        <canvas
          ref={topCanvasRef}
          width={canvasWidth}
          height={RULER_THICKNESS}
          className="w-full h-full block"
        />
      </div>

      {/* Left Vertical Ruler */}
      <div
        style={{ top: RULER_THICKNESS, width: RULER_THICKNESS, bottom: 0 }}
        className="absolute left-0 z-20 overflow-hidden pointer-events-none select-none"
      >
        <canvas
          ref={leftCanvasRef}
          width={RULER_THICKNESS}
          height={canvasHeight}
          className="w-full h-full block"
        />
      </div>
    </>
  );
};
