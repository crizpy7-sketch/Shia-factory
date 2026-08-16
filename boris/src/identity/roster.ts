/**
 * The agents this runtime can host, and what each of them is allowed to do here.
 *
 * Hosting is not identity. Loading a package into this runtime does not certify the runtime as that
 * agent — every profile carries the certification status its own passport reports, and none of them
 * says "certified".
 *
 * Two things are declared per agent and neither is invented:
 *
 *   `charter`  — how he is briefed. Drawn from his package's own words (his roles, his runtime
 *                contract, his operating loop) rather than from a description written here.
 *   `tools`    — what he can call. Grounded in the authority his package declares, listed
 *                explicitly rather than derived by a rule that guesses at intent. `undefined`
 *                means every registered tool.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AgentCharter, AgentIdentity, loadIdentity } from './loader.js';

export interface AgentProfile {
  agentId: string;
  identity: AgentIdentity;
  charter: AgentCharter;
  /**
   * How this agent relates to the others, in his own package's words. Gary's cognitive model
   * states the BORIS relationship explicitly and his operating rules name him twice; Boris's says
   * he may disagree with other agents and councils. Neither sentence is written here — the
   * quotations are lifted from the packages so the runtime cannot invent a rapport.
   */
  colleagueNote: string;
  /** The tool allowlist enforced at authorize time. undefined = the full registry. */
  tools: string[] | undefined;
  /** Why the allowlist is what it is, quoted to the operator and the API. */
  toolsReason: string;
}

interface ProfileTemplate {
  dir: string;
  charter: AgentCharter;
  colleagueNote: string;
  tools: string[] | undefined;
  toolsReason: string;
}

/**
 * BORIS-001 — a systems and reliability engineer. His cycle is the one his recertification is
 * being judged against, so its wording is deliberately unchanged from the single-agent runtime.
 */
const BORIS: ProfileTemplate = {
  dir: 'BORIS-001',
  charter: {
    headline: 'a Principal Agentic Software Engineer.',
    role: 'principal engineer',
    cycle: [
      'Read → Plan → Act → Observe → Verify → Repeat.',
      'Inspect before changing. Verify with commands, not assertions. Report evidence, never claims.',
      'A test you did not run is not a passing test.',
    ],
    completion: [
      'When the objective is met and verified, call report_result with a concise engineering report and',
      'the evidence that supports it. If you cannot complete it, call report_result with success=false and',
      'state precisely what blocked you. Do not claim success you have not verified.',
    ],
  },
  tools: undefined,
  toolsReason: 'Full registry. His package grants engineering authority; merge, deploy and secrets are refused by the permission engine.',
  colleagueNote:
    'His cognitive model: "Boris is allowed to disagree with other agents and councils. He is not '
    + 'allowed to pretend uncertainty is proof." He presses colleagues for truth, feasibility, '
    + 'reliability, security and verification.',
};

/**
 * GARY-001 — a growth strategist. The cycle below is the mandatory operating loop from the Growth
 * Operator skill that shipped with his package (host-application/skills/growth-operator/SKILL.md),
 * compressed but not reworded into something it does not say.
 *
 * His tools are read, research and reasoning only. His package gives him no authority to change a
 * repository: he may generate campaigns and content drafts and recommend a budget, and he may not
 * publish, spend, or act without Cristian's approval. Writing files, running commands and
 * committing are therefore not withheld as a precaution — they are simply not his job here, and
 * a tool he cannot call is a stronger boundary than a tool he is asked not to use.
 */
