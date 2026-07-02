import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { verifyAccessToken, type Role } from './services/auth';
import { logger } from './logger';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const badRequest = (m: string) => new HttpError(400, m, 'bad_request');
export const unauthorized = (m = 'Not authenticated') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'Forbidden') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const tooMany = (m = 'Rate limit exceeded') => new HttpError(429, m, 'rate_limited');

export interface AuthedUser {
  id: string;
  role: Role;
}

/** Extract & verify the bearer access token. Throws 401 if absent/invalid. */
export function requireUser(req: NextRequest): AuthedUser {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  try {
    const claims = verifyAccessToken(header.slice(7));
    return { id: claims.sub, role: claims.role };
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Parse + validate a JSON body with a Zod schema. */
export async function readBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest('Invalid JSON body');
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw result.error;
  return result.data;
}

/** Wrap a route handler with uniform error handling. */
export function route<T extends unknown[]>(fn: (req: NextRequest, ...rest: T) => Promise<NextResponse>) {
  return async (req: NextRequest, ...rest: T): Promise<NextResponse> => {
    try {
      return await fn(req, ...rest);
    } catch (err) {
      if (err instanceof ZodError) {
        return json(
          { error: 'validation_error', message: 'Invalid request', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
          400,
        );
      }
      if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
      logger.error({ err: String(err) }, 'Unhandled route error');
      return json({ error: 'internal_error', message: 'Something went wrong' }, 500);
    }
  };
}

/** Best-effort client IP for rate limiting. */
export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
