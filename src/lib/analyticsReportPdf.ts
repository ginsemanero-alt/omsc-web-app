// The Analytics PDF export (jsPDF + autotable), built from tables that are already worked out.
// Kept free of React and of the database so the layout can be generated and checked from mock data.
//
// Layout rules:
//   * a row is never split across two pages (rowPageBreak: 'avoid');
//   * a table that fits on one page is never split: it moves to the next page whole (pageBreak: 'avoid');
//   * a long table may split, but repeats its header row on every page;
//   * a section heading always sits on the same page as its table (heading + header + 2 rows must fit,
//     or a new page is added first);
//   * every page carries the same header (title, period, filters, definition); page 1 may also carry
//     the "no students match" banner.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawNoMatchBanner, drawWrappedCaption, drawEmptyLine } from './analyticsPdf';
import { withSmallGroupNote } from './analyticsFilters';

export type Cell = string | number;
export type Rgb = [number, number, number];

export interface ReachRowPdf {
  key: string;
  students: number;
  reached: number;
  pct: number | null;
}

export type ReachPdf =
  | { kind: 'unavailable'; scope: string }
  | { kind: 'empty'; scope: string }
  | { kind: 'data'; scope: string; byCourse: ReachRowPdf[]; byYearLevel: ReachRowPdf[] };

export interface ReportPdfInput {
  title: string;
  periodLabel: string;
  generatedAt: string;
  filtersLine: string;
  definition: string;
  // Page-1 banner when the filters match nobody; null otherwise.
  noMatch: boolean;
  overview: Cell[][];
  programAwareness: Cell[][];
  demographics: Cell[][];
  coverage: Cell[][];
  materialReachHeading: string;
  materialReach: Cell[][];
  recent: Cell[][];
  learning: { head: string[]; rows: Cell[][]; note?: string } | null;
  reach: ReachPdf;
}

const PAGE_HEIGHT = 297;
const BOTTOM = 18; // nothing is printed below PAGE_HEIGHT - BOTTOM
const LEFT = 14;
const WIDTH = 182;
const HEADING_HEIGHT = 6;
const NO_RECORDS_NOTE = 'No records found for the selected period.';

const pctPdf = (pct: number | null) => (pct === null ? '—' : `${pct}%`);

