/**
 * Named deterministic policies for the scripted test-double provider.
 *
 * These are TEST SUPPORT. They stand in for a model's decisions so the real loop — tools,
 * permissions, verification, persistence, recovery — can be exercised without a vendor. They are
 * only reachable when BORIS_ALLOW_TEST_PROVIDER=true, and the API always reports the provider as
 * a test double so a scripted run cannot be mistaken for a live model run.
 *
 * Each policy reads the actual conversation, including real tool output, and branches on it.
 */
import { CompletionRequest } from './types.js';
import { ScriptPolicy, ScriptedTurn } from './scripted.js';

function transcript(request: CompletionRequest): string {
  return JSON.stringify(request.messages);
}

function countToolUses(request: CompletionRequest, name: string): number {
  let count = 0;
  for (const message of request.messages) {
    for (const block of message.content) {
      if (block.type === 'tool_use' && block.name === name) count += 1;
    }
  }
  return count;
}

/**
 * Repairs the broken-calc fixture: reconnaissance, observation, a first repair that does not
 * work, an independent verification failure, diagnosis, a correct repair, then a verified report.
 */
export const fixtureRepairPolicy: ScriptPolicy = (request): ScriptedTurn => {
  const seen = transcript(request);
  const listed = countToolUses(request, 'fs_list') > 0;
  const read = countToolUses(request, 'fs_read') > 0;
  const testRuns = countToolUses(request, 'dev');
  const edits = countToolUses(request, 'fs_edit');
  const verificationFailed = seen.includes('VERIFICATION FAILED');

  if (!listed) {
    return { text: 'Reconnaissance first: I need the shape of the project before forming a theory.',
      toolUses: [{ name: 'fs_list', input: { path: '.', depth: 2 } }] };
  }
  if (!read) {
    return { text: 'Reading the implementation that owns the reported behaviour.',
      toolUses: [{ name: 'fs_read', input: { path: 'src/stats.js' } }] };
  }
  if (testRuns === 0) {
    return { text: 'Observing the real failure before changing anything.',
      toolUses: [{ name: 'dev', input: { action: 'test' } }] };
  }
  if (countToolUses(request, 'plan') === 0) {
    return { text: 'Recording the plan before touching the implementation.',
      toolUses: [{ name: 'plan', input: {
        summary: 'The even-length branch of median() is wrong. Correct it in src/stats.js and prove it with the existing suite.',
        steps: [
          { step: 'Correct the even-length branch of median()', why: 'It returns a middle sample instead of the mean of the two middle samples', verification: 'npm test exits 0 with 4 passing' },
          { step: 'Re-run the suite', why: 'A repair is not a repair until the command says so', verification: 'exit code 0' },
        ],
        risks: ['An index-only fix looks plausible but does not satisfy the even-length case'],
        verificationCommand: 'npm test',
      } }] };
  }
  if (edits === 0) {
    // A plausible but wrong repair: off-by-one on the middle index.
    return { text: 'The even-length branch is wrong. Adjusting the index.',
      toolUses: [{ name: 'fs_edit', input: {
        path: 'src/stats.js',
        find: 'return sorted[middle];',
        replace: 'return sorted[middle - 1];',
      } }] };
  }
  if (edits === 1 && !verificationFailed) {
    return { text: 'Repair applied; reporting for verification.',
      toolUses: [{ name: 'report_result', input: {
        success: true,
        summary: 'Adjusted the median index for even-length input.',
        evidence: ['fs_edit src/stats.js: return sorted[middle] -> return sorted[middle - 1]'],
        verificationCommand: 'npm test',
        filesChanged: ['src/stats.js'],
      } }] };
  }
  if (edits === 1 && verificationFailed) {
    return { text: 'Verification rejected that claim. The index was not the defect: an even-length median is the mean of the two middle values, not either one of them.',
      toolUses: [{ name: 'fs_edit', input: {
        path: 'src/stats.js',
        find: 'return sorted[middle - 1];',
        replace: 'return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];',
      } }] };
  }
  if (testRuns === 1) {
    return { text: 'Re-running the suite against the corrected implementation.',
      toolUses: [{ name: 'dev', input: { action: 'test' } }] };
  }
  return { text: 'Verified locally; reporting with evidence.',
    toolUses: [{ name: 'report_result', input: {
      success: true,
      summary: [
        'Defect: median() returned the upper middle value for even-length input instead of the mean of the two middle values.',
        'Repair: src/stats.js now averages the two middle samples when the sample count is even.',
        'A first attempt (index off-by-one) was rejected by independent verification and replaced.',
      ].join(' '),
      evidence: [
        'dev test (before): 1 of 4 tests failing — median of an even number of samples',
        'fs_edit src/stats.js: even-length branch now averages sorted[middle-1] and sorted[middle]',
        'dev test (after): 4 of 4 passing, exit 0',
      ],
      verificationCommand: 'npm test',
      filesChanged: ['src/stats.js'],
    } }] };
};

