# agent-wrangler-personas

An [Agent Wrangler](https://github.com/PortSwigger/agent-wrangler) extension that ships opt-in operational personas for sessions that collaborate. A persona packages a role and how it works with others: what it owns, how it reports, how it waits. It is not a personality preset.

Personas are grouped. The first group is **Mob**.

## Mob

| Skill | Role |
| --- | --- |
| `mob-boss` | Owns the user dialogue, decomposition, dispatch and final synthesis. Launches each worker with a self-contained brief, picks its model and effort, waits for completion mail instead of polling, and archives a worker once its acceptance criteria are met and every PR it owned is closed. |
| `mob-worker` | Owns one bounded deliverable. Reports once per completed work or review cycle, never delegates the work further, and for a PR it owns keeps one opposite-provider reviewer for review, changes and re-review until clean. |

Both skills are opt-in. Their descriptions only match an explicit request to start a session in the role, so an ordinary session, including a multi-step coding task, stays ordinary. Neither is an always-on instruction.

The boss starts every worker with `Use the $mob-worker skill for this session.` and then the brief.

### Invoking them

| Provider | Boss | Worker |
| --- | --- | --- |
| Claude Code | `/mob-boss:mob-boss` | `/mob-worker:mob-worker` |
| Codex | ask for the `mob-boss` skill | ask for the `mob-worker` skill |

In Claude Code an extension-shipped skill loads as a one-skill plugin named after its directory, so the namespace repeats the skill name; there is no `/personas:mob-boss`. Codex reads the skill from the catalog Agent Wrangler adds to its instructions, by name. Both providers also activate a skill from a plain-language request such as "use the mob-boss skill", or the worker launch line above.

Sessions launched after the extension is installed pick the skills up; a running session keeps the instructions it already loaded.

## Install

In Agent Wrangler's settings, go to the Extensions tab. Paste this URL into **Install an extension**, choose **Install…**, and approve the consent dialog. The dialog shows no capabilities and no dependencies.

```
https://github.com/psjamesh/agent-wrangler-personas
```

The extension is enabled by default.

## Layout

- `index.js`: the manifest, a plain default-exported object.
- `package.json`: its `wranglerExtension` block is the static declaration shown before consent. It has to match the manifest's `id` and `requires`.
- `package-lock.json`: the dependency-free lockfile, kept in line with the other extensions.
- `skills/mob-boss/SKILL.md`, `skills/mob-worker/SKILL.md`: the skills.
- `test/`: `npm test` checks the manifest, static declaration, skill structure and that the skills stay opt-in. No model calls.
- `scripts/live-checks.mjs`: real-provider smoke checks that bill model calls and are never run by `npm test`.
- `scripts/compare-baseline.mjs`: confirms a skill differs from a baseline copy only by the approved role rename.

## Live checks

```
node scripts/live-checks.mjs discovery [--provider claude|codex|both] [--runs N]
node scripts/live-checks.mjs scenarios [--provider claude|codex|both]
```

`discovery` loads the skills the way Agent Wrangler does (a `--plugin-dir` per skill for Claude, the injected catalog for Codex), with user-level skills excluded. It checks that an explicit named request and a generic explicit orchestration-role request activate the right skill, that a simple task and a multi-step coding task activate neither, and that a boss-written launch prompt activates the worker in a fresh session. `scenarios` force-loads each policy and checks its behavioural rules: waiting for notifications, model and effort routing, pruning, reviewer reuse and re-review. Every call is tool-less, so nothing is dispatched or opened. A handful of runs is a smoke check, not evidence of equivalence.