export function buildAnalyticsPdf(input: ReportPdfInput): jsPDF {
  const doc = new jsPDF() as any;

  // ---- header (every page)
  const drawHeader = (firstPage: boolean): number => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15);
    doc.text('OMSU GUIDANCE AND TESTING CENTER', LEFT, 18);

    doc.setFontSize(12);
    const titleLines: string[] = doc.splitTextToSize(input.title, WIDTH).slice(0, 2);
    doc.text(titleLines, LEFT, 26);
    const shift = (titleLines.length - 1) * 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Report Period: ${input.periodLabel}`, LEFT, 33 + shift);
    doc.text(`Generated: ${input.generatedAt}`, LEFT, 38 + shift);

    doc.setTextColor(40);
    const filterLines: string[] = doc.splitTextToSize(input.filtersLine, WIDTH);
    doc.text(filterLines, LEFT, 43 + shift);
    let y = 43 + shift + filterLines.length * 4;
    const definitionLines: string[] = doc.splitTextToSize(input.definition, WIDTH);
    doc.text(definitionLines, LEFT, y);
    y += definitionLines.length * 4;
    if (firstPage && input.noMatch) y = drawNoMatchBanner(doc, y);
    return y + 5;
  };

  // Where body content starts on a page WITHOUT the banner (pages 2+, and autotable's own page breaks).
  const normalBodyTop = (() => {
    const probe = new jsPDF() as any;
    probe.setFont('helvetica', 'bold');
    probe.setFontSize(12);
    const titleLines: string[] = probe.splitTextToSize(input.title, WIDTH).slice(0, 2);
    probe.setFont('helvetica', 'normal');
    probe.setFontSize(9);
    const filterLines: string[] = probe.splitTextToSize(input.filtersLine, WIDTH);
    const definitionLines: string[] = probe.splitTextToSize(input.definition, WIDTH);
    return 43 + (titleLines.length - 1) * 5 + filterLines.length * 4 + definitionLines.length * 4 + 5;
  })();

  const headered = new Set<number>();
  const currentPage = () => doc.internal.getCurrentPageInfo().pageNumber as number;

  let nextY = drawHeader(true);
  headered.add(currentPage());
  const limit = PAGE_HEIGHT - BOTTOM;

  const newPage = () => {
    doc.addPage();
    headered.add(currentPage());
    nextY = drawHeader(false);
  };

  // Height of a table on one tall page (a measurement only; nothing is drawn on the real document).
  const measure = (head: string[], body: Cell[][], fontSize: number, columnStyles?: Record<number, unknown>) => {
    const probe = new jsPDF({ unit: 'mm', format: [210, 4000] }) as any;
    autoTable(probe, {
      startY: 0,
      margin: { top: 0, left: LEFT, right: LEFT, bottom: 0 },
      head: [head],
      body,
      styles: { fontSize },
      columnStyles: columnStyles as any,
    });
    return (probe.lastAutoTable?.finalY as number) || 0;
  };

  interface TableSpec {
    title: string;
    head: string[];
    body: Cell[][];
    fill: Rgb;
    fontSize?: number;
    columnStyles?: Record<number, unknown>;
    placeholder?: boolean; // a row of dashes when there is nothing
    emptyNote?: string; // printed under the placeholder
    note?: string; // an italic note under the table
  }

  const placeTable = (spec: TableSpec) => {
    const fontSize = spec.fontSize ?? 12;
    const body = spec.body.length > 0 ? spec.body : [Array(spec.head.length).fill('—') as Cell[]];
    const full = measure(spec.head, body, fontSize, spec.columnStyles);
    const minimal = measure(spec.head, body.slice(0, 2), fontSize, spec.columnStyles);
    const pageCapacity = limit - normalBodyTop - HEADING_HEIGHT;
    const fitsOnePage = full <= pageCapacity;

    // The heading goes with its table: heading + the whole table if it can fit on a page,
    // otherwise heading + header row + 2 rows.
    if (nextY + HEADING_HEIGHT + (fitsOnePage ? full : minimal) > limit) newPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15);
    doc.text(spec.title, LEFT, nextY);
    nextY += HEADING_HEIGHT;

    autoTable(doc, {
      startY: nextY,
      head: [spec.head],
      body,
      headStyles: { fillColor: spec.fill, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize },
      columnStyles: spec.columnStyles as any,
      rowPageBreak: 'avoid',
      pageBreak: fitsOnePage ? 'avoid' : 'auto',
      showHead: 'everyPage',
      margin: { top: normalBodyTop, bottom: BOTTOM, left: LEFT, right: LEFT },
      didDrawPage: () => {
        if (!headered.has(currentPage())) {
          headered.add(currentPage());
          drawHeader(false);
        }
      },
    });
    nextY = ((doc.lastAutoTable?.finalY as number) || nextY) + 6;

    if (spec.body.length === 0 && spec.emptyNote) {
      if (nextY + 6 > limit) newPage();
      nextY = drawEmptyLine(doc, spec.emptyNote, LEFT, nextY);
    }
    if (spec.note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100);
      const lines: string[] = doc.splitTextToSize(spec.note, 180);
      if (nextY + lines.length * 3.6 > limit) newPage();
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(lines, LEFT, nextY);
      nextY += lines.length * 3.6 + 4;
    }
    nextY += 4;
  };

  // ---- the sections, in the same order as before
  placeTable({ title: 'Overview metrics', head: ['Metric', 'Value'], body: input.overview, fill: [15, 23, 42] });
  placeTable({
    title: 'Program awareness summary',
    head: ['Program', 'Guidance service', 'Avg. score', 'Responses'],
    body: input.programAwareness,
    fill: [79, 70, 229],
    emptyNote: NO_RECORDS_NOTE,
  });
  placeTable({ title: 'Demographic breakdown', head: ['Dimension', 'Segment', 'Count'], body: input.demographics, fill: [5, 150, 105] });
  placeTable({ title: 'Guidance service coverage', head: ['Guidance service', 'Programs', 'Avg. awareness score'], body: input.coverage, fill: [217, 119, 6] });
  // "Awareness by material exposure" is not printed: it relied on surveys.iec_category, which no survey has,
  // so it was always empty. See SHOW_MATERIAL_EXPOSURE in AnalyticsDashboard.tsx.
  placeTable({
    title: input.materialReachHeading,
    head: ['Category', 'Materials', 'Downloads'],
    body: input.materialReach,
    fill: [190, 24, 93],
    emptyNote: NO_RECORDS_NOTE,
  });
  placeTable({
    title: 'Recent IEC materials',
    head: ['Title', 'Format', 'Category', 'Campus', 'Downloads', 'Created'],
    body: input.recent,
    fill: [79, 70, 229],
    fontSize: 10,
    columnStyles: { 1: { cellWidth: 26 }, 4: { cellWidth: 24 }, 5: { cellWidth: 26 } },
  });
  if (input.learning) {
    // Seven columns: a smaller font and fixed widths keep "+9.6 pts" on one line.
    placeTable({
      title: 'Learning gain (pre-test vs post-test)',
      head: input.learning.head,
      body: input.learning.rows,
      fill: [79, 70, 229],
      fontSize: 9,
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 18 },
        2: { cellWidth: 19 },
        3: { cellWidth: 19 },
        4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 25 },
        6: { cellWidth: 22 },
      },
      note: input.learning.note,
    });
  }

  // ---- Material reach by course (its own page)
  newPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15);
  doc.text('Material reach by course', LEFT, nextY);
  nextY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100);
  nextY = drawWrappedCaption(doc, input.reach.scope, LEFT, nextY, 180).nextY;

  if (input.reach.kind === 'unavailable') {
    nextY = drawEmptyLine(doc, 'Material reach could not be loaded.', LEFT, nextY);
  } else if (input.reach.kind === 'empty') {
    nextY = drawEmptyLine(doc, 'No students match the current filters.', LEFT, nextY);
  } else {
    const reach = input.reach;
    // Native bar chart: % reached per course. The label wraps onto up to two lines, so
    // long course names stay distinguishable instead of being cut at the same place.
    const labelWidth = 80;
    const barMaxWidth = 76;
    const barHeight = 6;
    const lineHeight = 3.4;
    const barGap = 3;
    for (const row of reach.byCourse) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const all: string[] = doc.splitTextToSize(row.key, labelWidth - 3);
      const label = all.slice(0, 2);
      if (all.length > 2) label[1] = `${label[1].replace(/\s+\S*$/, '')}…`;
      const rowHeight = Math.max(barHeight, label.length * lineHeight + 1.5);
      if (nextY + rowHeight > limit) newPage();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30);
      doc.text(label, LEFT, nextY + 3.4);
      const barY = nextY + (rowHeight - barHeight) / 2;
      doc.setFillColor(238, 240, 250);
      doc.rect(LEFT + labelWidth, barY, barMaxWidth, barHeight, 'F');
      doc.setFillColor(79, 70, 229);
      const barWidth = (barMaxWidth * (row.pct ?? 0)) / 100;
      if (barWidth > 0) doc.rect(LEFT + labelWidth, barY, barWidth, barHeight, 'F');
      doc.text(pctPdf(row.pct), LEFT + labelWidth + barMaxWidth + 2, barY + 4.2);
      nextY += rowHeight + barGap;
    }
    nextY += 4;

    placeTable({
      title: 'Material reach by course (table)',
      head: ['Course', 'Students', 'Opened at least one', 'Reached'],
      body: reach.byCourse.map((row) => [withSmallGroupNote(row.key, row.students), row.students, row.reached, pctPdf(row.pct)]),
      fill: [79, 70, 229],
      fontSize: 10,
    });
    placeTable({
      title: 'Material reach by year level',
      head: ['Year level', 'Students', 'Opened at least one', 'Reached'],
      body: reach.byYearLevel.map((row) => [withSmallGroupNote(row.key, row.students), row.students, row.reached, pctPdf(row.pct)]),
      fill: [79, 70, 229],
      fontSize: 10,
      note:
        'Percentages are based on students with an account in the system, not on total enrollment. ' +
        'Material views are recorded only since IEC materials were linked to programs, so reach for earlier students may be understated.',
    });
  }

  return doc as jsPDF;
}
