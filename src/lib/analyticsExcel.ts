// The Analytics report as an Excel (.xlsx) workbook. The library is loaded only
// when the admin presses the button, so it adds nothing to the page's weight.
//
// Every sheet starts with the same four lines (title, the filters in force, the
// definition of "participants", and when it was made), so a sheet that is
// copied out of the workbook still says what it covers. Aggregates only:
// never a name, an email, or a student ID.

export interface ReportSection {
  title: string;
  head: string[];
  rows: (string | number)[][];
  note?: string;
}

export interface ReportModel {
  title: string;
  periodLabel: string;
  generatedAt: string;
  filtersLine: string;
  definition: string;
  sections: ReportSection[];
  fileBase: string;
}

// An Excel sheet name: at most 31 characters, none of  \ / ? * [ ] :  and unique.
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${n++}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function downloadReportXlsx(model: ReportModel): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');

  const used = new Set<string>();
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });
  const header = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#EEF0FA' });

  const sheets = model.sections.map((section) => {
    const data: any[][] = [
      [bold(model.title)],
      [model.filtersLine],
      [model.definition],
      [`Report period: ${model.periodLabel} · Generated: ${model.generatedAt}`],
      [],
      [bold(section.title)],
      section.head.map(header),
      ...(section.rows.length > 0 ? section.rows : [[...section.head.map(() => '—')]]),
    ];
    if (section.note) data.push([], [section.note]);
    return {
      data,
      sheet: sheetName(section.title, used),
      columns: section.head.map((_, index) => ({ width: index === 0 ? 38 : 22 })),
    };
  });

  await writeExcelFile(sheets).toFile(`${model.fileBase}.xlsx`);
}
