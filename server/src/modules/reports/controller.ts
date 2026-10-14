import type { Request, Response } from 'express';
import { currentUser } from '../../middleware/rbac.js';
import { auditContext } from '../audit/service.js';
import type { ExportQuery } from './schemas.js';
import { exportReport } from './service.js';

export async function exportAnalysis(req: Request, res: Response) {
  const { format } = req.query as unknown as ExportQuery;
  const file = await exportReport(currentUser(req), String(req.params.id), format, auditContext(req));
  // The filename is server-generated (uuid), so it is safe in the header without escaping.
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.type(file.contentType).send(file.body);
}
