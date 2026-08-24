/* ============================================================================
 * Agent Flow (public) — byoa.js
 * "Bring Your Own Agents" tab: paste a simple JSON description of your own
 * agent setup, see it rendered with the same visual engine as the main
 * showcase, play animated step-by-step simulations of your own flows, test
 * whether two agents can reach each other through an undocumented path, and
 * copy the result out as Mermaid.
 *
 * Hard privacy rule: no network calls, no localStorage/sessionStorage/
 * cookies/indexedDB. Everything lives in memory for this tab's lifetime only
 * and is gone on refresh. Every piece of user-pasted text is HTML-escaped
 * before it touches the DOM (via AGFL_SHARED.esc from app.js) and is never
 * eval()'d — only JSON.parse.
 * ========================================================================== */
(function () {
  'use strict'

  var SHARED = window.AGFL_SHARED
  var BASE = window.AGFL_DATA
  if (!SHARED || !BASE) return // app.js must load first
  var esc = SHARED.esc, shorten = SHARED.shorten, edgePath = SHARED.edgePath
  var TYPES = BASE.typeMeta
  var TYPE_KEYS = Object.keys(TYPES)
  var MAX_AGENTS = 20

  var G = null // parsed { agents: {id:{...}}, edges: [...], flows: [...] }
  var bpos = {}
  var bstate = { sel: null, hover: null, sim: { flow: null, step: -1, playing: false }, timer: null }
  var counters = { pass: 0, fail: 0 } // in-memory only, never saved

  var EXAMPLE = {
    agents: [
      { id: 'owner', label: 'You', role: 'Owner' },
      { id: 'intake', label: 'Intake Agent', role: 'Front Door' },
      { id: 'reviewer', label: 'Reviewer', role: 'QA' },
      { id: 'archivist', label: 'Archivist', role: 'Records' }
    ],
    edges: [
      { from: 'owner', to: 'intake', type: 'auth', label: 'directs' },
      { from: 'intake', to: 'reviewer', type: 'gate', label: 'escalates for review' },
      { from: 'reviewer', to: 'owner', type: 'auth', label: 'reports back' },
      { from: 'intake', to: 'archivist', type: 'blocked', label: 'never direct — no oversight' }
    ],
    flows: [
      { label: 'A request gets reviewed before it closes', edgeSequence: ['owner-intake', 'intake-reviewer', 'reviewer-owner'] }
    ]
  }

  /* ---------------- parse & validate ---------------- */
  function parse(text) {
    var raw
    try { raw = JSON.parse(text) } catch (e) { return { error: 'Not valid JSON: ' + e.message } }
    if (!raw || typeof raw !== 'object') return { error: 'Top level must be an object with "agents" and "edges".' }
    if (!Array.isArray(raw.agents) || raw.agents.length === 0) return { error: '"agents" must be a non-empty array.' }
    if (raw.agents.length > MAX_AGENTS) return { error: 'Too many agents (' + raw.agents.length + ') — this tool caps at ' + MAX_AGENTS + ' at a time.' }
    var agents = {}
    for (var i = 0; i < raw.agents.length; i++) {
      var a = raw.agents[i]
      if (!a || typeof a.id !== 'string' || !a.id.trim()) return { error: 'agents[' + i + ']: missing a string "id".' }
      if (agents[a.id]) return { error: 'agents[' + i + ']: duplicate id "' + a.id + '".' }
      if (typeof a.label !== 'string' || !a.label.trim()) return { error: 'agents[' + i + '] ("' + a.id + '"): missing a string "label".' }
      agents[a.id] = { id: a.id, label: a.label, role: typeof a.role === 'string' ? a.role : '' }
    }
    if (!Array.isArray(raw.edges)) return { error: '"edges" must be an array (can be empty).' }
    var edges = [], seen = {}
    for (var j = 0; j < raw.edges.length; j++) {
      var e = raw.edges[j]
      if (!e || !agents[e.from]) return { error: 'edges[' + j + ']: "from" must reference a declared agent id.' }
      if (!agents[e.to]) return { error: 'edges[' + j + ']: "to" must reference a declared agent id.' }
      if (TYPE_KEYS.indexOf(e.type) === -1) return { error: 'edges[' + j + ']: "type" must be one of: ' + TYPE_KEYS.join(', ') + '.' }
      var id = e.from + '-' + e.to
      if (seen[id]) return { error: 'edges[' + j + ']: duplicate edge "' + id + '" — combine into one.' }
      seen[id] = true
      edges.push({ id: id, from: e.from, to: e.to, type: e.type, label: typeof e.label === 'string' ? e.label : '', bidir: !!e.bidir })
    }
    var flows = []
    if (raw.flows != null) {
      if (!Array.isArray(raw.flows)) return { error: '"flows" must be an array if present.' }
      for (var k = 0; k < raw.flows.length; k++) {
        var f = raw.flows[k]
        if (!f || typeof f.label !== 'string' || !f.label.trim()) return { error: 'flows[' + k + ']: missing a string "label".' }
        if (!Array.isArray(f.edgeSequence) || f.edgeSequence.length === 0) return { error: 'flows[' + k + '] ("' + f.label + '"): "edgeSequence" must be a non-empty array of edge ids ("from-to").' }
        var seq = []
        for (var m = 0; m < f.edgeSequence.length; m++) {
          var eid = f.edgeSequence[m]
          var found = edges.filter(function (x) { return x.id === eid })[0]
          if (!found) return { error: 'flows[' + k + '] ("' + f.label + '"): edgeSequence[' + m + '] "' + eid + '" is not a declared edge (expected "from-to").' }
          seq.push(found)
        }
        flows.push({ label: f.label, seq: seq })
      }
    }
    return { agents: agents, edges: edges, flows: flows }
  }

  function circularLayout(agents) {
    var ids = Object.keys(agents)
    var n = ids.length
    var cx = 500, cy = 300, rx = 380, ry = 220
    var p = {}
    ids.forEach(function (id, i) {
      var ang = (i / n) * Math.PI * 2 - Math.PI / 2
      p[id] = { x: Math.round(cx + rx * Math.cos(ang)), y: Math.round(cy + ry * Math.sin(ang)) }
    })
    return p
  }

  var COLORS = ['#2563eb', '#db2777', '#0d9488', '#7c3aed', '#16a34a', '#ea580c', '#d97706', '#06b6d4', '#ec4899', '#64748b']

  /* ---------------- render ---------------- */
  function nodePos(id) { return bpos[id] || { x: 500, y: 300 } }

  function buildGraph() {
    var svg = document.getElementById('byoa-svg')
    var markers = TYPE_KEYS.map(function (t) {
      return '<marker id="byoa-arrow-' + t + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="' + TYPES[t].color + '"/></marker>'
    }).join('')
    var ids = Object.keys(G.agents)
    var edgeHtml = G.edges.map(function (e) {
      var a = nodePos(e.from), b = nodePos(e.to)
      var s = shorten(a, b, 26), t = shorten(b, a, 26)
      var curve = e.bidir || e.type === 'blocked' ? 0.5 : 0.28
      var d = edgePath({ x: s.x, y: s.y }, { x: t.x, y: t.y }, curve)
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      var blocked = e.type === 'blocked'
      return '<g data-edge="' + e.id + '" data-etype="' + e.type + '">' +
        '<path class="agfl-edge agfl-edge-' + e.type + '" d="' + d + '" marker-end="url(#byoa-arrow-' + e.type + ')"' + (e.bidir ? ' marker-start="url(#byoa-arrow-' + e.type + ')"' : '') + '/>' +
        '<path class="agfl-edge-hit" d="' + d + '"/>' +
        '<text class="agfl-edge-tag" x="' + mid.x + '" y="' + (mid.y - (blocked ? 10 : 4)) + '">' + esc(blocked ? '⛔ ' + TYPES.blocked.label : (e.label || TYPES[e.type].label)) + '</text>' +
        '</g>'
    }).join('')
    var nodeHtml = ids.map(function (id, i) {
      var n = G.agents[id]
      var p = nodePos(id)
      var color = COLORS[i % COLORS.length]
      return '<g data-node="' + id + '" class="agfl-node">' +
        '<circle class="agfl-ring" cx="' + p.x + '" cy="' + p.y + '" r="26" style="stroke:' + color + ';animation-duration:2.6s;animation-delay:' + (i * 0.1).toFixed(2) + 's"/>' +
        '<circle class="agfl-node-core" cx="' + p.x + '" cy="' + p.y + '" r="19" fill="' + color + '"/>' +
        '<text class="agfl-node-label" x="' + p.x + '" y="' + (p.y + 3.5) + '">' + esc((n.label || '?').slice(0, 2).toUpperCase()) + '</text>' +
        '<text class="agfl-node-role" x="' + p.x + '" y="' + (p.y + 35) + '">' + esc(n.label + (n.role ? ' [' + n.role + ']' : '')) + '</text>' +
        '<title>' + esc(n.label + (n.role ? ' [' + n.role + ']' : '')) + '</title>' +
        '</g>'
    }).join('')
    svg.innerHTML = '<defs>' + markers + '</defs><g class="agfl-viewport">' + edgeHtml + nodeHtml + '</g>'
  }

  function reflowNode(id) {
    var svg = document.getElementById('byoa-svg')
    var p = nodePos(id)
    var g = svg.querySelector('[data-node="' + id + '"]')
    if (g) {
      g.querySelectorAll('circle.agfl-ring').forEach(function (c) { c.setAttribute('cx', p.x); c.setAttribute('cy', p.y) })
      var core = g.querySelector('.agfl-node-core'); if (core) { core.setAttribute('cx', p.x); core.setAttribute('cy', p.y) }
      var label = g.querySelector('.agfl-node-label'); if (label) { label.setAttribute('x', p.x); label.setAttribute('y', p.y + 3.5) }
      var role = g.querySelector('.agfl-node-role'); if (role) { role.setAttribute('x', p.x); role.setAttribute('y', p.y + 35) }
    }
    G.edges.forEach(function (e) {
      if (e.from !== id && e.to !== id) return
      var eg = svg.querySelector('[data-edge="' + e.id + '"]')
      if (!eg) return
      var a = nodePos(e.from), b = nodePos(e.to)
      var s = shorten(a, b, 26), t = shorten(b, a, 26)
      var curve = e.bidir || e.type === 'blocked' ? 0.5 : 0.28
      var d = edgePath({ x: s.x, y: s.y }, { x: t.x, y: t.y }, curve)
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      eg.querySelectorAll('path').forEach(function (p2) { p2.setAttribute('d', d) })
      var tag = eg.querySelector('.agfl-edge-tag')
      if (tag) { tag.setAttribute('x', mid.x); tag.setAttribute('y', mid.y - (e.type === 'blocked' ? 10 : 4)) }
    })
  }

  function applyHighlight() {
    var simFlow = bstate.sim.flow != null ? G.flows[bstate.sim.flow] : null
    var simStep = simFlow && bstate.sim.step >= 0 ? simFlow.seq[bstate.sim.step] : null
    var anySel = !!(bstate.sel || simStep)
    Object.keys(G.agents).forEach(function (id) {
      var g = document.querySelector('#byoa-svg [data-node="' + id + '"]')
      if (!g) return
      var active = (bstate.sel && bstate.sel.kind === 'node' && bstate.sel.id === id) || bstate.hover === id || (simStep && (simStep.from === id || simStep.to === id))
      g.classList.toggle('agfl-dim', anySel && !active)
      var ring = g.querySelector('.agfl-ring')
      if (ring) ring.classList.toggle('agfl-ring-active', active)
    })
    G.edges.forEach(function (e) {
      var g = document.querySelector('#byoa-svg [data-edge="' + e.id + '"]')
      if (!g) return
      var active = (bstate.sel && bstate.sel.kind === 'edge' && bstate.sel.id === e.id) || bstate.hover === e.id || (simStep && simStep.id === e.id)
      g.classList.toggle('agfl-dim', anySel && !active)
      var path = g.querySelector('.agfl-edge')
      if (path) path.classList.toggle('agfl-edge-active', active)
      var tag = g.querySelector('.agfl-edge-tag')
      if (tag) tag.classList.toggle('on', active || bstate.hover === e.id)
    })
  }

  function updateDetail() {
    var box = document.getElementById('byoa-detail')
    if (!box) return
    var sel = bstate.sel
    if (sel && sel.kind === 'node') {
      var n = G.agents[sel.id]
      box.innerHTML = '<h4>' + esc(n.label) + (n.role ? ' [' + esc(n.role) + ']' : '') + '</h4><ul><li>id: <code>' + esc(n.id) + '</code></li></ul>'
      return
    }
    if (sel && sel.kind === 'edge') {
      var e = G.edges.filter(function (x) { return x.id === sel.id })[0]
      var m = TYPES[e.type]
      box.innerHTML = '<h4>' + esc(G.agents[e.from].label) + ' → ' + esc(G.agents[e.to].label) + ' · ' + esc(m.label) + '</h4><ul><li>' + esc(m.desc) + '</li>' + (e.label ? '<li>' + esc(e.label) + '</li>' : '') + '</ul>'
      return
    }
    box.innerHTML = '<h4>Your graph</h4><ul><li>Click a node or line for details. Drag to rearrange, scroll to zoom.</li></ul>'
  }

  /* ---------------- simulator (auto-narrated from edge type) ---------------- */
  function autoText(type, fromLabel, toLabel, edgeLabel) {
    var tpl = {
      auth: '{a} addresses {b} directly — the only thing that authorizes what happens next.',
      gate: '{a} routes to {b} through a gate before anything proceeds.',
      delegate: '{a} delegates this to {b}.',
      relay: '{a} relays this via {b}, without authorizing it.',
      direct: '{a} reaches {b} directly — a deliberate, documented exception.',
      review: '{a} passes this to {b} for review — a second opinion, not an authorization.',
      route: '{a} routes this to {b} for its specialty.',
      handoff: '{a} pre-briefs {b} with a handoff, since no live channel exists between them.',
      redirect: '{a} declines and redirects back through {b}.',
      blocked: '{a} → {b} is PROHIBITED — this path should never be used.'
    }
    var text = (tpl[type] || '{a} → {b}.').replace('{a}', fromLabel).replace('{b}', toLabel)
    return edgeLabel ? text + ' (' + edgeLabel + ')' : text
  }
  function stopTimer() { if (bstate.timer) { clearInterval(bstate.timer); bstate.timer = null } }
  function tick() {
    var flow = G.flows[bstate.sim.flow]
    if (bstate.sim.step >= flow.seq.length - 1) { bstate.sim.playing = false; stopTimer() } else { bstate.sim.step += 1 }
    updateSimUI(); applyHighlight()
  }
  function selectSim(v) {
    stopTimer()
    bstate.sim = { flow: v === '' ? null : Number(v), step: -1, playing: false }
    updateSimUI(); applyHighlight()
  }
  function playPause() {
    if (bstate.sim.flow == null) return
    if (bstate.sim.playing) { bstate.sim.playing = false; stopTimer() }
    else {
      if (bstate.sim.step < 0) bstate.sim.step = 0
      bstate.sim.playing = true; stopTimer()
      bstate.timer = setInterval(tick, 1700)
    }
    updateSimUI(); applyHighlight()
  }
  function resetSim() { stopTimer(); bstate.sim = { flow: bstate.sim.flow, step: -1, playing: false }; updateSimUI(); applyHighlight() }
  function updateSimUI() {
    var flow = bstate.sim.flow
    var sel = document.getElementById('byoa-sim-select'); if (sel) sel.value = flow == null ? '' : String(flow)
    var play = document.getElementById('byoa-sim-play'); if (play) { play.textContent = bstate.sim.playing ? 'Pause' : 'Play'; play.disabled = flow == null }
    var stepBox = document.getElementById('byoa-sim-step')
    if (stepBox) stepBox.textContent = flow == null ? 'no flow' : 'step ' + (bstate.sim.step + 1) + ' / ' + G.flows[flow].seq.length
    var narr = document.getElementById('byoa-narrate')
    if (!narr) return
    if (flow != null && bstate.sim.step >= 0) {
      var e = G.flows[flow].seq[bstate.sim.step]
      var text = autoText(e.type, G.agents[e.from].label, G.agents[e.to].label, e.label)
      narr.innerHTML = '<b>' + esc(TYPES[e.type].label) + ': </b>' + esc(text)
    } else {
      narr.textContent = 'Pick a flow, press Play.'
    }
  }
  function renderSimOptions() {
    var sel = document.getElementById('byoa-sim-select')
    var html = '<option value="">Simulate a flow…</option>'
    G.flows.forEach(function (f, i) { html += '<option value="' + i + '">' + esc(f.label) + '</option>' })
    sel.innerHTML = html
    var wrap = document.getElementById('byoa-sim-wrap')
    if (wrap) wrap.style.display = G.flows.length ? '' : 'none'
  }

  /* ---------------- path test ("does a use case slip through?") ---------------- */
  function populateTestSelects() {
    var from = document.getElementById('byoa-test-from'), to = document.getElementById('byoa-test-to')
    if (!from || !to) return
    var opts = Object.keys(G.agents).map(function (id) { return '<option value="' + esc(id) + '">' + esc(G.agents[id].label) + '</option>' }).join('')
    from.innerHTML = opts
    to.innerHTML = opts
    if (Object.keys(G.agents).length > 1) to.selectedIndex = 1
  }
  // On a 'slipped' verdict, also reconstructs and names the actual path found,
  // and returns a concrete mitigation suggestion — not just the bare fact.
  function mitigationFor(fromId, toId, pathIds) {
    var pathLabel = pathIds.map(function (id) { return G.agents[id].label }).join(' → ')
    return 'Mitigation: treat this as a real finding, not just a report. Either declare an explicit edge for ' +
      G.agents[fromId].label + ' → ' + G.agents[toId].label + ' (a "' + TYPES.blocked.label + '" one if it should never happen, any other type if it should), ' +
      'or close the gap at the step that actually creates it (' + pathLabel + '). An indirect path nobody explicitly reviewed is exactly what this tool exists to surface.'
  }
  function runPathTest(fromId, toId) {
    var direct = G.edges.filter(function (e) { return (e.from === fromId && e.to === toId) || (e.bidir && e.from === toId && e.to === fromId) })[0]
    if (direct) {
      return { verdict: 'documented', detail: 'A declared "' + TYPES[direct.type].label + '" edge governs this pair directly.' }
    }
    // BFS over non-blocked edges only — blocked edges are hard stops, not traversable.
    var adj = {}
    G.edges.forEach(function (e) {
      if (e.type === 'blocked') return
      (adj[e.from] = adj[e.from] || []).push(e.to)
      if (e.bidir) (adj[e.to] = adj[e.to] || []).push(e.from)
    })
    var seen = {}, queue = [fromId], parent = {}
    seen[fromId] = true
    while (queue.length) {
      var cur = queue.shift()
      if (cur === toId) {
        var path = [toId], walk = toId
        while (parent[walk] != null) { walk = parent[walk]; path.unshift(walk) }
        return {
          verdict: 'slipped',
          detail: 'No direct rule between these two, but an indirect, undocumented path connects them (via ' + path.slice(1, -1).map(function (id) { return G.agents[id].label }).join(', ') + ') — a possible governance gap.',
          mitigation: mitigationFor(fromId, toId, path)
        }
      }
      (adj[cur] || []).forEach(function (nxt) {
        if (!seen[nxt]) { seen[nxt] = true; parent[nxt] = cur; queue.push(nxt) }
      })
    }
    return { verdict: 'isolated', detail: 'No path exists between these two, even indirectly — properly isolated.' }
  }
  function renderCounters() {
    var box = document.getElementById('byoa-counters')
    if (box) box.textContent = '✅ ' + counters.pass + ' contained · 🔴 ' + counters.fail + ' slipped through'
  }

  /* ---------------- Mermaid export ---------------- */
  function toMermaid() {
    var lines = ['flowchart LR']
    Object.keys(G.agents).forEach(function (id) {
      var n = G.agents[id]
      lines.push('  ' + safeId(id) + '["' + mermaidEscape(n.label + (n.role ? ' [' + n.role + ']' : '')) + '"]')
    })
    G.edges.forEach(function (e) {
      var arrow = e.type === 'blocked' ? '-.->' : '-->'
      var label = e.label || TYPES[e.type].label
      lines.push('  ' + safeId(e.from) + ' ' + arrow + '|' + mermaidEscape(label) + '| ' + safeId(e.to))
    })
    return lines.join('\n')
  }
  function safeId(id) { return 'n_' + id.replace(/[^a-zA-Z0-9_]/g, '_') }
  function mermaidEscape(s) { return String(s).replace(/"/g, "'") }

  /* ---------------- render pipeline ---------------- */
  function renderAll() {
    bpos = circularLayout(G.agents)
    buildGraph()
    populateTestSelects()
    renderSimOptions()
    updateSimUI()
    updateDetail()
    applyHighlight()
    var pz = SHARED.attachPanZoom(document.getElementById('byoa-svg'))
    var zin = document.getElementById('byoa-zoom-in'), zout = document.getElementById('byoa-zoom-out'), zreset = document.getElementById('byoa-zoom-reset')
    if (pz && zin) zin.onclick = pz.zoomIn
    if (pz && zout) zout.onclick = pz.zoomOut
    if (pz && zreset) zreset.onclick = pz.reset
    SHARED.attachNodeDrag(document.getElementById('byoa-svg'), function (id, x, y) { bpos[id] = { x: x, y: y }; reflowNode(id) })
  }

  function showError(msg) {
    var box = document.getElementById('byoa-error')
    box.textContent = msg
    box.style.display = msg ? '' : 'none'
  }

  function handleRender() {
    var text = document.getElementById('byoa-input').value
    var result = parse(text)
    if (result.error) { showError(result.error); G = null; return }
    showError('')
    G = result
    document.getElementById('byoa-canvas').style.display = ''
    renderAll()
  }

  function bindEvents() {
    document.getElementById('byoa-render').addEventListener('click', handleRender)
    document.getElementById('byoa-example').addEventListener('click', function () {
      document.getElementById('byoa-input').value = JSON.stringify(EXAMPLE, null, 2)
      handleRender()
    })
    var svg = document.getElementById('byoa-svg')
    svg.addEventListener('click', function (ev) {
      var n = ev.target.closest('[data-node]'), e = ev.target.closest('[data-edge]')
      if (n) { bstate.sel = { kind: 'node', id: n.getAttribute('data-node') }; stopTimer(); bstate.sim = { flow: null, step: -1, playing: false }; updateSimUI() }
      else if (e) { bstate.sel = { kind: 'edge', id: e.getAttribute('data-edge') } }
      else { bstate.sel = null }
      updateDetail(); applyHighlight()
    })
    svg.addEventListener('mouseover', function (ev) {
      var n = ev.target.closest('[data-node]'), e = ev.target.closest('[data-edge]')
      bstate.hover = n ? n.getAttribute('data-node') : e ? e.getAttribute('data-edge') : null
      applyHighlight()
    })
    svg.addEventListener('mouseout', function (ev) {
      if (!ev.relatedTarget || !svg.contains(ev.relatedTarget)) { bstate.hover = null; applyHighlight() }
    })
    document.getElementById('byoa-sim-select').addEventListener('change', function (ev) { selectSim(ev.target.value) })
    document.getElementById('byoa-sim-play').addEventListener('click', playPause)
    document.getElementById('byoa-sim-reset').addEventListener('click', resetSim)

    document.getElementById('byoa-test-run').addEventListener('click', function () {
      var fromId = document.getElementById('byoa-test-from').value
      var toId = document.getElementById('byoa-test-to').value
      if (!fromId || !toId || fromId === toId) return
      var r = runPathTest(fromId, toId)
      if (r.verdict === 'slipped') counters.fail += 1; else counters.pass += 1
      renderCounters()
      var out = document.getElementById('byoa-test-result')
      var icon = r.verdict === 'slipped' ? '🔴' : r.verdict === 'documented' ? '✅' : '⚪'
      out.innerHTML = icon + ' <b>' + esc(G.agents[fromId].label) + ' → ' + esc(G.agents[toId].label) + ':</b> ' + esc(r.detail) +
        (r.mitigation ? '<div class="agfl-mitigation">🛠 ' + esc(r.mitigation) + '</div>' : '')
    })
    document.getElementById('byoa-test-reset').addEventListener('click', function () {
      counters = { pass: 0, fail: 0 }
      renderCounters()
      document.getElementById('byoa-test-result').textContent = ''
    })

    document.getElementById('byoa-mermaid').addEventListener('click', function () {
      var out = document.getElementById('byoa-mermaid-out')
      out.textContent = toMermaid()
      out.style.display = ''
    })
    document.getElementById('byoa-mermaid-copy').addEventListener('click', function () {
      var out = document.getElementById('byoa-mermaid-out')
      if (!out.textContent) out.textContent = toMermaid()
      out.style.display = ''
      if (navigator.clipboard) navigator.clipboard.writeText(out.textContent).then(function () {
        var b = document.getElementById('byoa-mermaid-copy')
        var orig = b.textContent
        b.textContent = '✓ Copied'
        setTimeout(function () { b.textContent = orig }, 1400)
      })
    })
  }

  function init() {
    document.getElementById('byoa-input').value = JSON.stringify(EXAMPLE, null, 2)
    renderCounters()
    bindEvents()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})();
