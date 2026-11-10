// Small layout helpers for the Analytics PDF export. They only position text, so they can be checked
// on their own (a long caption must push everything below it down; an empty state is one clean line).
import { NO_MATCH_TEXT } from './analyticsFilters';

// Just enough of jsPDF for these helpers.
interface PdfLike {
  setFont: (name: string, style?: string) => unknown;
  setFontSize: (size: number) => unknown;
  setTextColor: (...args: number[]) => unknown;
  setFillColor: (...args: number[]) => unknown;
  setDrawColor: (...args: number[]) => unknown;
  rect: (x: number, y: number, w: number, h: number, style?: string) => unknown;
  text: (text: string | string[], x: number, y: number) => unknown;
  splitTextToSize: (text: string, maxWidth: number) => string[];
}

export const CAPTION_LINE_HEIGHT = 3.6;

// "No students match the selected filters (0 students). Remove some filters and export again."
// as a boxed banner starting at y. Returns the y just below the box.
export function drawNoMatchBanner(doc: PdfLike, y: number, x = 14, width = 182): number {
  const lines = doc.splitTextToSize(NO_MATCH_TEXT, width - 6);
  const boxHeight = lines.length * 5 + 4;
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(217, 119, 6);
  doc.rect(x, y + 2, width, boxHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(146, 64, 14);
  doc.text(lines, x + 3, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  return y + boxHeight + 4;
}

// A caption that may be long: wrapped to maxWidth, and the returned y is below its LAST line.
export function drawWrappedCaption(doc: PdfLike, text: string, x: number, y: number, maxWidth: number): { lines: string[]; nextY: number } {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return { lines, nextY: y + lines.length * CAPTION_LINE_HEIGHT + 5 };
}

// An empty-state message as one clean line.
export function drawEmptyLine(doc: PdfLike, text: string, x: number, y: number): number {
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(text, x, y);
  return y + 8;
}
