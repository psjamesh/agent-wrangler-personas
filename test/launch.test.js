import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeArgs, codexArgs, parseCodex, parseClaude } from '../scripts/launch.mjs';

const FILE = '/ext/skills/mob-worker/SKILL.md';
const TAIL = 'Repeat this loop until the review is clean.';
const BODY = `---\nname: mob-worker\ndescription: x\n---\n# Mob worker\n${TAIL}`;
const cmd = (command, extra = {}) => JSON.stringify({
  type: 'item.completed',
  item: { type: 'command_execution', command, status: 'completed', exit_code: 0, aggregated_output: BODY, ...extra },
});
const parse = (...lines) => parseCodex(lines.join('\n'), { 'mob-worker': { file: FILE, tail: TAIL } }).skills;

test('claude launches carry only the Skill tool (or none) and no MCP servers', () => {
  const base = { prompt: 'p', model: 'm', bossDir: '/b', workerDir: '/w' };
  const discovery = claudeArgs(base);
  assert.ok(discovery.includes('--strict-mcp-config'));
  assert.equal(discovery[discovery.indexOf('--tools') + 1], 'Skill');
  assert.ok(discovery.includes('/b') && discovery.includes('/w'));
  assert.equal(discovery[discovery.indexOf('--setting-sources') + 1], 'project');
  const scenario = claudeArgs({ ...base, structured: { type: 'object' }, system: 's' });
  assert.ok(scenario.includes('--strict-mcp-config'));
  assert.equal(scenario[scenario.indexOf('--tools') + 1], '');
});

test('codex scenario launches have no shell; discovery keeps one under a read-only sandbox', () => {
  const base = { prompt: 'p', model: 'm', developerInstructions: 'd' };
  const scenario = codexArgs({ ...base, discovery: false, schemaFile: 's', lastFile: 'l' });
  assert.ok(scenario.includes('shell_tool') && scenario.includes('unified_exec'));
  const discovery = codexArgs({ ...base, discovery: true });
  assert.ok(!discovery.includes('shell_tool'));
  for (const a of [scenario, discovery]) {
    assert.equal(a[a.indexOf('-s') + 1], 'read-only');
    assert.ok(a.includes('--ignore-user-config'));
  }
});

test('codex activation needs a successful read of the exact shipped file', () => {
  assert.deepEqual(parse(cmd(`/bin/zsh -lc "sed -n '1,200p' ${FILE}"`)), ['mob-worker']);
  assert.deepEqual(parse(cmd(`cat ${FILE}`, { exit_code: 1, status: 'failed' })), []);
  assert.deepEqual(parse(cmd('cat /missing/skills/mob-worker/SKILL.md')), []);
  assert.deepEqual(parse(cmd(`echo ${FILE}`)), []);
  assert.deepEqual(parse(cmd('cat /home/u/.agents/skills/mob-worker/SKILL.md')), []);
  assert.deepEqual(parse(cmd(`cat ${FILE}`, { aggregated_output: 'unrelated' })), []);
  assert.deepEqual(parse(cmd(`head -n 3 ${FILE}`, { aggregated_output: '---\nname: mob-worker\ndescription: x' })), []);
  assert.deepEqual(parse('not json'), []);
});

test('claude activation reads Skill tool calls', () => {
  const ev = { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'mob-worker:mob-worker' } }] } };
  assert.deepEqual(parseClaude(JSON.stringify(ev)).skills, ['mob-worker:mob-worker']);
});
