/**
 * The boardroom: running a meeting between hosted agents.
 *
 * Each participant speaks in his own voice, briefed from his own package, and — from round two —
 * having read what the others actually said. He may agree, and he may challenge, and a challenge
 * must name what would change his mind. Nothing here writes to a workspace: a meeting produces a
 * record, and the record is assembled from the contributions rather than summarised by a model.
 *
 * The failure modes this file is built to avoid:
 *
 *   - **A summary that eats the disagreement.** Minutes are assembled deterministically in
 *     domain/meetings.ts. No model is asked "what did the room conclude".
 *   - **One agent speaking for another.** Each turn is a separate completion with only that
 *     agent's identity in the system prompt.
 *   - **A meeting that quietly decides.** Contributions can only route a decision to the owner.
 *   - **Silence passed off as agreement.** An agent who cannot be reached is recorded as absent,
 *     and the meeting says so.
 */
import { randomUUID } from 'node:crypto';
import { Contribution, Meeting, assembleMinutes } from '../domain/meetings.js';
import { EventBus } from '../events/bus.js';
import { AgentProfile, describeColleagues } from '../identity/roster.js';
import { ModelProvider, ToolSpec } from '../providers/types.js';
import { Storage } from '../storage/types.js';
import { Logger } from '../util/log.js';
import { validate } from '../util/validate.js';

/**
 * The only tool a participant is given. A meeting is speech, not action: no file, shell, git or
 * network tool is offered, so a session cannot change anything even if a model tries.
 */
export const CONTRIBUTION_TOOL: ToolSpec = {
  name: 'contribute',
  description:
    'Record your contribution to this meeting. State your own position in your own discipline. '
    + 'Name where you agree with a colleague and where you challenge one. A challenge must say what '
    + 'evidence would change your mind. List what you do not know, and list anything only the owner '
    + 'can settle or authorise. You are not deciding; you are advising.',
  inputSchema: {
    type: 'object',
    properties: {
      position: { type: 'string', description: 'Your view on the agenda, in two to six sentences.' },
      agreements: {
        type: 'array',
        description: 'Where you agree. Name the colleague when you are agreeing with one.',
        items: {
          type: 'object',
          properties: {
            withAgent: { type: 'string', description: 'Agent id, or omit when agreeing with the agenda itself.' },
            point: { type: 'string' },
          },
          required: ['point'],
        },
      },
      challenges: {
        type: 'array',
        description: 'Where you disagree with a colleague. Never with yourself, never vague.',
        items: {
          type: 'object',
          properties: {
            toAgent: { type: 'string', description: 'The agent id you are challenging.' },
            point: { type: 'string' },
            wouldChangeMyMind: { type: 'string', description: 'The evidence that would settle it.' },
          },
          required: ['toAgent', 'point', 'wouldChangeMyMind'],
        },
      },
      evidenceGaps: { type: 'array', description: 'What you do not know.', items: { type: 'string' } },
      needsOwner: { type: 'array', description: 'What only Cristian can settle or authorise.', items: { type: 'string' } },
    },
    required: ['position'],
  },
};

interface ContributionShape {
  position: string;
  agreements?: Array<{ withAgent?: string; point: string }>;
  challenges?: Array<{ toAgent: string; point: string; wouldChangeMyMind: string }>;
  evidenceGaps?: string[];
  needsOwner?: string[];
}

export interface MeetingDeps {
  storage: Storage;
  bus: EventBus;
  provider: ModelProvider;
  logger: Logger;
  roster: AgentProfile[];
  /** How long one participant's turn may take before he is recorded as unreachable. */
  turnTimeoutMs: number;
}

/** Renders what has been said so far, so a participant answers colleagues rather than a vacuum. */
export function renderTranscript(contributions: Contribution[], roster: AgentProfile[]): string {
  if (!contributions.length) return '';
  const name = (id: string): string =>
    roster.find((p) => p.agentId === id)?.identity.displayName ?? id;
  const lines: string[] = [];
  let round = 0;
  for (const c of contributions) {
    if (c.round !== round) {
      round = c.round;
      lines.push('', `### Round ${round}`);
    }
    lines.push('', `**${name(c.agentId)} (${c.agentId})** — ${c.position}`);
    for (const a of c.agreements) {
      lines.push(`- agrees${a.withAgent ? ` with ${a.withAgent}` : ''}: ${a.point}`);
    }
    for (const ch of c.challenges) {
      lines.push(`- challenges ${ch.toAgent}: ${ch.point} (would change his mind: ${ch.wouldChangeMyMind})`);
    }
    for (const gap of c.evidenceGaps) lines.push(`- evidence gap: ${gap}`);
    for (const owner of c.needsOwner) lines.push(`- for the owner: ${owner}`);
  }
  return lines.join('\n');
}

