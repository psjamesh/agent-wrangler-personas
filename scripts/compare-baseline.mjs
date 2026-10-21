#!/usr/bin/env node
// Usage: node scripts/compare-baseline.mjs <old-mob-lead/SKILL.md> <old-mob-worker/SKILL.md>
// Applies only the approved rename rules to the baseline text and fails on any other difference.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const RULES = {
  boss: [
    [/^name: mob-lead$/m, 'name: mob-boss'],
    [/mob lead/g, 'mob boss'],
    [/^# Mob lead$/m, '# Mob boss'],
  ],
  worker: [
    [/lead-requested/g, 'boss-requested'],
    [/decision for the lead/g, 'decision for the boss'],
    [/disagreement to the lead/g, 'disagreement to the boss'],
  ],
};

const [bossBase, workerBase] = process.argv.slice(2);
if (!bossBase || !workerBase) {
  console.error('usage: compare-baseline.mjs <mob-lead SKILL.md> <mob-worker SKILL.md>');
  process.exit(2);
}

let failed = false;
for (const [kind, base, shipped] of [
  ['boss', bossBase, path.join(root, 'skills/mob-boss/SKILL.md')],
  ['worker', workerBase, path.join(root, 'skills/mob-worker/SKILL.md')],
]) {
  let expected = fs.readFileSync(base, 'utf8');
  for (const [from, to] of RULES[kind]) expected = expected.replace(from, to);
  const actual = fs.readFileSync(shipped, 'utf8');
  if (expected === actual) {
    console.log(`${kind}: identical to baseline after approved renames`);
  } else {
    failed = true;
    console.error(`${kind}: differs from baseline beyond approved renames`);
  }
}
process.exit(failed ? 1 : 0);