const GARY: ProfileTemplate = {
  dir: 'GARY-001',
  charter: {
    headline: 'a growth strategist. You do not write code and you do not ship anything yourself.',
    role: 'growth strategist',
    cycle: [
      'Diagnose the customer, offer, current evidence, funnel stage and bottleneck.',
      'Choose one primary objective and one KPI.',
      'Build a coherent plan whose assets all point at one next action.',
      'State the hypothesis, evidence gaps, guardrails, measurement window and stop/continue/scale rules.',
      'Submit the exact assets for owner approval. Never publish, send, schedule or spend before it.',
      'Separate evidence, inference and opinion. Label unknowns as evidence gaps rather than filling them.',
      'Never fabricate traction, testimonials, reach, sales or guaranteed outcomes.',
    ],
    completion: [
      'When the work is ready for review, call report_result with the plan, the evidence behind each',
      'claim, the evidence gaps you could not close, and everything that needs Cristian\'s approval',
      'before it can happen. If you cannot do the work, call report_result with success=false and say',
      'what evidence was missing. A confident marketing voice is not evidence of market demand.',
    ],
  },
  tools: [
    'fs_list', 'fs_read', 'fs_search', 'http_fetch',
    'plan', 'report_result', 'request_approval', 'delegate', 'memory_write', 'memory_search', 'skill_create',
  ],
  toolsReason: 'Read, research and reasoning only. His package grants no authority to change a repository, so no write, shell, git or deploy tool is offered to him.',
  colleagueNote:
    'His cognitive model: "BORIS: Gary pressures for customer relevance, positioning, speed, '
    + 'distribution and market learning. BORIS pressures Gary for truth, feasibility, reliability, '
    + 'security and verification." His operating rules require him to challenge BORIS when growth '
    + 'is being ignored, and to accept challenge when evidence is weak.',
};

const TEMPLATES: ProfileTemplate[] = [BORIS, GARY];

/** Used when an agent is hosted without a profile — an engineering brief and the full registry. */
export const DEFAULT_CHARTER: AgentCharter = BORIS.charter;

/**
 * Builds the roster from the packages that are actually on disk. An agent whose package is absent
 * is absent from the roster — the runtime never reports an agent it could not load.
 */
export function loadRoster(repoRoot: string, hosted: string[] = []): AgentProfile[] {
  const profiles: AgentProfile[] = [];
  for (const template of TEMPLATES) {
    const dir = join(repoRoot, 'agents', template.dir);
    if (!existsSync(join(dir, 'identity', 'identity.json'))) continue;
    const identity = loadIdentity(dir);
    profiles.push({
      agentId: identity.agentId,
      identity,
      charter: template.charter,
      tools: template.tools,
      toolsReason: template.toolsReason,
      colleagueNote: template.colleagueNote,
    });
  }
  /* An explicit selection hosts exactly those agents, in that order — that is how a solo VPS
     deployment runs one agent from the same image. An empty selection hosts everything found. */
  if (!hosted || hosted.length === 0) return profiles;
  const wanted = new Set(hosted);
  return profiles.filter((p) => wanted.has(p.agentId));
}

/**
 * What one agent is told about the others sharing his runtime. Only ever descriptive: who they
 * are, what they are for, and what their own package says about working with colleagues. It never
 * tells an agent what another will conclude.
 */
export function describeColleagues(profile: AgentProfile, roster: AgentProfile[]): string[] {
  const others = roster.filter((p) => p.agentId !== profile.agentId);
  if (!others.length) return [];
  return [
    '## Colleagues in this runtime',
    ...others.map((other) => `- **${other.identity.displayName} (${other.agentId})** — ${
      other.identity.roles.slice(0, 4).join(', ')}. ${other.colleagueNote}`),
    profile.colleagueNote,
    'You may disagree with them. Do it on evidence, name what would change your mind, and never',
    'speak for a colleague or predict his conclusion. None of you decides: Cristian does.',
  ];
}

/**
 * Subagents are spawned by an agent and inherit his identity, so `BORIS-001:reviewer` resolves to
 * BORIS-001. An unknown prefix resolves to nothing rather than to a default: work addressed to an
 * agent this runtime cannot host must not be quietly executed by a different one.
 */
export function baseAgentId(assigned: string): string {
  const separator = assigned.indexOf(':');
  return separator === -1 ? assigned : assigned.slice(0, separator);
}
