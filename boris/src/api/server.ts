/**
 * HTTP API + dashboard host.
 *
 * Authentication is bearer-token; every mutating route requires it when a token is configured.
 * Request bodies are size-limited and schema-validated. No configuration or secret is ever
 * returned to a client.
 */
import { IncomingMessage, ServerResponse, createServer, Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import {
  Runtime, agentStatus, cancelTask, createSchedule, decideApproval, submitObjective,
} from '../runtime.js';
import { TaskStatus, TASK_STATUSES } from '../domain/types.js';
import { validate } from '../util/validate.js';

const MAX_BODY_BYTES = 64 * 1024;
const AVATARS: Record<string, string> = {
  square: 'avatar-square.png',
  circle: 'avatar-circle.png',
  icon: 'avatar-app-icon.png',
  sheet: 'avatar-brand-sheet.png',
};

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  runtime: Runtime;
  authenticated: boolean;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return new Promise((resolvePromise) => {
    let size = 0;
    let oversized = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        oversized = true;
        resolvePromise({ ok: false, error: 'request body too large' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) return;
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolvePromise({ ok: true, value: {} });
      try {
        resolvePromise({ ok: true, value: JSON.parse(raw) });
      } catch {
        resolvePromise({ ok: false, error: 'body is not valid JSON' });
      }
    });
    req.on('error', () => resolvePromise({ ok: false, error: 'request stream error' }));
  });
}

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Locates the dashboard whether the server runs from src/ or from dist/. */
function findPublicDir(repoRoot: string): string {
  const candidates = [
    resolve(import.meta.dirname, '..', '..', 'public'),
    resolve(import.meta.dirname, '..', '..', '..', 'public'),
    resolve(repoRoot, 'boris', 'public'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? (candidates[0] as string);
}

export function createApiServer(runtime: Runtime): Server {
  const publicDir = findPublicDir(runtime.config.repoRoot);
  const avatarDir = resolve(runtime.config.repoRoot, 'assets', 'agents', 'boris-001');

  const requireAuth = (ctx: Ctx): boolean => {
    if (!runtime.config.requireAuth) return true;
    if (ctx.authenticated) return true;
    send(ctx.res, 401, { error: 'authentication required' });
    return false;
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const header = req.headers.authorization ?? '';
      const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
      const authenticated = runtime.config.apiToken !== null && bearer !== ''
        && tokenMatches(bearer, runtime.config.apiToken);
      const ctx: Ctx = { req, res, url, runtime, authenticated };

      try {
        await route(ctx, { publicDir, avatarDir, requireAuth });
      } catch (error) {
        runtime.logger.error('request failed', { path: url.pathname, error: (error as Error).message });
        if (!res.headersSent) send(res, 500, { error: 'internal error' });
      }
    })();
  });
  return server;
}

