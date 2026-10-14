import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildPdfReport } from './pdf.js';
import type { ReportData } from './types.js';
import { buildXlsxReport, safeCell } from './xlsx.js';

const report: ReportData = {
  title: 'FinAgent analysis report',
  fileName: 'Hesabat.xlsx',
  generatedAt: new Date('2026-01-01T00:00:00Z'),
  language: 'az',
  model: 'mock',
  summary: {
    headline: 'Əməliyyatların təhlili: şübhəli ödənişlər aşkarlandı',
    keyMetrics: [{ label: 'Cəmi', value: '1,234.50' }],
    trends: [],
    risks: ['=HYPERLINK("http://evil","click")'],
    anomalyHighlights: [],
    recommendations: ['+cmd|calc', '@SUM(1)'],
    caveats: ['-2+3'],
  },
  anomalies: [
    {
      id: 'A1',
      ruleId: 'statistical-outliers',
      type: 'outlier',
      severity: 'HIGH',
      sheet: 'Transactions',
      column: '=1+1',
      description: 'One extreme value',
      rowIndexes: [5],
      affectedCount: 1,
      metrics: {},
    },
  ],
  severityCounts: { HIGH: 1, MEDIUM: 0, LOW: 0 },
  methodology: [{ ruleId: 'statistical-outliers', description: 'IQR and z-score' }],
  algorithmVersion: '1.0.0',
  verification: { checked: 1, verified: 1 },
};

describe('report export', () => {
  it('neutralises formula-like cells', () => {
    expect(safeCell('=1+1')).toBe("'=1+1");
    expect(safeCell('+x')).toBe("'+x");
    expect(safeCell('-x')).toBe("'-x");
    expect(safeCell('@x')).toBe("'@x");
    expect(safeCell('normal')).toBe('normal');
    expect(safeCell(-5)).toBe(-5);
  });

  it('writes an xlsx that reopens with the expected content and no formulas', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.read(Readable.from(await buildXlsxReport(report)));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Anomalies', 'Methodology']);
    const summaryValues = wb.getWorksheet('Summary')!.getColumn(2).values.filter(Boolean) as string[];
    expect(summaryValues).toContain(report.summary.headline);
    expect(summaryValues).toContain('\'=HYPERLINK("http://evil","click")');
    const anomalyRow = wb.getWorksheet('Anomalies')!.getRow(2).values as unknown[];
    expect(anomalyRow).toContain("'=1+1");
    // No cell anywhere was stored as a formula.
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => expect(cell.formula).toBeUndefined())));
  });

  it('writes a valid PDF with embedded Unicode fonts', async () => {
    const pdf = await buildPdfReport(report);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    expect(pdf.toString('latin1')).toMatch(/DejaVuSans/);
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});
