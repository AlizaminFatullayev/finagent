import ExcelJS from 'exceljs';
import { METHODOLOGY_NOTE, type ReportData } from './types.js';

/**
 * Spreadsheet apps execute cells that start with these characters as formulas (CSV/formula
 * injection, OWASP). Cell text comes from user files, so every string is neutralised with a
 * leading apostrophe-equivalent: a single quote that Excel shows as plain text.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
export const safeCell = (value: string | number | null | undefined) =>
  typeof value === 'string' && FORMULA_START.test(value) ? `'${value}` : (value ?? '');

export async function buildXlsxReport(report: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinAgent';
  wb.created = report.generatedAt;

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 32 }, { width: 100 }];
  const add = (label: string, value: string | number) => summary.addRow([safeCell(label), safeCell(value)]);
  add('Report', report.title);
  add('File', report.fileName);
  add('Generated at (UTC)', report.generatedAt.toISOString());
  add('Headline', report.summary.headline);
  summary.addRow([]);
  for (const m of report.summary.keyMetrics) add(m.label, m.value);
  for (const [label, items] of [
    ['Trends', report.summary.trends],
    ['Risks', report.summary.risks],
    ['Recommendations', report.summary.recommendations],
    ['Caveats', report.summary.caveats],
  ] as const) {
    items.forEach((item, i) => add(i === 0 ? label : '', item));
  }
  summary.getColumn(1).font = { bold: true };
  summary.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  const anomalies = wb.addWorksheet('Anomalies');
  anomalies.columns = [
    { header: 'ID', width: 6 },
    { header: 'Severity', width: 10 },
    { header: 'Type', width: 22 },
    { header: 'Sheet', width: 16 },
    { header: 'Column', width: 18 },
    { header: 'Description', width: 90 },
    { header: 'Affected rows', width: 14 },
    { header: 'Row numbers (first 50)', width: 40 },
  ];
  anomalies.getRow(1).font = { bold: true };
  for (const a of report.anomalies) {
    anomalies.addRow(
      [
        a.id,
        a.severity,
        a.type,
        a.sheet,
        a.column,
        a.description,
        a.affectedCount,
        a.rowIndexes.join(', '),
      ].map(safeCell),
    );
  }
  anomalies.views = [{ state: 'frozen', ySplit: 1 }];

  const method = wb.addWorksheet('Methodology');
  method.columns = [{ width: 26 }, { width: 110 }];
  method.addRow(['Note', safeCell(METHODOLOGY_NOTE)]);
  method.addRow(['Algorithm version', report.algorithmVersion]);
  method.addRow(['Language model', safeCell(report.model ?? 'n/a')]);
  for (const r of report.methodology) method.addRow([r.ruleId, safeCell(r.description)]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
