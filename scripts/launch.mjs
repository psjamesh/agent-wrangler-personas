// Launch arguments and event parsers for live-checks.mjs, kept free of side effects so
// `npm test` can pin the tool boundary and the activation parsing without a model call.
export function claudeArgs({ prompt, model, bossDir, workerDir, baseline = false, structured = null, system = null }) {
  const skillArgs = baseline ? [] : ['--setting-sources', 'project', '--plugin-dir', bossDir, '--plugin-dir', workerDir];
  return [
    '-p', prompt, '--model', model, '--effort', 'low',
    ...(system ? ['--setting-sources', 'project', '--append-system-prompt', system] : skillArgs),
    '--strict-mcp-config', '--tools', structured ? '' : 'Skill', '--no-session-persistence',
    ...(structured ? ['--output-format', 'json', '--json-schema', JSON.stringify(structured)]
      : ['--output-format', 'stream-json', '--verbose']),
  ];
}

// Discovery needs the model to read the shipped SKILL.md, so the shell stays, under a read-only,
// network-less sandbox. Scenario calls need no tool at all, so the shell is removed outright.
export function codexArgs({ prompt, model, developerInstructions, discovery, schemaFile = null, lastFile = null }) {
  return [
    'exec', ...(discovery ? ['--json'] : []), '--skip-git-repo-check', '--ephemeral', '--ignore-user-config',
    '-s', 'read-only', '-m', model, '-c', 'model_reasoning_effort=low',
    ...(discovery ? [] : ['--disable', 'shell_tool', '--disable', 'unified_exec']),
    '-c', `developer_instructions=${JSON.stringify(developerInstructions)}`,
    ...(schemaFile ? ['--output-schema', schemaFile, '-o', lastFile] : []),
    prompt,
  ];
}

export function parseClaude(out) {
  const skills = [];
  let text = '';
  for (const line of out.split('\n').filter(Boolean)) {
    const ev = JSON.parse(line);
    if (ev.type === 'assistant') {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use' && block.name === 'Skill') skills.push(block.input.skill);
        if (block.type === 'text') text = block.text;
      }
    }
    if (ev.type === 'result') text = ev.result || text;
  }
  return { skills, text };
}

// A skill counts as activated only by a successful read of its exact shipped file whose output
// carries its frontmatter name and its final line, so a frontmatter-only peek does not count.
// `skillFiles` maps name to { file, tail }.
export function parseCodex(out, skillFiles) {
  const skills = [];
  let text = '';
  for (const line of out.split('\n').filter(Boolean)) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const item = ev.item;
    if (ev.type !== 'item.completed' || !item) continue;
    if (item.type === 'agent_message') text = item.text;
    if (item.type !== 'command_execution' || item.exit_code !== 0 || item.status !== 'completed') continue;
    for (const [name, { file, tail }] of Object.entries(skillFiles)) {
      const reads = item.command.includes(file) && /\b(cat|sed|head|nl|less)\b/.test(item.command);
      const output = item.aggregated_output || '';
      if (reads && output.includes(`name: ${name}`) && output.includes(tail)) skills.push(name);
    }
  }
  return { skills, text };
}
