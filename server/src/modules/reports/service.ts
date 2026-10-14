import type { Summary } from '../../domain/agent/schemas.js';
import { ConflictError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { recordAudit, type AuditContext } from '../audit/service.js';
import { getAnalysis } from '../analyses/service.js';
import { buildPdfReport } from './pdf.js';
import type { ReportData } from './types.js';
import { buildXlsxReport } from './xlsx.js';

type Actor = { id: string; role: 'ANALYST' | 'MANAGER' | 'ADMIN' };

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const;

/** Builds the report on demand from the stored result; nothing is cached on disk. */
export async function exportReport(
  user: Actor,
  analysisId: string,
  format: 'xlsx' | 'pdf',
  ctx: AuditContext,
) {
  const analysis = await getAnalysis(user, analysisId);
  if (analysis.status !== 'COMPLETED' || !analysis.result) {
    throw new ConflictError(`Analysis is not completed (status ${analysis.status})`);
  }
  const file = await prisma.file.findUniqueOrThrow({
    where: { id: analysis.fileId },
    select: { originalName: true },
  });
  const result = analysis.result as unknown as Omit<
    ReportData,
    'title' | 'fileName' | 'generatedAt' | 'language' | 'model' | 'verification'
  > & {
    summary: Summary;
  };
  const report: ReportData = {
    ...result,
    title: 'FinAgent analysis report',
    fileName: file.originalName,
    generatedAt: new Date(),
    language: analysis.language as 'az' | 'en',
    model: analysis.model,
    verification: analysis.verification as ReportData['verification'],
  };

  const body = format === 'xlsx' ? await buildXlsxReport(report) : await buildPdfReport(report);
  await recordAudit(ctx, {
    action: 'report.export',
    resourceType: 'analysis',
    resourceId: analysisId,
    metadata: { format },
  });
  return { body, contentType: CONTENT_TYPES[format], filename: `finagent-report-${analysisId}.${format}` };
}
