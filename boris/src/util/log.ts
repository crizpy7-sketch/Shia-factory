/**
 * Structured logging. Every line is JSON with correlation ids and never contains secrets.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

/** Keys whose values are never printed, regardless of where they appear. */
const SECRET_KEYS = /^(.*(api[_-]?key|token|secret|password|authorization|credential|cookie).*)$/i;
const SECRET_VALUE = /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limited]';
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[redacted]');
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LogContext {
  taskId?: string | null;
  runId?: string | null;
  workerId?: string | null;
  toolCallId?: string | null;
  [key: string]: unknown;
}

export class Logger {
  constructor(
    private readonly level: LogLevel = 'info',
    private readonly base: LogContext = {},
    private readonly sink: (line: string) => void = (line) => process.stdout.write(line + '\n'),
  ) {}

  child(ctx: LogContext): Logger {
    return new Logger(this.level, { ...this.base, ...ctx }, this.sink);
  }

  private emit(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (LEVELS[level] < LEVELS[this.level]) return;
    const line = {
      at: new Date().toISOString(),
      level,
      msg,
      ...(redact({ ...this.base, ...ctx }) as Record<string, unknown>),
    };
    this.sink(JSON.stringify(line));
  }

  debug(msg: string, ctx?: LogContext): void { this.emit('debug', msg, ctx); }
  info(msg: string, ctx?: LogContext): void { this.emit('info', msg, ctx); }
  warn(msg: string, ctx?: LogContext): void { this.emit('warn', msg, ctx); }
  error(msg: string, ctx?: LogContext): void { this.emit('error', msg, ctx); }
}

export const nullLogger = new Logger('error', {}, () => {});
