export const ROLES = ['viewer', 'agent', 'approver'] as const;
export type Role = (typeof ROLES)[number];

export const REFUND_REASONS = [
  'duplicate',
  'fraud',
  'customer_request',
  'processing_error',
  'subscription_cancellation',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionUser;
    csrfToken?: string;
  }
}
