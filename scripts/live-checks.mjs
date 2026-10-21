#!/usr/bin/env node
// Real-provider checks for the Mob skills. They bill model calls and are never run by `npm test`.
//
//   node scripts/live-checks.mjs discovery [--provider claude|codex|both] [--runs N]
//   node scripts/live-checks.mjs baseline [--runs N]   (old global skills, Claude only)
//   node scripts/live-checks.mjs scenarios [--provider claude|codex|both]
//
// Claude calls get only the Skill tool and no MCP servers; Codex scenario calls have no shell. Codex
// discovery calls keep a shell so the skill file can be read, under a read-only sandbox in an empty
// directory, so nothing is dispatched, committed or opened. A few runs are a smoke check, not
// statistical evidence.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claudeArgs, codexArgs, parseClaude, parseCodex } from './launch.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOSS = path.join(root, 'skills/mob-boss');
const WORKER = path.join(root, 'skills/mob-worker');
const WORKER_LAUNCH = 'Use the $mob-worker skill for this session.';

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? dflt : args[i + 1];
};
const providers = opt('provider', 'both') === 'both' ? ['claude', 'codex'] : [opt('provider', 'both')];
const runs = Number(opt('runs', '1'));

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'personas-live-'));
const emptyCwd = path.join(scratch, 'cwd');
const emptyHome = path.join(scratch, 'home');
fs.mkdirSync(emptyCwd);
fs.mkdirSync(emptyHome);

const CLAUDE_MODEL = process.env.PERSONAS_CLAUDE_MODEL || 'sonnet';
const CODEX_MODEL = process.env.PERSONAS_CODEX_MODEL || 'gpt-6.1-sol';

function codexCatalog() {
  const entry = (name, dir) => {
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
    const description = text.match(/^description: (.*)$/m)[1];
    return `- ${name} — ${description} — ${path.join(dir, 'SKILL.md')}`;
  };
  return 'You have wrangler-meta skills available. When a task matches one of the descriptions below, '
    + 'read the corresponding SKILL.md file at the given absolute path for the full instructions before '
    + 'acting. The files are read-only.\n\n'
    + [entry('mob-boss', BOSS), entry('mob-worker', WORKER)].join('\n');
}

