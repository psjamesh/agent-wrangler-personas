import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, `${file} has frontmatter`);
  const fields = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    fields[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return { fields, body: text.slice(m[0].length) };
}

test('static wranglerExtension block matches the manifest', () => {
  const decl = pkg.wranglerExtension;
  assert.equal(decl.id, manifest.id);
  assert.equal(decl.label, manifest.label);
  assert.equal(decl.description, manifest.description);
  assert.equal(decl.author, manifest.author);
  assert.equal(decl.homepage, manifest.homepage);
  assert.deepEqual(decl.requires, manifest.requires);
  assert.match(manifest.id, /^[a-z][a-z0-9-]*$/);
  assert.deepEqual(manifest.requires, []);
});

test('package is dependency-free and the lockfile agrees', () => {
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies']) {
    assert.equal(pkg[key], undefined, key);
  }
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.deepEqual(Object.keys(lock.packages), ['']);
});

test('every declared skill exists, matches its directory, and nothing undeclared ships', () => {
  const dirs = fs.readdirSync(path.join(root, 'skills')).sort();
  assert.deepEqual(dirs, [...manifest.skills].sort());
  for (const name of manifest.skills) {
    const { fields, body } = frontmatter(path.join(root, 'skills', name, 'SKILL.md'));
    assert.equal(fields.name, name);
    assert.match(fields.description, /^Use only when the user explicitly /);
    assert.ok(body.length > 200);
  }
});

test('skills stay opt-in and dispatch activates the worker explicitly', () => {
  const boss = fs.readFileSync(path.join(root, 'skills/mob-boss/SKILL.md'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'skills/mob-worker/SKILL.md'), 'utf8');
  assert.match(boss, /Do not make this an always-on role\./);
  assert.match(worker, /Do not make this an always-on role\./);
  assert.ok(boss.includes('`Use the $mob-worker skill for this session.`'));
  assert.doesNotMatch(boss + worker, /\bmob lead\b|mob-lead|\bthe lead\b/i);
});

test('no sensitive or environment-specific content ships', () => {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      e.isDirectory() ? walk(p) : files.push(p);
    }
  })(root);
  for (const f of files) {
    if (f.endsWith('structure.test.js')) continue;
    const text = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\/Users\/|portswigger|atlassian\.net|\bPS-\d+/i, f);
  }
});
