import type { Request } from 'express';

/**
 * Normalises the client address for the `inet` audit column, dropping the
 * IPv4-mapped IPv6 prefix Node reports for local IPv4 connections.
 */
export function clientIp(req: Request): string | null {
  const ip = req.ip;
  if (!ip) return null;
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
