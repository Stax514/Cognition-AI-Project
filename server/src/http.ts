import { isIP } from 'node:net';
import type { Request } from 'express';

/**
 * Normalises the client address for the `inet` audit column, dropping the
 * IPv4-mapped IPv6 prefix Node reports for local IPv4 connections. Anything
 * that is not a valid address is recorded as NULL rather than failing the
 * insert; `trust proxy` is off unless TRUST_PROXY is set, so a client cannot
 * dictate this value by sending an X-Forwarded-For header.
 */
export function clientIp(req: Request): string | null {
  const ip = req.ip;
  if (!ip) return null;
  const normalised = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
  return isIP(normalised) === 0 ? null : normalised;
}