export class MeetingService {
  constructor(private readonly deps: MeetingDeps) {}

  private profile(agentId: string): AgentProfile | undefined {
    return this.deps.roster.find((p) => p.agentId === agentId);
  }

  /**
   * The brief for one turn. His identity and cognitive model, who else is in the room, what has
   * been said, and the rule that he is advising rather than deciding.
   */
  private systemPrompt(profile: AgentProfile, meeting: Meeting, round: number): string {
    const identity = profile.identity;
    return [
      `You are ${identity.displayName} (${identity.agentId}), ${profile.charter.headline}`,
      `Roles: ${identity.roles.join(', ')}.`,
      identity.simulationNotice ? `\n## Identity boundary\n${identity.simulationNotice}` : '',
      '',
      '## Cognitive model',
      identity.cognitiveModel.trim(),
      '',
      identity.operatingRules.length
        ? `## Operating rules (from your package)\n${identity.operatingRules.map((r) => `- ${r}`).join('\n')}`
        : '',
      '',
      ...describeColleagues(profile, this.deps.roster.filter((p) => meeting.participants.includes(p.agentId))),
      '',
      '## This is a meeting, not a work session',
      `Convened by ${meeting.convenedBy}. Round ${round} of ${meeting.rounds}.`,
      'You have no file, shell, git or network tools here. You cannot change anything, and nothing',
      'you say takes effect. Speak, disagree, and route what needs the owner to the owner.',
      round === 1
        ? 'This is the opening round. State your own position before you have heard the others.'
        : 'You have now read the other positions. Say what you still hold, what changed, and what you challenge.',
      'Do not speak for a colleague or predict what he will say. Do not claim consensus.',
      '',
      '## How to answer',
      'Call the `contribute` tool exactly once. Do not answer in prose.',
    ].filter((line) => line !== '').join('\n');
  }

