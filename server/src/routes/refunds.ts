import { Router } from 'express';
import { clientIp } from '../http.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { parsed, validate } from '../middleware/validate.js';
import {
  createRefund,
  decideRefund,
  getCustomerTransactions,
  getRefund,
  getRefundAuditTrail,
  listRefunds,
} from '../services/refunds.js';
import {
  createRefundSchema,
  decisionSchema,
  idParamSchema,
  listRefundsQuerySchema,
  paginationQuerySchema,
} from '../validators.js';

export const refundsRouter = Router();

// Reading refunds is available to every authenticated role.
refundsRouter.get(
  '/',
  requireRole('viewer'),
  validate('query', listRefundsQuerySchema),
  async (req, res, next) => {
    try {
      res.json(await listRefunds(parsed(req, 'query', listRefundsQuerySchema)));
    } catch (error) {
      next(error);
    }
  },
);

refundsRouter.get(
  '/:id',
  requireRole('viewer'),
  validate('params', idParamSchema),
  async (req, res, next) => {
    try {
      const { id } = parsed(req, 'params', idParamSchema);
      const refund = await getRefund(id);
      res.json({ refund, auditTrail: await getRefundAuditTrail(id) });
    } catch (error) {
      next(error);
    }
  },
);

refundsRouter.get(
  '/:id/transactions',
  requireRole('viewer'),
  validate('params', idParamSchema),
  validate('query', paginationQuerySchema),
  async (req, res, next) => {
    try {
      const { id } = parsed(req, 'params', idParamSchema);
      const { page, pageSize } = parsed(req, 'query', paginationQuerySchema);
      const refund = await getRefund(id);
      res.json(await getCustomerTransactions(refund.customer.id, page, pageSize));
    } catch (error) {
      next(error);
    }
  },
);

// Agents and approvers can both raise refunds. Maker-checker is what keeps the
// two sides apart: whoever creates a refund cannot be the one who decides it.
refundsRouter.post(
  '/',
  requireRole('agent'),
  validate('body', createRefundSchema),
  async (req, res, next) => {
    try {
      const body = parsed(req, 'body', createRefundSchema);
      const refund = await createRefund(body, currentUser(req), clientIp(req));
      res.status(201).json({ refund });
    } catch (error) {
      next(error);
    }
  },
);

for (const [path, decision] of [
  ['approve', 'approved'],
  ['reject', 'rejected'],
] as const) {
  refundsRouter.post(
    `/:id/${path}`,
    requireRole('approver'),
    validate('params', idParamSchema),
    validate('body', decisionSchema),
    async (req, res, next) => {
      try {
        const { id } = parsed(req, 'params', idParamSchema);
        const { comment } = parsed(req, 'body', decisionSchema);
        const refund = await decideRefund(id, decision, comment, currentUser(req), clientIp(req));
        res.json({ refund, auditTrail: await getRefundAuditTrail(id) });
      } catch (error) {
        next(error);
      }
    },
  );
}
