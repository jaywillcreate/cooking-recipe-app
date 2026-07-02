import 'server-only';

/** Minimal structured logger (Vercel captures stdout/stderr as logs). */
type Fields = Record<string, unknown>;
function emit(level: string, msg: string, fields?: Fields) {
  const line = { level, msg, ...fields, t: new Date().toISOString() };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}
export const logger = {
  info: (a: Fields | string, b?: string) => (typeof a === 'string' ? emit('info', a) : emit('info', b ?? '', a)),
  warn: (a: Fields | string, b?: string) => (typeof a === 'string' ? emit('warn', a) : emit('warn', b ?? '', a)),
  error: (a: Fields | string, b?: string) => (typeof a === 'string' ? emit('error', a) : emit('error', b ?? '', a)),
};