  /** One agent's turn. Returns null when he could not be reached — never a fabricated position. */
  private async turn(meeting: Meeting, profile: AgentProfile, round: number): Promise<Contribution | null> {
    const { storage, bus, provider, logger } = this.deps;
    const transcript = renderTranscript(storage.listContributions(meeting.id), this.deps.roster);
    const userText = [
      `# Meeting: ${meeting.topic}`,
      '',
      '## Agenda',
      meeting.agenda || '(none supplied beyond the topic)',
      transcript ? `\n## What has been said so far\n${transcript}` : '',
      '',
      round === 1 ? 'Give your opening position.' : 'Respond to the room.',
    ].filter(Boolean).join('\n');

    try {
      const response = await provider.complete({
        system: this.systemPrompt(profile, meeting, round),
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        tools: [CONTRIBUTION_TOOL],
        maxOutputTokens: 2000,
        timeoutMs: this.deps.turnTimeoutMs,
      });

      const use = response.toolUses.find((t) => t.name === CONTRIBUTION_TOOL.name);
      if (!use) {
        bus.emit('meeting.absent', `${profile.agentId} did not contribute in round ${round}`, {
          level: 'warn', data: { meetingId: meeting.id, agentId: profile.agentId, round },
        });
        return null;
      }

      const shape = validate<ContributionShape>(use.input, {
        position: { type: 'string', required: true, min: 1, max: 4000 },
        agreements: { type: 'array', of: 'object', max: 12 },
        challenges: { type: 'array', of: 'object', max: 12 },
        evidenceGaps: { type: 'array', of: 'string', max: 12 },
        needsOwner: { type: 'array', of: 'string', max: 12 },
      });
      if (!shape.ok || !shape.value) {
        bus.emit('meeting.absent', `${profile.agentId} produced an invalid contribution: ${shape.issues.join('; ')}`, {
          level: 'warn', data: { meetingId: meeting.id, agentId: profile.agentId, round },
        });
        return null;
      }

      const seated = new Set(meeting.participants);
      const contribution: Contribution = {
        id: `contrib_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
        meetingId: meeting.id,
        round,
        agentId: profile.agentId,
        role: profile.charter.role,
        position: shape.value.position,
        /* A challenge addressed to somebody who is not in the room, or to himself, is dropped: it
           cannot be answered, and leaving it in would make the minutes cite a phantom. */
        agreements: (shape.value.agreements ?? [])
          .filter((a) => a && typeof a.point === 'string' && a.point.trim() !== '')
          .map((a) => ({
            withAgent: a.withAgent && seated.has(a.withAgent) && a.withAgent !== profile.agentId ? a.withAgent : null,
            point: a.point,
          })),
        challenges: (shape.value.challenges ?? []).filter((c) =>
          c && seated.has(c.toAgent) && c.toAgent !== profile.agentId
          && typeof c.point === 'string' && c.point.trim() !== ''
          && typeof c.wouldChangeMyMind === 'string' && c.wouldChangeMyMind.trim() !== ''),
        evidenceGaps: (shape.value.evidenceGaps ?? []).filter((g) => typeof g === 'string' && g.trim() !== ''),
        needsOwner: (shape.value.needsOwner ?? []).filter((n) => typeof n === 'string' && n.trim() !== ''),
        createdAt: new Date().toISOString(),
      };

      storage.addContribution(contribution);
      bus.emit('meeting.contribution', `${profile.identity.displayName} spoke in round ${round}`, {
        data: {
          meetingId: meeting.id, agentId: profile.agentId, round,
          challenges: contribution.challenges.length, agreements: contribution.agreements.length,
        },
      });
      return contribution;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('meeting turn failed', { meetingId: meeting.id, agentId: profile.agentId, error: message });
      bus.emit('meeting.absent', `${profile.agentId} could not be reached: ${message}`, {
        level: 'error', data: { meetingId: meeting.id, agentId: profile.agentId, round },
      });
      return null;
    }
  }

  /**
   * Runs the session to its end and records the minutes.
   *
   * A meeting where nobody could speak is `blocked`, not `concluded` — an empty record must not be
   * mistaken for a room that met and had nothing to say.
   */
  async run(meetingId: string): Promise<Meeting> {
    const { storage, bus } = this.deps;
    const opened = storage.getMeeting(meetingId);
    if (!opened) throw new Error(`Meeting not found: ${meetingId}`);
    if (opened.status !== 'scheduled') return opened;

    let meeting = storage.updateMeeting(meetingId, {
      status: 'in_session', startedAt: new Date().toISOString(),
    });
    bus.emit('meeting.started', `${meeting.topic} — ${meeting.participants.join(', ')}`, {
      data: { meetingId, participants: meeting.participants, rounds: meeting.rounds },
    });

    let spoke = 0;
    for (let round = 1; round <= meeting.rounds; round++) {
      for (const agentId of meeting.participants) {
        const profile = this.profile(agentId);
        if (!profile) {
          bus.emit('meeting.absent', `${agentId} is not hosted by this runtime`, {
            level: 'warn', data: { meetingId, agentId, round },
          });
          continue;
        }
        const contribution = await this.turn(meeting, profile, round);
        if (contribution) spoke += 1;
      }
      meeting = storage.updateMeeting(meetingId, { roundsCompleted: round });
    }

    const contributions = storage.listContributions(meetingId);
    if (spoke === 0) {
      const blocked = storage.updateMeeting(meetingId, {
        status: 'blocked', endedAt: new Date().toISOString(),
        error: 'No participant could be reached, so there is no record of this meeting.',
      });
      bus.emit('meeting.blocked', blocked.error ?? 'no contributions', { level: 'error', data: { meetingId } });
      return blocked;
    }

    const minutes = assembleMinutes(meeting, contributions);
    const concluded = storage.updateMeeting(meetingId, {
      status: 'concluded', endedAt: new Date().toISOString(), minutes,
    });
    bus.emit('meeting.concluded',
      `${minutes.agreed.length} agreed · ${minutes.unresolved.length} unresolved · ${minutes.forOwner.length} for you`, {
        data: { meetingId, agreed: minutes.agreed.length, unresolved: minutes.unresolved.length },
      });
    return concluded;
  }
}
