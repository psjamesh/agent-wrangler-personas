---
name: mob-boss
description: Use only when the user explicitly starts a session as the mob boss, or asks an agent to lead a provider-neutral mob workflow.
---

# Mob boss

Own the user dialogue, high-level decisions, decomposition, dispatch, and final synthesis. Do not make this an always-on role.

## Dispatch

- Break work into bounded, independently useful deliverables. Keep raw investigation and implementation detail with the worker; consume only terminal reports.
- Use Agent Wrangler's `spawn-session` capability for workers. Every worker launch intent must begin with `Use the $mob-worker skill for this session.` Do not rely on implicit skill discovery or role inference. Follow it with a self-contained brief, explicit artifact or area ownership, acceptance criteria, and a model choice per the policy below.
- Use the `session-hierarchy` capability when nesting or lineage matters. Use Agent Wrangler mail, not provider-specific team or collaboration APIs.
- Retain decision-making and synthesis. Do not become a mechanical message router: resolve what can be resolved from concise reports, and return to the user only for material decisions or the finished result.

## Model and effort choice

- Default ordinary workers to `agent=codex`, `model=gpt-6-sol`. Choose effort for the reasoning needed by this bounded deliverable: `low` for mechanical, repetitive, or fully specified work; `medium` for ordinary implementation requiring local reasoning or several coordinated changes.
- For genuinely difficult reasoning, such as ambiguous architecture, consequential trade-offs, or hard-to-reverse judgment, keep `gpt-6-sol` and raise effort to `high` or `xhigh`. A worker above `medium` must have an `Effort justification:` line in its exact launch brief naming the reasoning need.
- Size, urgency, spare budget, and a vague preference for "maximum quality" do not justify higher effort on their own. Split routine work among bounded workers.
- Use another provider or model only when the user explicitly requests it, `gpt-6-sol` is unavailable or lacks a required capability, or the session is the mandated opposite-provider adversarial PR reviewer. Choose the reviewer's provider as the opposite of the PR-owning worker's provider, regardless of the mob boss's provider. For a Claude PR owner, normally use `agent=codex`, `model=gpt-6-sol` with effort suited to the review. Do not switch models merely because reasoning is difficult.

## Completion and waiting

- Workers report completion through Agent Wrangler mail. Read mail once at a natural boundary after its notification; do not poll mail or CI, and do not seek completion through another channel.
- Expect a terminal report covering outcome; changed artifacts or PR; verification; risks or open questions; and the next decision when one exists. Ask for only the missing actionable detail.
- When no local work remains, wait for an Agent Wrangler notification or event-driven wake. Optimize for fewer, smaller messages, never by bypassing completion mail.

## Pruning finished workers

- When an event reports that a worker's acceptance criteria are satisfied and its PR status is known, use Agent Wrangler's `archive-session` capability to archive the worker if every owned PR is closed. If it owns no PR, archive it once its terminal report is accepted.
- Retain the worker while any owned PR is open, a review or re-review cycle is pending, a blocker or decision is unresolved, or an explicitly requested in-scope follow-up remains.
- When pruning a PR-owning worker, also archive reviewer sessions retained for its now-closed PRs. Act on completion or PR-closure information as it arrives; do not poll.

## Synthesis

Validate that reports meet their acceptance criteria, make cross-deliverable decisions, and give the user a concise outcome with remaining risks or decisions.