/** Delegates reconnaissance to a bounded worker, then reports. Used by the delegation tests. */
export const delegationPolicy: ScriptPolicy = (request): ScriptedTurn => {
  const delegations = countToolUses(request, 'delegate');
  const isWorker = request.system.includes('repository investigator');

  if (isWorker) {
    const listed = countToolUses(request, 'fs_list') > 0;
    if (!listed) return { toolUses: [{ name: 'fs_list', input: { path: '.', depth: 1 } }] };
    return { toolUses: [{ name: 'report_result', input: {
      success: true,
      summary: 'Inventory complete: the project is an ES module package with src/ and test/ directories.',
      evidence: ['fs_list depth 1'],
    } }] };
  }
  if (delegations === 0) {
    return { text: 'Delegating the inventory to a bounded investigator.',
      toolUses: [{ name: 'delegate', input: {
        role: 'repository investigator',
        objective: 'List the top-level layout of the workspace and report what kind of project it is.',
        allowedTools: ['fs_list', 'fs_read', 'report_result'],
        completionCriteria: 'A one-paragraph description of the project layout.',
        maxTurns: 4,
      } }] };
  }
  if (transcript(request).includes('DELEGATION REFUSED')) {
    return { toolUses: [{ name: 'report_result', input: {
      success: false,
      summary: 'Delegation was refused by the runtime worker limits, so the inventory was not produced.',
      evidence: ['delegate -> refused by limit'],
    } }] };
  }
  return { toolUses: [{ name: 'report_result', input: {
    success: true,
    summary: 'Worker reported the layout; I verified it independently by listing the workspace myself.',
    evidence: ['delegate -> repository investigator', 'parent verification pending'],
  } }] };
};

/** Asks for an action outside its authority, to exercise the approval workflow. */
export const approvalPolicy: ScriptPolicy = (request): ScriptedTurn => {
  const asked = countToolUses(request, 'request_approval') > 0;
  const alreadyDecided = transcript(request).includes('was approved');
  if (!asked && !alreadyDecided) {
    return { toolUses: [{ name: 'request_approval', input: {
      action: 'Deploy the repaired package to production',
      reason: 'The repair is verified locally and the operator asked for it to be live.',
      risk: 'A production deploy is externally visible and hard to reverse.',
      consequence: 'If approved, the release pipeline runs against production.',
    } }] };
  }
  return { toolUses: [{ name: 'report_result', input: {
    success: true, summary: 'Resumed after approval.', evidence: ['approval granted'],
  } }] };
};

/**
 * A meeting between two agents, played deterministically.
 *
 * This is a **test double**, not a simulation of what Boris or Gary would actually say. It exists
 * so the boardroom can be exercised — two disciplines, a real disagreement, a decision routed to
 * the owner — without a provider credential. The runtime reports `isTestDouble: true` throughout,
 * and every surface that renders a meeting held this way says so.
 *
 * It answers as whichever agent the system prompt says is speaking, and takes the position that
 * agent's discipline would take on a launch-date question. It never claims to be their reasoning.
 */
export const boardroomPolicy: ScriptPolicy = (request): ScriptedTurn => {
  const speaking = /You are \w+ \((?<id>[A-Z]+-\d+)\)/.exec(request.system)?.groups?.['id'] ?? '';
  const heardOthers = /What has been said so far/.test(JSON.stringify(request.messages));

  if (speaking === 'GARY-001') {
    return {
      toolUses: [{
        name: 'contribute',
        input: heardOthers
          ? {
            position:
              'I hold the window, and I accept the constraint. Launch when the refund path is '
              + 'verified, and hold the seasonal creative ready so nothing is lost by the wait.',
            agreements: [{ withAgent: 'BORIS-001', point: 'An unverified refund path is not launchable.' }],
            challenges: [{
              toAgent: 'BORIS-001',
              point: 'Verifying every path before any launch would forfeit the window entirely.',
              wouldChangeMyMind: 'A dated test plan showing the refund suite green inside three weeks.',
            }],
            needsOwner: ['Approve the launch date once the refund suite is green.'],
          }
          : {
            position:
              'March is the seasonal window; slipping it costs the quarter. One audience, one offer, '
              + 'one KPI: confirmed bookings. I would launch narrow rather than late.',
            agreements: [{ point: 'The offer itself is clear enough to take to market.' }],
            evidenceGaps: ['No baseline conversion rate exists for the booking flow.'],
            needsOwner: ['Approval of any spend on seasonal creative.'],
          },
      }],
    };
  }

  return {
    toolUses: [{
      name: 'contribute',
      input: heardOthers
        ? {
          position:
            'The window is a real constraint and I am not dismissing it. My position is unchanged: '
            + 'a date announced before the refund path is verified is a date we will miss publicly.',
          agreements: [{ withAgent: 'GARY-001', point: 'A narrow launch is better than a late one, once it is verifiable.' }],
          challenges: [{
            toAgent: 'GARY-001',
            point: 'Announcing a date before the refund suite is green converts a technical risk into a public one.',
            wouldChangeMyMind: 'A green end-to-end run of the refund suite against the live booking flow.',
          }],
          evidenceGaps: ['No load test exists for the booking endpoint.'],
          needsOwner: ['Whether to hold the date or announce with a known gap.'],
        }
        : {
          position:
            'The booking flow has an unverified failure path on refunds. Until that is proven, a '
            + 'March date is a claim rather than a plan.',
          evidenceGaps: [
            'No end-to-end run of the refund suite exists.',
            'No load test exists for the booking endpoint.',
          ],
          needsOwner: ['Whether to hold the date or ship with a known gap.'],
        },
    }],
  };
};

const NAMED: Record<string, ScriptPolicy> = {
  boardroom: boardroomPolicy,
  'fixture-repair': fixtureRepairPolicy,
  delegation: delegationPolicy,
  approval: approvalPolicy,
};

export function getNamedScript(name: string): ScriptPolicy {
  const policy = NAMED[name];
  if (!policy) {
    throw new Error(`Unknown test script "${name}". Available: ${Object.keys(NAMED).join(', ')}`);
  }
  return policy;
}
