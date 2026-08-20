/**
 * Meetings: the boardroom domain.
 *
 * A meeting is where more than one agent works the same question at the same time, sees what the
 * others said, and is allowed to disagree with them. Three rules shape every type in this file:
 *
 *   1. **A meeting produces a record, not a change.** No agent writes to a workspace during a
 *      session. The output is positions, disagreements, and the things that need Cristian.
 *   2. **Nobody in the room decides.** Agents are advisory by their own packages. A meeting can
 *      surface a decision and frame it; only the owner resolves it.
 *   3. **Disagreement is first-class.** A meeting that flattens two views into a summary has
 *      destroyed the reason for holding it, so challenges are stored as their own records rather
 *      than folded into prose.
 */

export const MEETING_STATUSES = [
  'scheduled', 'in_session', 'concluded', 'blocked', 'cancelled',
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface Meeting {
  id: string;
  topic: string;
  /** What the owner wants out of the room. Free text, supplied at convening time. */
  agenda: string;
  convenedBy: string;
  /** Agent ids seated, in speaking order. */
  participants: string[];
  status: MeetingStatus;
  /** How many rounds were requested. Round 1 is opening positions; later rounds are responses. */
  rounds: number;
  /** How many rounds actually completed. */
  roundsCompleted: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  /** Assembled from the contributions when the session concludes. Never a model's summary. */
  minutes: Minutes | null;
  error: string | null;
}

/**
 * One agent's turn. Structured rather than free prose so the record can be read, counted and
 * disagreed with — and so no contribution can quietly become a decision.
 */
export interface Contribution {
  id: string;
  meetingId: string;
  round: number;
  agentId: string;
  role: string;
  /** His own view, in his own discipline. */
  position: string;
  /** Where he agrees with a colleague, named. */
  agreements: Agreement[];
  /** Where he disagrees, named, with what would change his mind. */
  challenges: Challenge[];
  /** What he does not know and would need before being sure. */
  evidenceGaps: string[];
  /** Things only Cristian can settle or authorise. */
  needsOwner: string[];
  createdAt: string;
}

export interface Agreement {
  /** The colleague being agreed with, or null when agreeing with the agenda itself. */
  withAgent: string | null;
  point: string;
}

export interface Challenge {
  /** The colleague being challenged. Never null: a challenge is addressed to someone. */
  toAgent: string;
  point: string;
  /** What evidence would settle it. A challenge without this is an opinion, not a challenge. */
  wouldChangeMyMind: string;
}

/**
 * The record the room produces. Assembled deterministically from contributions — no model is asked
 * to summarise the meeting, because a summary is where disagreement quietly disappears.
 */
export interface Minutes {
  topic: string;
  participants: string[];
  rounds: number;
  /**
   * Agreements as stated, attributed to whoever stated them. `reciprocated` marks the ones the
   * other party also recorded, which is the only thing in a meeting that resembles convergence —
   * and even then it is two agents agreeing, never "the room decided".
   */
  agreed: Array<{ from: string; withAgent: string | null; point: string; reciprocated: boolean }>;
  /** Live disagreements at the end of the session, with what would settle each. */
  unresolved: Array<{ from: string; to: string; point: string; wouldChangeMyMind: string }>;
  /** Everything the room says only Cristian can settle. */
  forOwner: string[];
  /** What nobody in the room could establish. */
  evidenceGaps: string[];
  /** Final position per agent, so the record shows who thought what. */
  positions: Array<{ agentId: string; position: string }>;
  assembledAt: string;
}

export function emptyMinutes(topic: string, participants: string[]): Minutes {
  return {
    topic, participants, rounds: 0,
    agreed: [], unresolved: [], forOwner: [], evidenceGaps: [], positions: [],
    assembledAt: new Date().toISOString(),
  };
}

/**
 * Builds the minutes from what was actually said.
 *
 * Everything is attributed. Nothing is merged into an unowned "the room concluded", because that
 * sentence is where one agent's opinion turns into consensus. Only the final round counts for
 * agreements and challenges: an agent withdraws a point by not repeating it.
 */
export function assembleMinutes(meeting: Meeting, contributions: Contribution[]): Minutes {
  const minutes = emptyMinutes(meeting.topic, meeting.participants);
  minutes.rounds = contributions.reduce((max, c) => Math.max(max, c.round), 0);

  const lastRound = minutes.rounds;
  const finals = new Map<string, Contribution>();
  for (const c of contributions) {
    const held = finals.get(c.agentId);
    if (!held || c.round > held.round) finals.set(c.agentId, c);
  }
  minutes.positions = meeting.participants
    .filter((id) => finals.has(id))
    .map((id) => ({ agentId: id, position: finals.get(id)?.position ?? '' }));

  /* Unresolved: challenges raised in the final round and never withdrawn. An agent withdraws by
     not repeating it, which is why only the last round counts. */
  for (const c of contributions.filter((x) => x.round === lastRound)) {
    for (const challenge of c.challenges) {
      minutes.unresolved.push({
        from: c.agentId, to: challenge.toAgent,
        point: challenge.point, wouldChangeMyMind: challenge.wouldChangeMyMind,
      });
    }
  }

  /* Agreements are recorded as stated, not filtered by whether the colleague is challenged
     elsewhere: two agents can converge on one point while still disagreeing about another, and
     dropping the convergence would lose the most useful thing the room produced.
     `reciprocated` is the honest strengthener — B also recorded agreeing with A. */
  const finalRound = contributions.filter((x) => x.round === lastRound);
  const agreedWith = new Map<string, Set<string>>();
  for (const c of finalRound) {
    const targets = new Set(c.agreements.map((a) => a.withAgent).filter((x): x is string => Boolean(x)));
    agreedWith.set(c.agentId, targets);
  }
  const seen = new Set<string>();
  for (const c of finalRound) {
    for (const agreement of c.agreements) {
      const key = `${c.agentId}|${agreement.point.trim().toLowerCase()}`;
      if (!agreement.point.trim() || seen.has(key)) continue;
      seen.add(key);
      minutes.agreed.push({
        from: c.agentId,
        withAgent: agreement.withAgent,
        point: agreement.point,
        reciprocated: Boolean(agreement.withAgent
          && agreedWith.get(agreement.withAgent)?.has(c.agentId)),
      });
    }
  }

  const collect = (pick: (c: Contribution) => string[]): string[] => {
    const out: string[] = [];
    const dedupe = new Set<string>();
    for (const c of contributions) {
      for (const item of pick(c)) {
        const key = item.trim().toLowerCase();
        if (!key || dedupe.has(key)) continue;
        dedupe.add(key);
        out.push(`${c.agentId}: ${item}`);
      }
    }
    return out;
  };
  minutes.forOwner = collect((c) => c.needsOwner);
  minutes.evidenceGaps = collect((c) => c.evidenceGaps);
  return minutes;
}
