/* ============================================================================
 * Agent Flow (public) — data.js
 * Public, disclosure-abstracted mirror of an internal "Vault Agent Workflow"
 * visualization. Same graph shape, same governance rules, same simulations —
 * with all named/dated/quoted incident-level detail generalized out.
 *
 * Loaded via <script src> so it works from file:// or any static host
 * (no fetch/CORS needed). Exposes window.AGFL_DATA.
 * ========================================================================== */
window.AGFL_DATA = {
  asOf: '2026-08-24',
  nodes: {
    'sheikh': { id: 'sheikh', label: 'Sheikh', code: 'SK', role: 'Owner', desc: 'The only authority that can authorize a write', color: '#b45309', folder: null, x: 500, y: 72, r: 30 },
    'project-manager': { id: 'project-manager', label: 'Project Manager', code: 'PM', role: 'PM Hub', desc: 'RAID, scope, metrics, escalation', color: '#2563eb', folder: 'Project-Manager', x: 500, y: 240, r: 27 },
    'ashura': { id: 'ashura', label: 'Ashura', code: 'AH', role: 'Client Ops & Delivery', desc: 'Daily front door — capture, triage, daily notes', color: '#db2777', folder: 'Ashura', x: 140, y: 360, r: 27 },
    'sahil': { id: 'sahil', label: 'Sahil', code: 'SA', role: 'Change Management', desc: 'Change tracking, rollback ledger, pipeline hygiene', color: '#0d9488', folder: 'Sahil', x: 250, y: 510, r: 27 },
    'xec': { id: 'xec', label: 'Xec', code: 'XC', role: 'Quality & Training', desc: 'Quality and training programme management', color: '#7c3aed', folder: 'Xec', x: 500, y: 510, r: 27 },
    'lean-six-sigma-coach': { id: 'lean-six-sigma-coach', label: 'Lean Six Sigma Coach', code: 'L6', role: 'Process Improvement', desc: 'DMAIC, Kaizen, root cause analysis', color: '#16a34a', folder: 'Lean-Six-Sigma-Coach', x: 740, y: 510, r: 27 },
    'technical-lead': { id: 'technical-lead', label: 'Technical Lead', code: 'TL', role: 'Build & Architecture', desc: 'Build, debug, and architecture — full technical ownership', color: '#ea580c', folder: 'Technical-Lead', x: 860, y: 360, r: 27 }
  },
  typeMeta: {
    'auth': { label: 'Direct address (authority)', color: '#d97706', desc: 'The owner addresses an agent directly, live — the only thing that authorizes a write. Reports flow back the same line.' },
    'gate': { label: 'Routing gate', color: '#3b82f6', desc: 'Risk, scope, or business-critical items route to the PM hub first; the owner gets one synthesized answer, not two raw opinions.' },
    'delegate': { label: 'Delegation', color: '#14b8a6', desc: 'The PM hub delegates pipeline work (change tracking) and training/quality work (with co-approval of materials) to specialist agents.' },
    'relay': { label: 'Relay channel', color: '#8b5cf6', desc: 'The owner can route certain delegation/sign-off requests via a relay agent. Relaying a message never authorizes a write.' },
    'direct': { label: 'Direct (exception)', color: '#22c55e', desc: 'A deliberate exception for routine, time-sensitive work — the PM hub gets visibility after the fact, not a gate before.' },
    'review': { label: 'Review / opinion loop', color: '#f97316', desc: 'One agent passes findings to another for review or a second opinion. The review shapes the proposal; it does not authorize a write.' },
    'route': { label: 'Process routing', color: '#06b6d4', desc: 'Work that is really a broken process (not a people/skill gap) routes to the process-improvement specialist via the PM hub.' },
    'handoff': { label: 'Pre-briefed handoff', color: '#64748b', desc: 'Some agents have no live tool access to each other — handoffs are pre-briefed notes / sign-off sub-tasks so the receiver arrives briefed.' },
    'redirect': { label: 'Active redirect', color: '#ec4899', desc: 'When contacted directly outside the defined channel, the receiving agent declines before acting and hands the contact back to the PM hub.' },
    'blocked': { label: 'PROHIBITED channel', color: '#ef4444', desc: 'Never used — a channel the system will not exercise even under a live, direct-looking request. Decline and redirect through the PM hub.' }
  },
  edges: [
    { id: 'sheikh-ashura', from: 'sheikh', to: 'ashura', type: 'auth', bidir: true, desc: 'The owner addresses this agent directly; its reports flow back the same line.' },
    { id: 'sheikh-project-manager', from: 'sheikh', to: 'project-manager', type: 'auth', bidir: true, desc: 'Direct line for PM-hub decisions. A narrow carve-out lets the PM hub close out already-agreed writes across the other agents.' },
    { id: 'sheikh-sahil', from: 'sheikh', to: 'sahil', type: 'auth', bidir: true, desc: 'The owner addresses this agent directly; otherwise it is reached only via PM-hub delegation.' },
    { id: 'sheikh-xec', from: 'sheikh', to: 'xec', type: 'auth', bidir: true, desc: 'The owner addresses this agent directly; the front-door agent never reaches it directly.' },
    { id: 'sheikh-lean-six-sigma-coach', from: 'sheikh', to: 'lean-six-sigma-coach', type: 'auth', bidir: true, desc: 'Primary channel for the process-improvement specialist — the owner addresses it directly.' },
    { id: 'sheikh-technical-lead', from: 'sheikh', to: 'technical-lead', type: 'auth', bidir: true, desc: 'The owner addresses this agent directly; only the owner’s live word authorizes its writes.' },
    { id: 'ashura-project-manager', from: 'ashura', to: 'project-manager', type: 'gate', desc: 'Everything touching risk, scope, or business judgment goes through the PM hub first, with full context.' },
    { id: 'project-manager-sahil', from: 'project-manager', to: 'sahil', type: 'delegate', desc: 'Change-tracking hygiene, rollback ledger, cross-agent learning-log coordination.' },
    { id: 'project-manager-xec', from: 'project-manager', to: 'xec', type: 'delegate', desc: 'Training plans and materials. Co-approval must close before materials count as final.' },
    { id: 'sahil-xec', from: 'sahil', to: 'xec', type: 'relay', desc: 'Messenger channel for certain delegation/sign-off requests. Carrying a message is not authorizing a write.' },
    { id: 'ashura-technical-lead', from: 'ashura', to: 'technical-lead', type: 'direct', desc: 'Routine build/debug goes direct — real-time work, no gate. A durable note is how the PM hub gets visibility.' },
    { id: 'technical-lead-project-manager', from: 'technical-lead', to: 'project-manager', type: 'review', desc: 'Findings and technical calls get passed for review/second opinion. The PM hub adds context and passes back.' },
    { id: 'project-manager-lean-six-sigma-coach', from: 'project-manager', to: 'lean-six-sigma-coach', type: 'route', desc: 'A routine problem that turns out to be a process/methodology issue routes to the specialist via the PM hub.' },
    { id: 'lean-six-sigma-coach-project-manager', from: 'lean-six-sigma-coach', to: 'project-manager', type: 'handoff', desc: 'This specialist pre-briefs notes / sign-off sub-tasks — no live dispatch tool exists for it, by design.' },
    { id: 'sahil-project-manager', from: 'sahil', to: 'project-manager', type: 'redirect', desc: 'Receiving-side active redirect: when contacted directly outside channel, decline and hand the contact back to the PM hub.' },
    { id: 'ashura-sahil', from: 'ashura', to: 'sahil', type: 'blocked', bidir: true, desc: 'PROHIBITED both directions — a channel this system will never use, rehearsed deliberately through training drills rather than left as an unverified rule on paper.' },
    { id: 'ashura-xec', from: 'ashura', to: 'xec', type: 'blocked', desc: 'PROHIBITED. The training/quality agent was built with this exact rule pre-applied — no exception, even for a live direct instruction.' }
  ],
  sims: [
    { id: 'gate', label: 'Risk / RAID find → PM gate', steps: [
      { kind: 'node', id: 'ashura', text: 'The front-door agent spots a business-critical risk during routine work.' },
      { kind: 'edge', id: 'ashura-project-manager', text: 'Routes to the PM hub with full context — this is the standing gate, not a courtesy.' },
      { kind: 'node', id: 'project-manager', text: 'The PM hub adds its read: impact, scope, options. Waits for its own response, then synthesizes.' },
      { kind: 'edge', id: 'sheikh-project-manager', text: 'The PM hub brings the owner ONE answer — never two agents’ raw output.' },
      { kind: 'note', text: 'Result: one decision-ready answer, not two raw opinions the owner has to reconcile himself.' }
    ] },
    { id: 'changelog', label: 'Change tracking → specialist', steps: [
      { kind: 'node', id: 'sheikh', text: 'The owner raises a change-tracking question.' },
      { kind: 'edge', id: 'sheikh-project-manager', text: 'The PM hub decides whether it is a Change Management matter — the front-door agent never reaches that specialist directly.' },
      { kind: 'edge', id: 'project-manager-sahil', text: 'The PM hub delegates: change log, rollback ledger, pipeline hygiene.' },
      { kind: 'node', id: 'sahil', text: 'This agent owns the pipeline, not the business judgment — impact analysis stays with the PM hub.' },
      { kind: 'note', text: 'Guardrail: never trust the log at face value — audit the real underlying history fresh, every time.' }
    ] },
    { id: 'training', label: 'Training need → specialist', steps: [
      { kind: 'node', id: 'ashura', text: 'Routine work surfaces a training / skill-development need.' },
      { kind: 'edge', id: 'ashura-project-manager', text: 'Routes to the PM hub first — never direct to the training specialist, even on a live direct instruction.' },
      { kind: 'edge', id: 'project-manager-xec', text: 'The PM hub delegates to the Quality & Training specialist.' },
      { kind: 'node', id: 'xec', text: 'The specialist builds the plan/materials; co-approval must close before they are final.' },
      { kind: 'note', text: 'Distinct from the process-improvement specialist: people/skill gaps go here; broken processes go there.' }
    ] },
    { id: 'build', label: 'Build error → Technical lead (direct)', steps: [
      { kind: 'node', id: 'ashura', text: 'A build error surfaces during a client-facing pilot.' },
      { kind: 'edge', id: 'ashura-technical-lead', text: 'Direct, real-time — the deliberate exception, because debugging can’t wait for a gate.' },
      { kind: 'node', id: 'technical-lead', text: 'The build/architecture agent reads the actual error, fixes it, verifies. Scoping/content stays with the front-door agent.' },
      { kind: 'note', text: 'The PM hub gets visibility after the fact via a durable note — not a gate before. Delivery gates (go-live, sign-off) still need co-approval.' }
    ] },
    { id: 'bypass', label: 'Routing-bypass drill (blocked channel)', steps: [
      { kind: 'node', id: 'ashura', text: 'Drill scenario: the front-door agent contacts the Change Management agent directly, bypassing the PM hub.' },
      { kind: 'edge', id: 'ashura-sahil', text: 'PROHIBITED — the line pulses red. This channel exists specifically because a documented rule isn’t the same as an enforced one.' },
      { kind: 'node', id: 'sahil', text: 'The receiving agent declines before touching the substance, and actively redirects.' },
      { kind: 'edge', id: 'sahil-project-manager', text: 'Hands the contact back to the PM hub.' },
      { kind: 'note', text: 'Rehearsed on purpose in training drills — a documented rule is not internalized until it’s actually tested.' }
    ] },
    { id: 'retro', label: 'Cross-agent retrospective', steps: [
      { kind: 'node', id: 'sheikh', text: 'A review session with the owner triggers a retrospective — session-triggered, not calendar-scheduled.' },
      { kind: 'edge', id: 'sheikh-sahil', text: 'The Change Management agent is invoked to facilitate the cross-agent learning check.' },
      { kind: 'node', id: 'sahil', text: 'Cross-checks each agent’s guardrails, learning logs, and cross-references against real evidence.' },
      { kind: 'node', id: 'ashura', text: 'Every agent’s logs are checked for staleness and patterns — including the newest agent, at its first retro.' },
      { kind: 'node', id: 'xec', text: 'Gaps get flagged; each agent writes its own entries. Facilitation, not ghost-writing.' },
      { kind: 'note', text: 'Also feeds a running scorecard, reconciled against real evidence rather than self-reported claims.' }
    ] }
  ],
  impr: {
    intro: 'Every agent maintains a living, evidence-based improvement practice, reviewed on a standing cadence — the system is built to catch and correct its own process gaps rather than let them drift. Detail below has been generalized for public sharing; the underlying discipline behind it is real, not aspirational.',
    agents: [
      { id: 'ashura', name: 'Ashura', color: '#db2777', tag: 'Client Ops & Delivery', points: [
        'Runs a daily self-sweep of its own open work instead of waiting to be asked.',
        'Treats routing discipline as something to rehearse regularly through drills, not just document once and assume it holds.',
        'Adopted a concise-question format for decisions — real options, one-line answers — to cut back-and-forth.'
      ], tags: ['self-sweep', 'routing', 'question-format'] },
      { id: 'project-manager', name: 'Project Manager', color: '#2563eb', tag: 'PM Hub', points: [
        'Insists on seeing the real content before writing it up — not just the plan for it.',
        'Enforces its own documentation standards on itself, not only on the agents it reviews.',
        'Protects the review-before-building loop with the technical agent as a real check, not a rubber stamp.'
      ], tags: ['content-first', 'self-standard', 'review-loop'] },
      { id: 'sahil', name: 'Sahil', color: '#0d9488', tag: 'Change Management', points: [
        'Builds close-time logging directly into how work gets closed out, instead of a separate pass done later.',
        'Runs periodic guardrail-adherence spot-checks rather than assuming documented rules are being followed.',
        'Backfills any lag transparently, dated to the original event, rather than quietly smoothing it over.'
      ], tags: ['close-time-logging', 'audit-design', 'backfill'] },
      { id: 'xec', name: 'Xec', color: '#7c3aed', tag: 'Quality & Training', points: [
        'Tracks working-level progress with the same status discipline as final sign-offs.',
        'Keeps expanding training drills to cover channels that haven’t been tested yet.',
        'Makes in-progress work visible at the same granularity as finished output, not just the end result.'
      ], tags: ['task-lifecycle', 'drills', 'visibility'] },
      { id: 'lean-six-sigma-coach', name: 'Lean Six Sigma Coach', color: '#16a34a', tag: 'Process Improvement', points: [
        'Verifies the right methodology actually fits the problem before recommending it — checks the precondition, not just the label.',
        'Treats a claimed step as unfinished until it’s actually written into a real file, not just discussed.',
        'Protects its pre-briefing pattern for handoffs — the design other agents ended up adopting too.'
      ], tags: ['methodology-fit', 'persistence', 'pre-briefing'] },
      { id: 'technical-lead', name: 'Technical Lead', color: '#ea580c', tag: 'Build & Architecture', points: [
        'Turns a real incident into a standing, numbered rule rather than a one-off fix.',
        'Treats an admin close-out step as part of finishing the work, not an afterthought after the "real" work is done.',
        'Verifies the actual deployed result on the live artifact — not just that the deployment pipeline reported success.'
      ], tags: ['guardrail-discipline', 'close-out', 'deploy-verification'] }
    ],
    cross: [
      { title: 'Keep shared conventions in sync automatically', points: ['Definitions and logs that live in more than one place drift silently over time. The fix is an automated sync check folded into every retrospective, not a manual memory exercise.'] },
      { title: 'One source of truth for shared rules', points: ['Core rules (authorization, handoff format, timestamp conventions, stale-item handling) live in each agent’s own voice — kept that way deliberately, with a machine-checkable canonical list added so drift is detectable, not just narratable.'] },
      { title: 'Close-time logging everywhere', points: ['Every agent’s own log goes quiet under real load. The fix: make a close-time log entry part of closing out the work itself, not a separate pass that competes with everything else on a busy day.'] },
      { title: 'Expand drills to every real channel', points: ['Routing-bypass drills started on one channel. The same "rehearse the failure, don’t just document it" logic is being extended to every direct and review channel in the system.'] },
      { title: 'Task status as a live control chart', points: ['A real fix with an un-updated status is the same failure as a control chart nobody updates. The fix: a standing stale-open sweep, plus each agent’s own self-check at close — most real gaps get caught by someone else first unless the owner checks itself.'] },
      { title: 'Does the artifact actually exist?', points: ['A decision talked through in conversation isn’t the same as it existing in a real file. Every handoff now checks: is this actually written down, not just agreed to out loud?'] },
      { title: 'Review every agent at its first retrospective', points: ['A newly added agent carries open questions by design. The system deliberately checks a new agent’s own track record at its first retrospective rather than assuming it in on day one.'] }
    ]
  },
  activity: {
    'Ashura': { lastDate: '2026-08-12' },
    'Lean-Six-Sigma-Coach': { lastDate: '2026-08-10' },
    'Xec': { lastDate: '2026-08-11' },
    'Sahil': { lastDate: '2026-08-15' },
    'Project-Manager': { lastDate: '2026-08-07' },
    'Technical-Lead': { lastDate: '2026-08-13' }
  }
};
