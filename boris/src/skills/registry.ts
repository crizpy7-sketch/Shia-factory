/**
 * Skills: versioned, retrievable engineering procedures.
 *
 * Skills are selected by trigger match against the objective — the whole library is never injected.
 */
import { Skill } from '../domain/types.js';
import { Storage } from '../storage/types.js';
import { tokenize } from '../memory/store.js';
import { id, now } from '../util/ids.js';

export const SEED_SKILLS: Array<Omit<Skill, 'id' | 'createdAt'>> = [
  {
    name: 'repository-reconnaissance',
    purpose: 'Build an accurate picture of an unfamiliar repository before changing anything.',
    version: '1.0.0',
    triggers: ['inspect', 'reconnaissance', 'architecture', 'unfamiliar', 'codebase', 'repository', 'understand'],
    requiredTools: ['fs_list', 'fs_read', 'fs_search'],
    instructions: [
      '1. fs_list at depth 2 to see the shape of the project.',
      '2. Read the manifest (package.json or equivalent) to learn the real build, test and lint commands.',
      '3. Read entry points and the module that owns the behaviour in question before forming a theory.',
      '4. fs_search for the symbols named in the objective rather than guessing file names.',
      '5. State what you verified and what remains an assumption.',
    ].join('\n'),
    verification: 'You can name the build/test commands and the files that own the behaviour, each from a file you actually read.',
    source: 'seed',
  },
  {
    name: 'failing-test-repair',
    purpose: 'Diagnose and repair a failing test suite without breaking passing behaviour.',
    version: '1.0.0',
    triggers: ['test', 'failing', 'bug', 'repair', 'fix', 'defect', 'red', 'regression'],
    requiredTools: ['dev', 'shell_run', 'fs_read', 'fs_edit'],
    instructions: [
      '1. Run the suite first and read the actual failure output. Do not theorise before observing.',
      '2. Locate the assertion that failed and the implementation it exercises.',
      '3. Form one hypothesis about the root cause and state it.',
      '4. Change the implementation, not the test, unless the test encodes the wrong requirement.',
      '5. Re-run the suite. A repair is not complete until the command exits zero.',
      '6. Re-run the whole suite, not only the failing case, to catch regressions.',
    ].join('\n'),
    verification: 'The test command exits 0 and its output is included as evidence.',
    source: 'seed',
  },
  {
    name: 'typescript-strictness-repair',
    purpose: 'Resolve TypeScript errors without weakening the type system.',
    version: '1.0.0',
    triggers: ['typescript', 'typecheck', 'tsc', 'types', 'strict', 'compile'],
    requiredTools: ['dev', 'fs_read', 'fs_edit'],
    instructions: [
      '1. Run typecheck and read every error, not just the first.',
      '2. Group errors by root cause; one bad type often produces many messages.',
      '3. Fix the type, not the call site. `any` and `@ts-ignore` are last resorts and must be justified.',
      '4. Re-run typecheck to zero errors before claiming completion.',
    ].join('\n'),
    verification: 'typecheck exits 0 with no suppressions added.',
    source: 'seed',
  },
  {
    name: 'evidence-reporting',
    purpose: 'Report engineering results in a form that can be checked.',
    version: '1.0.0',
    triggers: ['report', 'evidence', 'summary', 'result', 'complete'],
    requiredTools: ['report_result'],
    instructions: [
      '1. Separate what you verified from what you assumed.',
      '2. Quote the command and its exit status for every claim of success.',
      '3. Name the files you changed and what changed in them.',
      '4. State remaining risk honestly. An unverified claim is a defect in the report.',
    ].join('\n'),
    verification: 'Every success claim in the report is traceable to a command or file change recorded in this run.',
    source: 'seed',
  },
  {
    name: 'adversarial-self-review',
    purpose: 'Attack your own change before declaring it done.',
    version: '1.0.0',
    triggers: ['review', 'verify', 'security', 'adversarial', 'reliability', 'audit'],
    requiredTools: ['fs_read', 'shell_run', 'dev'],
    instructions: [
      '1. Ask what input would break the change you just made.',
      '2. Check the error path, not only the happy path.',
      '3. Look for the same defect elsewhere in the codebase.',
      '4. Decide whether a test, a constraint or a permission rule would prevent recurrence.',
    ].join('\n'),
    verification: 'You have named at least one concrete failure mode and either handled it or recorded it.',
    source: 'seed',
  },
];

export class SkillRegistry {
  constructor(private readonly storage: Storage) {}

  seed(): number {
    let count = 0;
    for (const skill of SEED_SKILLS) {
      if (this.storage.getSkill(skill.name)) continue;
      this.storage.putSkill({ ...skill, id: id('skill'), createdAt: now() });
      count += 1;
    }
    return count;
  }

  create(skill: Omit<Skill, 'id' | 'createdAt'>): Skill {
    return this.storage.putSkill({ ...skill, id: id('skill'), createdAt: now() });
  }

  list(): Skill[] {
    return this.storage.listSkills();
  }

  /** Selects skills whose triggers overlap the objective. Ties break towards fewer, better matches. */
  select(objective: string, limit = 3): Skill[] {
    const terms = new Set(tokenize(objective));
    const scored = this.storage.listSkills().map((skill) => {
      let score = 0;
      for (const trigger of skill.triggers) {
        if (terms.has(trigger.toLowerCase())) score += 2;
        else if (objective.toLowerCase().includes(trigger.toLowerCase())) score += 1;
      }
      return { skill, score };
    }).filter((entry) => entry.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((entry) => entry.skill);
  }

  format(skills: Skill[]): string {
    return skills
      .map((skill) => `### ${skill.name} v${skill.version}\n${skill.purpose}\n${skill.instructions}\nVerification: ${skill.verification}`)
      .join('\n\n');
  }
}