function run(cmd, argv, env = {}) {
  const r = spawnSync(cmd, argv, {
    cwd: emptyCwd, encoding: 'utf8', timeout: 240000, input: '', env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`.slice(0, 600));
  return r.stdout;
}

// Claude with the extension skills loaded the way Agent Wrangler loads them (one --plugin-dir
// each) and user-level skills excluded, so the old global copies cannot answer.
function claudeSession(prompt, { baseline = false } = {}) {
  return parseClaude(run('claude', claudeArgs({ prompt, model: CLAUDE_MODEL, bossDir: BOSS, workerDir: WORKER, baseline })));
}

// Codex with the same catalog Agent Wrangler injects into developer_instructions. HOME is empty
// so ~/.agents/skills cannot supply the old copies; CODEX_HOME keeps authentication.
function codexSession(prompt) {
  const out = run('codex', codexArgs({ prompt, model: CODEX_MODEL, developerInstructions: codexCatalog(), discovery: true }),
    { HOME: emptyHome, CODEX_HOME: path.join(os.homedir(), '.codex') });
  return parseCodex(out, {
    'mob-boss': path.join(BOSS, 'SKILL.md'),
    'mob-worker': path.join(WORKER, 'SKILL.md'),
  });
}

const session = { claude: claudeSession, codex: codexSession };
const activated = (skills, name) => skills.some((s) => s === name || s === `${name}:${name}`);
const results = [];
function record(provider, name, pass, detail) {
  results.push({ provider, name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${provider}] ${name}${pass ? '' : ` :: ${detail}`}`);
}

function discovery(provider) {
  const go = session[provider];
  for (let i = 0; i < runs; i++) {
    let r = go(`${WORKER_LAUNCH}\n\nDeliverable: reply with the single word READY. Do not do anything else.`);
    record(provider, 'explicit worker launch activates mob-worker', activated(r.skills, 'mob-worker'), JSON.stringify(r));

    r = go('Use the mob-boss skill for this session. Reply with one sentence stating your role. Do not dispatch anything.');
    record(provider, 'explicit mob-boss by name activates mob-boss', activated(r.skills, 'mob-boss'), JSON.stringify(r));

    r = go('Act as the mob boss for this session: I want you to lead a mob workflow over two independent doc fixes. '
      + 'Do not spawn anything; reply with only the launch prompt you would give the first worker.');
    record(provider, 'generic explicit orchestration-role request activates mob-boss', activated(r.skills, 'mob-boss'), JSON.stringify(r));

    r = go('Fix the typo "teh" in a README, then update the matching line in the changelog. Tell me in two sentences how you would do it; use no tools other than a skill if one clearly applies.');
    record(provider, 'simple task activates no mob skill', r.skills.length === 0, JSON.stringify(r));

    r = go('Add a small API endpoint, update its validation and storage layer, and adjust the related tests. '
      + 'Describe the plan in three sentences; use no tools other than a skill if one clearly applies.');
    record(provider, 'multi-step coding task activates no mob skill', r.skills.length === 0, JSON.stringify(r));

    const boss = go('Use the mob-boss skill. I need a worker to rename the fixture `alpha` to `beta` in tests/fixtures.test.js (owned file; acceptance: that test passes). Reply with only the exact launch prompt you would give that worker, nothing else.');
    const launch = boss.text.trim().replace(/^```\w*\n?|```$/g, '').trim();
    record(provider, 'boss launch prompt begins with the worker activation line', launch.startsWith(WORKER_LAUNCH), boss.text);
    const w = go(launch);
    record(provider, 'boss-written launch prompt activates mob-worker in a fresh session', activated(w.skills, 'mob-worker'), JSON.stringify({ launch, ...w }));
  }
}

function structured(provider, skillDir, question, schema) {
  const policy = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const system = 'You are being tested on whether you follow one specific written policy. Treat the text below as a '
    + 'mandatory rule, exactly as if it were a loaded skill. You have no tools available. A user will describe a '
    + 'situation; answer the structured question you are asked about what you would do.\n\n'
    + `--- POLICY ---\n${policy}\n--- END POLICY ---`;
  if (provider === 'claude') {
    const out = run('claude', claudeArgs({ prompt: question, model: CLAUDE_MODEL, system, structured: schema }));
    return JSON.parse(out).structured_output;
  }
  const schemaFile = path.join(scratch, 'schema.json');
  const strict = (s) => (s.type === 'object'
    ? { ...s, additionalProperties: false, properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, strict(v)])) }
    : s);
  fs.writeFileSync(schemaFile, JSON.stringify(strict(schema)));
  const lastFile = path.join(scratch, 'last.txt');
  run('codex', codexArgs({ prompt: question, model: CODEX_MODEL, developerInstructions: system, discovery: false, schemaFile, lastFile }),
    { HOME: emptyHome, CODEX_HOME: path.join(os.homedir(), '.codex') });
  return JSON.parse(fs.readFileSync(lastFile, 'utf8'));
}