async function route(
  ctx: Ctx,
  deps: { publicDir: string; avatarDir: string; requireAuth: (ctx: Ctx) => boolean },
): Promise<void> {
  const { req, res, url, runtime } = ctx;
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // ---------------------------------------------------------------- static
  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    const file = join(deps.publicDir, 'index.html');
    if (!existsSync(file)) return send(res, 404, { error: 'dashboard not built' });
    const html = readFileSync(file);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': html.length });
    return void res.end(html);
  }
  if (method === 'GET' && path.startsWith('/avatar/')) {
    const key = path.slice('/avatar/'.length);
    const name = AVATARS[key];
    if (!name) return send(res, 404, { error: 'unknown avatar' });
    const file = join(deps.avatarDir, name);
    if (!existsSync(file)) return send(res, 404, { error: 'avatar asset not found' });
    const png = readFileSync(file);
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=3600' });
    return void res.end(png);
  }

  // ---------------------------------------------------------------- public
  if (method === 'GET' && path === '/api/health') {
    const queue = runtime.storage.countTasks('queued');
    return send(res, 200, {
      ok: true,
      agent: runtime.identity.agentId,
      uptimeSeconds: Math.round((Date.now() - runtime.startedAt) / 1000),
      bootId: runtime.config.bootId,
      provider: runtime.provider.name,
      providerAvailable: runtime.provider.available().ok,
      queueDepth: queue,
      storage: 'ok',
    });
  }

  // ------------------------------------------------------------- protected
  if (path.startsWith('/api/')) {
    if (!deps.requireAuth(ctx)) return;
  } else {
    return send(res, 404, { error: 'not found' });
  }

  if (method === 'GET' && path === '/api/status') {
    const status = agentStatus(runtime);
    return send(res, 200, {
      ...status,
      providerNote: runtime.provider.available().reason,
      isTestDouble: runtime.provider.isTestDouble,
      limits: runtime.config.limits,
    });
  }

  if (method === 'GET' && path === '/api/tasks') {
    const statusParam = url.searchParams.get('status');
    const status = statusParam && (TASK_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as TaskStatus) : undefined;
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200);
    return send(res, 200, {
      tasks: runtime.storage.listTasks({ ...(status ? { status } : {}), limit }),
    });
  }

  if (method === 'POST' && path === '/api/tasks') {
    const body = await readBody(req);
    if (!body.ok) return send(res, 400, { error: body.error });
    const parsed = validate<{ objective: string; title?: string; workspace?: string; priority?: string; description?: string }>(
      body.value,
      {
        objective: { type: 'string', required: true, min: 10, max: 8000 },
        title: { type: 'string', max: 120 },
        description: { type: 'string', max: 4000 },
        workspace: { type: 'string', max: 500 },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
      },
    );
    if (!parsed.ok || !parsed.value) return send(res, 400, { error: parsed.issues.join('; ') });
    try {
      const task = submitObjective(runtime, parsed.value.objective, {
        ...(parsed.value.title ? { title: parsed.value.title } : {}),
        ...(parsed.value.description ? { description: parsed.value.description } : {}),
        ...(parsed.value.workspace ? { workspace: parsed.value.workspace } : {}),
        ...(parsed.value.priority ? { priority: parsed.value.priority as 'low' | 'normal' | 'high' | 'critical' } : {}),
      });
      return send(res, 201, { task });
    } catch (error) {
      return send(res, 400, { error: (error as Error).message });
    }
  }

  const taskMatch = /^\/api\/tasks\/([A-Za-z0-9_]+)$/.exec(path);
  if (method === 'GET' && taskMatch) {
    const taskId = taskMatch[1] as string;
    const task = runtime.storage.getTask(taskId);
    if (!task) return send(res, 404, { error: 'task not found' });
    return send(res, 200, {
      task,
      runs: runtime.storage.listRuns(task.id),
      toolCalls: runtime.storage.listToolCalls(task.id).slice(-100),
      usage: runtime.storage.usageForTask(task.id),
      events: runtime.storage.listEvents({ taskId: task.id, limit: 200 }),
    });
  }

  const cancelMatch = /^\/api\/tasks\/([A-Za-z0-9_]+)\/cancel$/.exec(path);
  if (method === 'POST' && cancelMatch) {
    try {
      return send(res, 200, { task: cancelTask(runtime, cancelMatch[1] as string) });
    } catch (error) {
      return send(res, 400, { error: (error as Error).message });
    }
  }

  if (method === 'GET' && path === '/api/events') {
    const since = url.searchParams.get('since');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, 500);
    return send(res, 200, {
      events: runtime.storage.listEvents({ ...(since ? { sinceId: since } : {}), limit }),
    });
  }

  if (method === 'GET' && path === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    const unsubscribe = runtime.bus.subscribe((event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(keepAlive); unsubscribe(); });
    return;
  }

  if (method === 'GET' && path === '/api/approvals') {
    const state = url.searchParams.get('state');
    return send(res, 200, {
      approvals: runtime.storage.listApprovals(
        state === 'requested' || state === 'approved' || state === 'rejected' ? state : undefined,
      ),
    });
  }

  const approvalMatch = /^\/api\/approvals\/([A-Za-z0-9_]+)\/(approve|reject)$/.exec(path);
  if (method === 'POST' && approvalMatch) {
    const body = await readBody(req);
    if (!body.ok) return send(res, 400, { error: body.error });
    const parsed = validate<{ by?: string; note?: string }>(body.value, {
      by: { type: 'string', max: 120 },
      note: { type: 'string', max: 1000 },
    });
    if (!parsed.ok || !parsed.value) return send(res, 400, { error: parsed.issues.join('; ') });
    try {
      const result = decideApproval(
        runtime,
        approvalMatch[1] as string,
        approvalMatch[2] === 'approve' ? 'approved' : 'rejected',
        parsed.value.by ?? 'operator',
        parsed.value.note ?? null,
      );
      return send(res, 200, result);
    } catch (error) {
      return send(res, 400, { error: (error as Error).message });
    }
  }

  if (method === 'GET' && path === '/api/memory') {
    const category = url.searchParams.get('category');
    const text = url.searchParams.get('q');
    const records = runtime.storage.queryMemory({
      ...(category ? { category: category as never } : {}),
      ...(text ? { text } : {}),
      limit: Math.min(Number(url.searchParams.get('limit') ?? 30) || 30, 100),
    });
    // Content is truncated in the list view; provenance and confidence always travel with it.
    return send(res, 200, {
      memory: records.map((r) => ({
        id: r.id, category: r.category, title: r.title, tags: r.tags, source: r.source,
        provenance: r.provenance, confidence: r.confidence, verified: r.verified,
        updatedAt: r.updatedAt, useCount: r.useCount,
        preview: r.content.replace(/\s+/g, ' ').slice(0, 300),
      })),
    });
  }

  if (method === 'GET' && path === '/api/skills') {
    return send(res, 200, { skills: runtime.storage.listSkills() });
  }

  if (method === 'GET' && path === '/api/schedules') {
    return send(res, 200, { schedules: runtime.storage.listSchedules() });
  }

  if (method === 'POST' && path === '/api/schedules') {
    const body = await readBody(req);
    if (!body.ok) return send(res, 400, { error: body.error });
    const parsed = validate<{ name: string; objective: string; kind: string; intervalMs?: number; runAt?: string }>(
      body.value,
      {
        name: { type: 'string', required: true, min: 3, max: 120 },
        objective: { type: 'string', required: true, min: 10, max: 8000 },
        kind: { type: 'string', required: true, enum: ['once', 'recurring'] },
        intervalMs: { type: 'number', min: 1000 },
        runAt: { type: 'string', max: 40 },
      },
    );
    if (!parsed.ok || !parsed.value) return send(res, 400, { error: parsed.issues.join('; ') });
    try {
      return send(res, 201, {
        schedule: createSchedule(runtime, {
          name: parsed.value.name,
          objective: parsed.value.objective,
          kind: parsed.value.kind as 'once' | 'recurring',
          ...(parsed.value.intervalMs ? { intervalMs: parsed.value.intervalMs } : {}),
          ...(parsed.value.runAt ? { runAt: parsed.value.runAt } : {}),
        }),
      });
    } catch (error) {
      return send(res, 400, { error: (error as Error).message });
    }
  }

  if (method === 'GET' && path === '/api/identity') {
    const identity = runtime.identity;
    return send(res, 200, {
      agentId: identity.agentId,
      displayName: identity.displayName,
      version: identity.version,
      roles: identity.roles,
      authority: identity.authority,
      invocationAliases: identity.invocationAliases,
      certificationStatus: identity.certificationStatus,
      migrationStatus: identity.migrationStatus,
      requiredRecognitionTests: identity.requiredRecognitionTests,
    });
  }

  return send(res, 404, { error: `no route for ${method} ${path}` });
}

export function startApiServer(runtime: Runtime): Promise<Server> {
  const server = createApiServer(runtime);
  return new Promise((resolvePromise) => {
    server.listen(runtime.config.apiPort, runtime.config.apiHost, () => {
      runtime.logger.info('api listening', {
        host: runtime.config.apiHost,
        port: runtime.config.apiPort,
        authRequired: runtime.config.requireAuth,
      });
      resolvePromise(server);
    });
  });
}
