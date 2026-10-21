export default {
  id: 'personas',
  label: 'Personas',
  description: 'Adds opt-in operational personas for Agent Wrangler sessions. The Mob group ships `mob-boss`, which decomposes and dispatches work, and `mob-worker`, which owns one bounded deliverable. Ordinary sessions are unaffected until a persona is explicitly requested.',
  author: 'psjamesh',
  homepage: 'https://github.com/psjamesh/agent-wrangler-personas',
  defaultEnabled: true,
  requires: [],
  skills: ['mob-boss', 'mob-worker'],
};