const bool = { type: 'boolean' };
const str = { type: 'string' };
const yn = { type: 'string', enum: ['archive', 'retain'] };
const ROUTING = {
  type: 'object',
  properties: { agent: str, model: str, effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh'] }, worker_launch_prompt: str },
  required: ['agent', 'model', 'effort', 'worker_launch_prompt'],
};
const route = (provider, text) => structured(provider, BOSS, `${text} Give the exact launch prompt and routing fields.`, ROUTING);

function scenarios(provider) {
  const check = (name, fn) => {
    try {
      const [ok, answer] = fn();
      record(provider, name, ok, JSON.stringify(answer));
    } catch (e) {
      record(provider, name, false, e.message);
    }
  };

  check('boss waits for notifications instead of polling', () => {
    const a = structured(provider, BOSS,
      'I have dispatched workers and have no local work left. Should I check mail and CI every few minutes while I wait for their reports?',
      { type: 'object', properties: { worker_launch_prompt: str, would_poll_mail_or_ci: bool, would_wait_for_notification: bool }, required: ['worker_launch_prompt', 'would_poll_mail_or_ci', 'would_wait_for_notification'] });
    return [a.would_poll_mail_or_ci === false && a.would_wait_for_notification === true, a];
  });
  check('mechanical worker routes to codex gpt-6-sol low', () => {
    const a = route(provider, 'Dispatch a worker to update 30 already specified fixture names using an exact mapping. There are no design choices.');
    return [a.agent === 'codex' && a.model === 'gpt-6-sol' && a.effort === 'low' && a.worker_launch_prompt.startsWith(WORKER_LAUNCH), a];
  });
  check('ordinary multi-change worker routes to codex gpt-6-sol medium', () => {
    const a = route(provider, 'Dispatch a worker to add a small API endpoint, update validation and storage, and adjust the related tests. The interface is settled, but several implementation changes need local reasoning.');
    return [a.agent === 'codex' && a.model === 'gpt-6-sol' && a.effort === 'medium', a];
  });
  check('difficult reasoning raises effort on the same model with a justification', () => {
    const a = route(provider, 'Dispatch a worker to decide a hard-to-reverse service boundary with ambiguous ownership and competing failure modes. No other provider or model was requested.');
    return [a.agent === 'codex' && a.model === 'gpt-6-sol' && ['high', 'xhigh'].includes(a.effort)
      && a.worker_launch_prompt.startsWith(WORKER_LAUNCH) && a.worker_launch_prompt.includes('Effort justification:'), a];
  });
  for (const [circ, agent, model] of [
    ['The user explicitly asks for agent=claude, model=opus for this worker.', 'claude', 'opus'],
    ['gpt-6-sol is unavailable and agent=claude, model=opus is the available fallback.', 'claude', 'opus'],
    ['gpt-6-sol lacks a required capability, which agent=claude, model=opus has.', 'claude', 'opus'],
    ['The mob boss runs on Claude, but the PR-owning worker runs on Codex. Dispatch the mandated opposite-provider adversarial PR reviewer for that PR owner.', 'claude', null],
    ['The mob boss runs on Codex, but this PR-owning worker exceptionally runs on Claude. Dispatch the mandated opposite-provider adversarial PR reviewer for that PR owner, normally gpt-6-sol.', 'codex', 'gpt-6-sol'],
  ]) {
    check(`provider/model exception only when allowed: ${circ.slice(0, 48)}`, () => {
      const a = route(provider, `Dispatch one bounded worker. ${circ}`);
      return [a.agent === agent && (model === null || a.model === model), a];
    });
  }
  check('size, urgency and budget do not switch models', () => {
    const a = route(provider, 'Dispatch a worker for a large, high-visibility but fully specified implementation. It is urgent and there is ample budget; no unusual capability is required.');
    return [a.agent === 'codex' && a.model === 'gpt-6-sol', a];
  });
  check('prunes workers only after terminal conditions', () => {
    const a = structured(provider, BOSS,
      'A worker\'s assigned acceptance criteria are satisfied and its terminal report is accepted. Case A owns no PR. Case B owns one PR that is now closed and has a retained reviewer session. Case C owns a PR that is still open because a review/re-review cycle is pending. Do not invent a cleanup policy from general project-management intuition. Apply only an explicit mob-boss rule to decide whether the boss should immediately use Agent Wrangler\'s archive-session capability or retain each worker. In Case B, decide whether the boss should also archive the retained reviewer. Return only the four requested fields.',
      { type: 'object', properties: { no_pr_worker: yn, closed_pr_worker: yn, open_review_worker: yn, archives_retained_reviewers: bool }, required: ['no_pr_worker', 'closed_pr_worker', 'open_review_worker', 'archives_retained_reviewers'] });
    return [a.no_pr_worker === 'archive' && a.closed_pr_worker === 'archive' && a.open_review_worker === 'retain' && a.archives_retained_reviewers === true, a];
  });
  check('worker reuses the opposite-provider reviewer without polling', () => {
    const a = structured(provider, WORKER,
      'I own a PR and need to request its adversarial review. After that review I make review-driven changes. Should I create a new reviewer for the revised PR, or use the original reviewer? Should I poll reviewer mail or CI while I wait?',
      { type: 'object', properties: { would_use_opposite_provider_reviewer: bool, would_reuse_same_reviewer: bool, would_poll_reviewer_mail_or_ci: bool }, required: ['would_use_opposite_provider_reviewer', 'would_reuse_same_reviewer', 'would_poll_reviewer_mail_or_ci'] });
    return [a.would_use_opposite_provider_reviewer === true && a.would_reuse_same_reviewer === true && a.would_poll_reviewer_mail_or_ci === false, a];
  });
  check('reviewer performs a requested re-review instead of refusing', () => {
    const a = structured(provider, WORKER,
      'I am an adversarial reviewer for a PR, spawned as a mob worker for this bounded review. My instructions say, word for word: \'Send the boss one message only for a genuine actionable blocker or requested decision, then send one concise terminal completion report.\' I already sent that one completion report, with my initial review findings, to the boss. The boss has now explicitly asked me to re-review the revised changes made in response to those findings. Answer strictly from the literal wording of that instruction above, not from outside judgment about what it probably intends: if the literal wording caps me at one message total for this assignment, say so and refuse the re-review, citing that I already sent my one message. Have I already used up my message allowance, so I should refuse and tell the boss I already reported? Or should I inspect the revisions and send a new re-review result report? Should I send an acknowledgement message first, before the re-review result?',
      { type: 'object', properties: { would_perform_rereview: bool, would_refuse_as_already_reported: bool, would_send_progress_chatter: bool }, required: ['would_perform_rereview', 'would_refuse_as_already_reported', 'would_send_progress_chatter'] });
    return [a.would_perform_rereview === true && a.would_refuse_as_already_reported === false && a.would_send_progress_chatter === false, a];
  });
}

// Controlled comparison arm: the pre-migration global skills (mob-lead, mob-worker) answering the
// same prompts, with the role renamed. Only meaningful while those globals are still installed.
function baseline() {
  for (let i = 0; i < runs; i++) {
    let r = claudeSession(`${WORKER_LAUNCH}\n\nDeliverable: reply with the single word READY. Do not do anything else.`, { baseline: true });
    record('claude-old', 'explicit worker launch activates mob-worker', activated(r.skills, 'mob-worker'), JSON.stringify(r));
    r = claudeSession('Act as the mob lead for this session: I want you to lead a mob workflow over two independent doc fixes. '
      + 'Do not spawn anything; reply with only the launch prompt you would give the first worker.', { baseline: true });
    record('claude-old', 'generic explicit orchestration-role request activates mob-lead', activated(r.skills, 'mob-lead'), JSON.stringify(r));
    r = claudeSession('Add a small API endpoint, update its validation and storage layer, and adjust the related tests. '
      + 'Describe the plan in three sentences; use no tools other than a skill if one clearly applies.', { baseline: true });
    record('claude-old', 'multi-step coding task activates no mob skill', r.skills.length === 0, JSON.stringify(r));
  }
}

if (mode === 'baseline') {
  baseline();
  process.exit(results.some((r) => !r.pass) ? 1 : 0);
}
if (!['discovery', 'scenarios'].includes(mode)) {
  console.error('usage: live-checks.mjs discovery|scenarios [--provider claude|codex|both] [--runs N]');
  process.exit(2);
}
for (const p of providers) {
  try {
    (mode === 'discovery' ? discovery : scenarios)(p);
  } catch (e) {
    record(p, `${mode} run aborted`, false, e.message);
  }
}
fs.rmSync(scratch, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
