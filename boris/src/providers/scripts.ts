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

const NAMED: Record<string, ScriptPolicy> = {
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
