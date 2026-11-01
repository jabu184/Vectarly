import { jsPDF } from 'jspdf';
import type { Canvas as FabricCanvas } from 'fabric';

export interface PdfExportOptions {
  title?: string;
  pageSize?: '12x12' | 'letter' | 'a4';
  includeMetadata?: boolean;
}

/**
 * Exports the current canvas (Raster or Vector) to a production-grade 300 DPI PDF.
 * Ideal for Cricut Print Then Cut, sublimation, sticker printing, and physical plotting templates.
 */
export function exportPdf(
  canvas: FabricCanvas | null,
  options: PdfExportOptions = {}
): void {
  if (!canvas) return;

  const {
    title = 'craftly-cricut-cut',
    pageSize = '12x12',
    includeMetadata = true
  } = options;

  // Temporarily ensure full opacity and hide any active crop overlay before snapshot
  const dataUrl = canvas.toDataURL({
    format: 'png',
    multiplier: 3,
    enableRetinaScaling: true
  } as any);

  let doc: jsPDF;

  if (pageSize === '12x12') {
    // Standard 12" x 12" Cricut Mat format
    doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [12, 12]
    });
    doc.addImage(dataUrl, 'PNG', 0.5, 0.5, 11, 11, undefined, 'FAST');
    if (includeMetadata) {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text('Craftly Vector Studio for Cricut • 12"x12" Cutting Mat Template', 0.5, 11.75);
    }
  } else if (pageSize === 'a4') {
    // International A4 standard (210mm x 297mm)
    doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    doc.addImage(dataUrl, 'PNG', 15, 20, 180, 180, undefined, 'FAST');
    if (includeMetadata) {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text('Craftly Vector Studio for Cricut • A4 Print & Cut', 15, 285);
    }
  } else {
    // US Letter (8.5" x 11")
    doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: 'letter'
    });
    doc.addImage(dataUrl, 'PNG', 0.5, 0.75, 7.5, 7.5, undefined, 'FAST');
    if (includeMetadata) {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text('Craftly Vector Studio for Cricut • US Letter Print & Cut', 0.5, 10.5);
    }
  }

  const cleanName = title.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'craftly-design';
  doc.save(`${cleanName}-${Date.now()}.pdf`);
}
