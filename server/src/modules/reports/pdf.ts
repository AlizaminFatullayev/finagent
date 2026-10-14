import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { METHODOLOGY_NOTE, type ReportData } from './types.js';

// PDF standard fonts lack Azerbaijani letters (ə, ğ, ş, ı); DejaVu covers them.
const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const SEVERITY_COLOR: Record<string, string> = { HIGH: '#b42318', MEDIUM: '#b54708', LOW: '#475467' };

export function buildPdfReport(report: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: report.title, Creator: 'FinAgent' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.registerFont('body', FONT).registerFont('bold', FONT_BOLD);
  const heading = (text: string) =>
    doc.moveDown(0.8).font('bold').fontSize(13).fillColor('#101828').text(text).moveDown(0.3);
  const bullets = (items: string[]) =>
    items.forEach((i) => doc.font('body').fontSize(10).fillColor('#344054').text(`• ${i}`));

  doc.font('bold').fontSize(18).text(report.title);
  doc
    .font('body')
    .fontSize(9)
    .fillColor('#667085')
    .text(`${report.fileName} · ${report.generatedAt.toISOString()}`);
  doc.moveDown().font('bold').fontSize(12).fillColor('#101828').text(report.summary.headline);

  if (report.summary.keyMetrics.length) {
    heading('Key metrics');
    bullets(report.summary.keyMetrics.map((m) => `${m.label}: ${m.value}`));
  }
  for (const [title, items] of [
    ['Trends', report.summary.trends],
    ['Risks', report.summary.risks],
    ['Recommendations', report.summary.recommendations],
  ] as const) {
    if (items.length) {
      heading(title);
      bullets(items);
    }
  }

  heading(
    `Anomalies (HIGH ${report.severityCounts.HIGH ?? 0} · MEDIUM ${report.severityCounts.MEDIUM ?? 0} · LOW ${report.severityCounts.LOW ?? 0})`,
  );
  for (const a of report.anomalies) {
    doc
      .font('bold')
      .fontSize(10)
      .fillColor(SEVERITY_COLOR[a.severity] ?? '#101828');
    doc.text(`${a.id} · ${a.severity} · ${a.type}${a.column ? ` · ${a.column}` : ''} (${a.sheet})`);
    doc.font('body').fontSize(9).fillColor('#344054').text(a.description).moveDown(0.3);
  }
  if (report.anomalies.length === 0) bullets(['No anomalies were detected.']);

  if (report.summary.caveats.length) {
    heading('Caveats');
    bullets(report.summary.caveats);
  }

  heading('Methodology');
  doc.font('body').fontSize(9).fillColor('#344054').text(METHODOLOGY_NOTE).moveDown(0.3);
  for (const r of report.methodology) doc.text(`${r.ruleId}: ${r.description}`);
  doc
    .moveDown(0.3)
    .text(`Algorithm version ${report.algorithmVersion}; language model ${report.model ?? 'n/a'}.`);
  if (report.verification) {
    doc.text(
      `Number check: ${report.verification.verified} of ${report.verification.checked} cited figures matched computed values.`,
    );
  }

  doc.end();
  return done;
}
