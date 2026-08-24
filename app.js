/* ============================================================================
 * Agent Flow (public) — app.js
 * Renders the agent-flow SVG graph (7 nodes, 17 typed edges), the breathing
 * activity signal, click-to-explore routing rules, the legend, 6 simulation
 * flows, and the (abstracted) Improvement Draft tab.
 *
 * Also exposes window.AGFL_SHARED — small geometry/escaping/pan-zoom/drag
 * helpers reused by byoa.js (the "Bring Your Own Agents" tab) so that logic
 * isn't duplicated between the two tabs.
 *
 * Vanilla JS (no build step, no framework). Loaded after data.js, before
 * byoa.js. Works from file:// or any static host (no fetch used, no data
 * persisted anywhere).
 * ========================================================================== */
(function () {
  'use strict'

  var D = window.AGFL_DATA
  if (!D) {
    document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px">data.js failed to load — make sure it sits next to index.html.</p>'
    return
  }
  var NODES = D.nodes
  var EDGES = D.edges
  var TYPES = D.typeMeta
  var SIMS = D.sims
  var IMPR = D.impr
  var ACT = D.activity || {}
  var AS_OF = D.asOf || 'unknown'

  var state = {
    tab: 'map', sel: null, hover: null,
    sim: { flow: null, step: -1, playing: false }, timer: null,
    hiddenTypes: {}, introDone: false, introTimer: null
  }
  var pos = {} // runtime drag-position overrides, id -> {x,y}. In-memory only, never saved.

  // "Test a scenario" — checks a from/to pair against the REAL 7-node graph
  // above (not a pasted one). Session-only: counters and the log both live in
  // plain JS variables, reset to zero/empty on every reload, never written to
  // any storage. The optional case-notes text is kept only as a label on the
  // result — it is not analyzed or interpreted in any way (see the on-page
  // note); doing that for real would require sending the text to an actual AI
  // model, which this page's "nothing sent anywhere" design deliberately does
  // not do.
  var testCounters = { pass: 0, fail: 0 }
  var testLog = []

  /* ---------------- shared helpers (also exposed on window.AGFL_SHARED) ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  function shorten(a, b, amt) {
    var dx = b.x - a.x, dy = b.y - a.y
    var len = Math.sqrt(dx * dx + dy * dy) || 1
    return { x: a.x + (dx / len) * amt, y: a.y + (dy / len) * amt }
  }
  function edgePath(from, to, curve) {
    var dx = to.x - from.x, dy = to.y - from.y
    var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
    var len = Math.sqrt(dx * dx + dy * dy) || 1
    var nx = -dy / len, ny = dx / len
    var off = (curve || 0) * Math.min(46, len * 0.28)
    var cx = mx + nx * off, cy = my + ny * off
    return 'M' + from.x + ',' + from.y + ' Q' + cx + ',' + cy + ' ' + to.x + ',' + to.y
  }
  function daysBetween(a, b) {
    var da = new Date(a), db = new Date(b)
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return null
    return Math.max(0, Math.round((db - da) / 86400000))
  }
  function todayStr() {
    var d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function actOf(folder) { return folder && ACT[folder] ? ACT[folder] : null }
  function intensityFor(days) { return days == null ? 0.4 : Math.max(0.15, 1 - days / 14) }
  function breathDur(days) { return (3.6 - 1.7 * intensityFor(days)).toFixed(2) }
  function dotColor(days) { return days == null ? '#9ca3af' : days <= 3 ? '#22c55e' : days <= 7 ? '#f59e0b' : '#9ca3af' }

  /* Pan/zoom for any <svg> that contains a <g class="agfl-viewport">. Simple,
     centered zoom (not cursor-anchored) — a stated simplification, not a bug. */
  function attachPanZoom(svg) {
    var view = svg.querySelector('.agfl-viewport')
    if (!view) return null
    var tf = { x: 0, y: 0, k: 1 }
    function apply() { view.setAttribute('transform', 'translate(' + tf.x + ',' + tf.y + ') scale(' + tf.k + ')') }
    function userScale() {
      var ctm = svg.getScreenCTM()
      return ctm && ctm.a ? 1 / ctm.a : 1
    }
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault()
      var delta = ev.deltaY > 0 ? 0.9 : 1.1
      tf.k = Math.min(4, Math.max(0.4, tf.k * delta))
      apply()
    }, { passive: false })
    var panning = false, last = null
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('[data-node]')) return // node-drag owns this
      panning = true
      last = { x: ev.clientX, y: ev.clientY }
      try { svg.setPointerCapture(ev.pointerId) } catch (e) { /* noop */ }
    })
    svg.addEventListener('pointermove', function (ev) {
      if (!panning) return
      var s = userScale()
      tf.x += (ev.clientX - last.x) * s
      tf.y += (ev.clientY - last.y) * s
      last = { x: ev.clientX, y: ev.clientY }
      apply()
    })
    ;['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
      svg.addEventListener(evt, function () { panning = false })
    })
    return {
      zoomIn: function () { tf.k = Math.min(4, tf.k * 1.2); apply() },
      zoomOut: function () { tf.k = Math.max(0.4, tf.k * 0.8); apply() },
      reset: function () { tf = { x: 0, y: 0, k: 1 }; apply() }
    }
  }

  /* Drag-to-rearrange nodes. onMove(id, x, y) is called with SVG user-space
     coordinates already corrected for the current pan/zoom transform. */
  function attachNodeDrag(svg, onMove, onEnd) {
    var dragging = null
    svg.addEventListener('pointerdown', function (ev) {
      var g = ev.target.closest('[data-node]')
      if (!g) return
      dragging = g.getAttribute('data-node')
      try { svg.setPointerCapture(ev.pointerId) } catch (e) { /* noop */ }
      ev.stopPropagation()
    })
    svg.addEventListener('pointermove', function (ev) {
      if (!dragging) return
      var view = svg.querySelector('.agfl-viewport')
      var ctm = (view || svg).getScreenCTM()
      if (!ctm) return
      var pt = svg.createSVGPoint()
      pt.x = ev.clientX; pt.y = ev.clientY
      var loc = pt.matrixTransform(ctm.inverse())
      onMove(dragging, loc.x, loc.y)
    })
    ;['pointerup', 'pointercancel'].forEach(function (evt) {
      svg.addEventListener(evt, function () {
        if (dragging && onEnd) onEnd(dragging)
        dragging = null
      })
    })
  }

  window.AGFL_SHARED = { esc: esc, shorten: shorten, edgePath: edgePath, attachPanZoom: attachPanZoom, attachNodeDrag: attachNodeDrag }

  function simActiveNode() {
    if (state.sim.flow == null || state.sim.step < 0) return null
    var st = SIMS[state.sim.flow].steps[state.sim.step]
    return st && st.kind === 'node' ? st.id : null
  }
  function simActiveEdge() {
    if (state.sim.flow == null || state.sim.step < 0) return null
    var st = SIMS[state.sim.flow].steps[state.sim.step]
    return st && st.kind === 'edge' ? st.id : null
  }
  function nodePos(id) { return pos[id] || NODES[id] }

  /* ---------------- test a scenario (real 7-node graph) ---------------- */
  // On a 'slipped' verdict, also reconstructs the actual path found (so the
  // result names the real intermediate hop, e.g. "via Sheikh") and returns a
  // concrete mitigation suggestion — not just the bare fact that a gap exists.
  function mitigationFor(fromId, toId, pathIds) {
    var pathLabel = pathIds.map(function (id) { return NODES[id].label }).join(' → ')
    return 'Mitigation: treat this as a real finding, not just a report. Either declare an explicit rule for ' +
      NODES[fromId].label + ' → ' + NODES[toId].label + ' (so it stops being accidental) — a "' + TYPES.blocked.label + '" rule if it should never happen, or any other explicit type if it should — ' +
      'or close the gap at the step that actually creates it (' + pathLabel + '). An indirect path nobody explicitly reviewed is exactly what this tool exists to surface, not something to leave as-is once found.'
  }
  function runRealPathTest(fromId, toId) {
    var direct = EDGES.filter(function (e) { return (e.from === fromId && e.to === toId) || (e.bidir && e.from === toId && e.to === fromId) })[0]
    if (direct) {
      return { verdict: 'documented', detail: 'A declared "' + TYPES[direct.type].label + '" rule governs this pair — ' + (direct.type === 'blocked' ? 'the request would be pulled back, not actioned.' : 'this is an intentional, documented channel.') }
    }
    var adj = {}
    EDGES.forEach(function (e) {
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
          detail: 'No direct rule between these two, but an indirect, undocumented path connects them (via ' + path.slice(1, -1).map(function (id) { return NODES[id].label }).join(', ') + ') — a request could get actioned instead of pulled back.',
          mitigation: mitigationFor(fromId, toId, path)
        }
      }
      (adj[cur] || []).forEach(function (nxt) { if (!seen[nxt]) { seen[nxt] = true; parent[nxt] = cur; queue.push(nxt) } })
    }
    return { verdict: 'isolated', detail: 'No path exists between these two, even indirectly — nothing to pull back, there is no channel at all.' }
  }
  function populateRealTestSelects() {
    var from = document.getElementById('agfl-test-from'), to = document.getElementById('agfl-test-to')
    if (!from || !to) return
    var opts = Object.keys(NODES).map(function (id) { return '<option value="' + esc(id) + '">' + esc(NODES[id].label) + '</option>' }).join('')
    from.innerHTML = opts
    to.innerHTML = opts
    to.selectedIndex = 1
  }
  function renderTestCounters() {
    var box = document.getElementById('agfl-test-counters')
    if (box) box.textContent = '✅ ' + testCounters.pass + ' pulled back / documented · 🔴 ' + testCounters.fail + ' would slip through and get actioned'
  }
  function renderTestLog() {
    var box = document.getElementById('agfl-test-log')
    if (!box) return
    if (!testLog.length) { box.innerHTML = ''; return }
    box.innerHTML = '<div class="agfl-testlog-title">This session’s tests (not saved — clears on reload):</div><ul>' +
      testLog.slice().reverse().map(function (row) {
        var icon = row.verdict === 'slipped' ? '🔴' : row.verdict === 'documented' ? '✅' : '⚪'
        return '<li>' + icon + ' ' + esc(row.from) + ' → ' + esc(row.to) + (row.note ? ' — <i>' + esc(row.note) + '</i>' : '') + '</li>'
      }).join('') + '</ul>'
  }

  /* ---------------- graph build ---------------- */
  function buildGraph() {
    var svg = document.getElementById('agfl-svg')
    var markers = Object.keys(TYPES).map(function (t) {
      return '<marker id="agfl-arrow-' + t + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="' + TYPES[t].color + '"/></marker>'
    }).join('')

    var edgeHtml = EDGES.map(function (e) {
      var a = nodePos(e.from), b = nodePos(e.to)
      var s = shorten(a, b, NODES[e.from].r + 6)
      var t = shorten(b, a, NODES[e.to].r + 6)
      var curve = (e.curve) || ((e.bidir || e.type === 'blocked') ? 0.55 : (e.id === 'sahil-project-manager' || e.id === 'lean-six-sigma-coach-project-manager') ? -0.6 : 0.3)
      var d = edgePath({ x: s.x, y: s.y }, { x: t.x, y: t.y }, curve)
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      var blocked = e.type === 'blocked'
      return '<g data-edge="' + e.id + '" data-etype="' + e.type + '">' +
        '<path class="agfl-edge agfl-edge-' + e.type + '" d="' + d + '" marker-end="url(#agfl-arrow-' + e.type + ')"' + (e.bidir ? ' marker-start="url(#agfl-arrow-' + e.type + ')"' : '') + '/>' +
        '<path class="agfl-edge-hit" d="' + d + '"/>' +
        '<text class="agfl-edge-tag" x="' + mid.x + '" y="' + (mid.y - (blocked ? 10 : 4)) + '">' + esc(blocked ? '⛔ ' + TYPES.blocked.label : TYPES[e.type].label) + '</text>' +
        '</g>'
    }).join('')

    var nodeHtml = Object.keys(NODES).map(function (id) {
      var n = NODES[id]
      var p = nodePos(id)
      var a = actOf(n.folder)
      var days = a && a.lastDate ? daysBetween(a.lastDate, todayStr()) : null
      var ring = n.color
      var tip = n.label + ' [' + n.role + ']' + (days == null ? '' : ' · last dated entry ' + a.lastDate + (days === 0 ? ' (today)' : ' (' + days + 'd ago)'))
      return '<g data-node="' + id + '" class="agfl-node">' +
        '<circle class="agfl-ring" cx="' + p.x + '" cy="' + p.y + '" r="' + (n.r + 7) + '" style="stroke:' + ring + ';animation-duration:' + breathDur(days) + 's;animation-delay:' + (id.length * 0.11).toFixed(2) + 's"/>' +
        '<circle class="agfl-node-core" cx="' + p.x + '" cy="' + p.y + '" r="' + n.r + '" fill="' + n.color + '"/>' +
        '<text class="agfl-node-label" x="' + p.x + '" y="' + (p.y + 3.5) + '">' + esc(n.code) + '</text>' +
        '<text class="agfl-node-role" x="' + p.x + '" y="' + (p.y + n.r + 16) + '">' + esc('[' + n.role + ']') + '</text>' +
        (n.folder ? '<circle class="agfl-actdot" cx="' + (p.x + n.r - 4) + '" cy="' + (p.y - n.r + 4) + '" r="4.5" fill="' + dotColor(days) + '"/>' : '') +
        '<title>' + esc(tip) + '</title>' +
        '</g>'
    }).join('')

    svg.innerHTML = '<defs>' + markers + '</defs><g class="agfl-viewport">' + edgeHtml + nodeHtml + '</g>'
  }

  /* Cheap targeted reflow used while dragging — avoids a full innerHTML
     rebuild (which would fight the pan/zoom transform mid-drag). */
  function reflowNode(id) {
    var svg = document.getElementById('agfl-svg')
    var p = nodePos(id)
    var g = svg.querySelector('[data-node="' + id + '"]')
    if (g) {
      g.querySelectorAll('circle.agfl-ring').forEach(function (c) { c.setAttribute('cx', p.x); c.setAttribute('cy', p.y) })
      var core = g.querySelector('.agfl-node-core')
      if (core) { core.setAttribute('cx', p.x); core.setAttribute('cy', p.y) }
      var label = g.querySelector('.agfl-node-label')
      if (label) { label.setAttribute('x', p.x); label.setAttribute('y', p.y + 3.5) }
      var role = g.querySelector('.agfl-node-role')
      if (role) { role.setAttribute('x', p.x); role.setAttribute('y', p.y + NODES[id].r + 16) }
      var dot = g.querySelector('.agfl-actdot')
      if (dot) { dot.setAttribute('cx', p.x + NODES[id].r - 4); dot.setAttribute('cy', p.y - NODES[id].r + 4) }
    }
    EDGES.forEach(function (e) {
      if (e.from !== id && e.to !== id) return
      var eg = svg.querySelector('[data-edge="' + e.id + '"]')
      if (!eg) return
      var a = nodePos(e.from), b = nodePos(e.to)
      var s = shorten(a, b, NODES[e.from].r + 6)
      var t = shorten(b, a, NODES[e.to].r + 6)
      var curve = (e.curve) || ((e.bidir || e.type === 'blocked') ? 0.55 : (e.id === 'sahil-project-manager' || e.id === 'lean-six-sigma-coach-project-manager') ? -0.6 : 0.3)
      var d = edgePath({ x: s.x, y: s.y }, { x: t.x, y: t.y }, curve)
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      eg.querySelectorAll('path').forEach(function (p2) { p2.setAttribute('d', d) })
      var tag = eg.querySelector('.agfl-edge-tag')
      if (tag) { tag.setAttribute('x', mid.x); tag.setAttribute('y', mid.y - (e.type === 'blocked' ? 10 : 4)) }
    })
  }

  /* ---------------- highlight ---------------- */
  function applyHighlight() {
    var anySel = !!(state.sel || (state.sim.flow != null && state.sim.step >= 0) || state.introActive)
    var simNode = state.introActive ? state.introNode : simActiveNode()
    var simEdge = simActiveEdge()

    Object.keys(NODES).forEach(function (id) {
      var g = document.querySelector('#agfl-svg [data-node="' + id + '"]')
      if (!g) return
      var active = (state.sel && state.sel.kind === 'node' && state.sel.id === id) || state.hover === id || simNode === id
      var dim = anySel && !active
      g.classList.toggle('agfl-dim', dim)
      var ring = g.querySelector('.agfl-ring')
      if (ring) ring.classList.toggle('agfl-ring-active', active)
    })

    EDGES.forEach(function (e) {
      var g = document.querySelector('#agfl-svg [data-edge="' + e.id + '"]')
      if (!g) return
      var active = (state.sel && state.sel.kind === 'edge' && state.sel.id === e.id) || state.hover === e.id || simEdge === e.id
      var typeHidden = !!state.hiddenTypes[e.type]
      var dim = (anySel && !active) || typeHidden
      g.classList.toggle('agfl-dim', dim)
      g.classList.toggle('agfl-hidden', typeHidden && !active)
      var path = g.querySelector('.agfl-edge')
      if (path) path.classList.toggle('agfl-edge-active', active)
      var tag = g.querySelector('.agfl-edge-tag')
      if (tag) tag.classList.toggle('on', active || state.hover === e.id)
    })
  }

  /* ---------------- detail card ---------------- */
  function updateDetail() {
    var box = document.getElementById('agfl-detail')
    var sel = state.sel
    if (sel && sel.kind === 'node') {
      var n = NODES[sel.id]
      var a = actOf(n.folder)
      var days = a && a.lastDate ? daysBetween(a.lastDate, todayStr()) : null
      var routing = ''
      if (n.id === 'ashura') routing = 'Routes risk/scope/RAID to the PM hub; reaches the Technical Lead directly (a deliberate exception); never the Change Management or Quality & Training agents directly.'
      else if (n.id === 'project-manager') routing = 'Central routing hub; no direct dispatch tool of its own to the other agents — handoffs are pre-briefed notes. Holds a narrow close-out carve-out over the other agents.'
      else if (n.id === 'sahil') routing = 'Owns the change-tracking pipeline and facilitates cross-agent retrospectives; reached only via PM-hub delegation, direct from the owner, or as a relay to the training specialist.'
      else if (n.id === 'xec') routing = 'Training/quality; PM-hub co-approval gate on materials; reached via the PM hub or the relay channel, never directly from the front-door agent.'
      else if (n.id === 'lean-six-sigma-coach') routing = 'No direct dispatch tool of its own — pre-briefed notes and sign-off sub-tasks; reached directly by the owner or routed via the PM hub for process issues.'
      else if (n.id === 'technical-lead') routing = 'Full build/debug ownership; direct channel from the front-door agent for routine work; PM-hub review loop; no close-out carve-out yet.'
      else if (n.id === 'sheikh') routing = 'Only the owner’s live direct address authorizes a write. A relayed approval never does — provenance, not fidelity, is the disqualifier.'
      box.innerHTML =
        '<h4>' + esc(n.label) + ' [' + esc(n.role) + ']</h4>' +
        '<ul><li>' + esc(n.desc || '') + '</li>' +
        '<li>Vault area: ' + esc(n.folder || 'n/a (human hub)') +
        (a && a.lastDate ? ' · last dated entry ' + esc(a.lastDate) + (days === 0 ? ' (today)' : ' (' + days + 'd ago)') : '') + '</li>' +
        (routing ? '<li>' + esc(routing) + '</li>' : '') + '</ul>' +
        '<div style="margin-top:6px"><span class="agfl-kbd" data-jump="improve">→ see this agent’s improvement draft</span> <span class="agfl-kbd" data-copylink="1">🔗 copy link to this view</span></div>'
      return
    }
    if (sel && sel.kind === 'edge') {
      var e = EDGES.filter(function (x) { return x.id === sel.id })[0]
      var m = TYPES[e.type]
      var blockedNote = e.type === 'blocked' ? '<div style="margin-top:6px"><span class="agfl-tag" style="border-color:#ef4444;color:#ef4444">decline + active redirect to the PM hub</span></div>' : ''
      box.innerHTML =
        '<h4>' + esc(e.from) + ' → ' + esc(e.to) + (e.bidir ? ' (bidirectional)' : '') + ' · ' + esc(m.label) + '</h4>' +
        '<ul><li>' + esc(m.desc) + '</li><li>' + esc(e.desc) + '</li></ul>' + blockedNote +
        '<div style="margin-top:6px"><span class="agfl-kbd" data-copylink="1">🔗 copy link to this view</span></div>'
      return
    }
    box.innerHTML =
      '<h4>Communication flows between the agents</h4>' +
      '<ul>' +
      '<li>Click any node or line for its routing rules and authorization semantics.</li>' +
      '<li>Nodes breathe — intensity scales with each area’s most recent dated activity (green dot ≤ 3 days, amber ≤ 7, gray older).</li>' +
      '<li>Drag a node to rearrange it. Scroll/pinch or use the +/− buttons to zoom. Click a legend item to hide that connection type.</li>' +
      '<li>Pick a flow below and press Play to watch a real exchange step by step.</li>' +
      '</ul>'
  }

  /* ---------------- simulator ---------------- */
  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null }
  }
  function tick() {
    var flow = SIMS[state.sim.flow]
    if (state.sim.step >= flow.steps.length - 1) {
      state.sim.playing = false
      stopTimer()
    } else {
      state.sim.step += 1
    }
    updateSimUI()
    applyHighlight()
  }
  function selectSim(v) {
    stopTimer()
    state.sim = { flow: v === '' ? null : Number(v), step: -1, playing: false }
    updateSimUI()
    applyHighlight()
  }
  function playPause() {
    if (state.sim.flow == null) return
    if (state.sim.playing) {
      state.sim.playing = false
      stopTimer()
    } else {
      if (state.sim.step < 0) state.sim.step = 0
      state.sim.playing = true
      stopTimer()
      state.timer = setInterval(tick, 1700)
    }
    updateSimUI()
    applyHighlight()
  }
  function resetSim() {
    stopTimer()
    state.sim = { flow: state.sim.flow, step: -1, playing: false }
    updateSimUI()
    applyHighlight()
  }
  function updateSimUI() {
    var flow = state.sim.flow
    var sel = document.getElementById('agfl-sim-select')
    if (sel) sel.value = flow == null ? '' : String(flow)
    var play = document.getElementById('agfl-sim-play')
    if (play) { play.textContent = state.sim.playing ? 'Pause' : 'Play'; play.disabled = flow == null }
    var stepBox = document.getElementById('agfl-sim-step')
    if (stepBox) stepBox.textContent = flow == null ? 'no flow' : 'step ' + (state.sim.step + 1) + ' / ' + SIMS[flow].steps.length
    var narr = document.getElementById('agfl-narrate')
    if (!narr) return
    if (flow != null && state.sim.step >= 0) {
      var st = SIMS[flow].steps[state.sim.step]
      var label = st.kind === 'node' ? NODES[st.id].label : st.kind === 'edge' ? TYPES[EDGES.filter(function (e) { return e.id === st.id })[0].type].label + ' · ' + st.id : 'Note'
      narr.innerHTML = '<b>' + esc(label) + ': </b>' + esc(st.text)
    } else {
      narr.textContent = 'Pick a flow, press Play.'
    }
  }

  /* ---------------- improvement view ---------------- */
  function renderImprove() {
    var box = document.getElementById('agfl-improve')
    var html = '<p class="agfl-imp-intro">' + esc(IMPR.intro) + '</p>'
    html += '<div class="agfl-imp-grid">'
    IMPR.agents.forEach(function (ag) {
      html += '<div class="agfl-imp-card" style="border-left-color:' + ag.color + '">' +
        '<h4>' + esc(ag.name) + '<span class="agfl-tag">' + esc(ag.tag) + '</span></h4>' +
        '<ul>' + ag.points.map(function (p) { return '<li>' + esc(p) + '</li>' }).join('') + '</ul>' +
        '<div style="margin-top:6px">' + ag.tags.map(function (t) { return '<span class="agfl-tag">' + esc(t) + '</span>' }).join('') + '</div>' +
        '</div>'
    })
    html += '</div><div class="agfl-xsec"><h4>Cross-agent improvement themes</h4><ul>'
    IMPR.cross.forEach(function (c) {
      html += '<li><b>' + esc(c.title) + ': </b>' + esc(c.points.join(' ')) + '</li>'
    })
    html += '</ul></div>'
    box.innerHTML = html
  }

  /* ---------------- legend & sim options ---------------- */
  function renderLegend() {
    var box = document.getElementById('agfl-legend')
    box.innerHTML = Object.keys(TYPES).map(function (t) {
      return '<span class="' + (t === 'blocked' ? 'agfl-lg-blocked' : '') + '" data-legend-type="' + t + '" title="Click to show/hide"><i style="border-color:' + TYPES[t].color + '"></i>' + esc(TYPES[t].label) + '</span>'
    }).join('')
  }
  function renderSimOptions() {
    var sel = document.getElementById('agfl-sim-select')
    var html = '<option value="">Simulate a flow…</option>'
    SIMS.forEach(function (s, i) { html += '<option value="' + i + '">' + esc(s.label) + '</option>' })
    sel.innerHTML = html
  }
  function renderSearchList() {
    var dl = document.getElementById('agfl-node-list')
    if (!dl) return
    dl.innerHTML = Object.keys(NODES).map(function (id) { return '<option value="' + esc(NODES[id].label) + '">' }).join('')
  }

  /* ---------------- theme toggle (manual override; nothing persisted) ---------------- */
  function cycleTheme() {
    var html = document.documentElement
    var cur = html.getAttribute('data-theme') // null (auto) -> 'dark' -> 'light' -> null
    var next = cur === null ? 'dark' : cur === 'dark' ? 'light' : null
    if (next === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', next)
    var btn = document.getElementById('agfl-theme-toggle')
    if (btn) btn.textContent = next === 'dark' ? '🌙 Dark' : next === 'light' ? '☀️ Light' : '🌓 Auto'
  }

  /* ---------------- shareable view link ---------------- */
  function syncHash() {
    var h = ''
    if (state.sim.flow != null) h = 'sim=' + state.sim.flow + (state.sim.step >= 0 ? '&step=' + state.sim.step : '')
    else if (state.sel && state.sel.kind === 'node') h = 'node=' + state.sel.id
    else if (state.sel && state.sel.kind === 'edge') h = 'edge=' + state.sel.id
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search)
  }
  function restoreFromHash() {
    var h = location.hash.replace(/^#/, '')
    if (!h) return
    var params = {}
    h.split('&').forEach(function (kv) { var p = kv.split('='); params[p[0]] = p[1] })
    if (params.node && NODES[params.node]) { state.sel = { kind: 'node', id: params.node } }
    else if (params.edge && EDGES.some(function (e) { return e.id === params.edge })) { state.sel = { kind: 'edge', id: params.edge } }
    else if (params.sim != null && SIMS[Number(params.sim)]) {
      state.sim = { flow: Number(params.sim), step: params.step != null ? Number(params.step) : -1, playing: false }
    }
  }

  /* ---------------- guided intro (interrupted by any real interaction) ---------------- */
  function runIntro() {
    if (state.introDone) return
    state.introDone = true
    var ids = Object.keys(NODES)
    var i = 0
    state.introActive = true
    function step() {
      if (!state.introActive || i >= ids.length) {
        state.introActive = false
        state.introNode = null
        applyHighlight()
        return
      }
      state.introNode = ids[i]
      applyHighlight()
      i += 1
      state.introTimer = setTimeout(step, 420)
    }
    step()
  }
  function stopIntro() {
    if (state.introActive) {
      state.introActive = false
      state.introNode = null
      if (state.introTimer) clearTimeout(state.introTimer)
      applyHighlight()
    }
  }

  /* ---------------- tabs & events ---------------- */
  function switchTab(tab) {
    state.tab = tab
    document.getElementById('view-map').style.display = tab === 'map' ? '' : 'none'
    document.getElementById('view-improve').style.display = tab === 'improve' ? '' : 'none'
    var byoa = document.getElementById('view-byoa')
    if (byoa) byoa.style.display = tab === 'byoa' ? '' : 'none'
    document.querySelectorAll('[data-tabbtn]').forEach(function (b) {
      b.classList.toggle('agfl-tab-on', b.getAttribute('data-tabbtn') === tab)
    })
    if (tab === 'improve') renderImprove()
    if (tab === 'map') { updateDetail(); applyHighlight() }
  }

  function bindEvents() {
    document.querySelectorAll('[data-tabbtn]').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tabbtn')) })
    })
    var svg = document.getElementById('agfl-svg')
    svg.addEventListener('click', function (ev) {
      stopIntro()
      var n = ev.target.closest('[data-node]')
      var e = ev.target.closest('[data-edge]')
      if (n) {
        state.sel = { kind: 'node', id: n.getAttribute('data-node') }
        stopTimer()
        state.sim = { flow: null, step: -1, playing: false }
        updateSimUI()
      } else if (e) {
        state.sel = { kind: 'edge', id: e.getAttribute('data-edge') }
      } else {
        state.sel = null
      }
      updateDetail()
      applyHighlight()
      syncHash()
    })
    svg.addEventListener('mouseover', function (ev) {
      var n = ev.target.closest('[data-node]')
      var e = ev.target.closest('[data-edge]')
      state.hover = n ? n.getAttribute('data-node') : e ? e.getAttribute('data-edge') : null
      applyHighlight()
    })
    svg.addEventListener('mouseout', function (ev) {
      if (!ev.relatedTarget || !svg.contains(ev.relatedTarget)) {
        state.hover = null
        applyHighlight()
      }
    })
    document.getElementById('agfl-detail').addEventListener('click', function (ev) {
      var j = ev.target.closest('[data-jump]')
      if (j) switchTab('improve')
      var c = ev.target.closest('[data-copylink]')
      if (c) {
        syncHash()
        if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () {
          c.textContent = '✓ copied'
          setTimeout(function () { c.textContent = '🔗 copy link to this view' }, 1400)
        })
      }
    })
    var sel = document.getElementById('agfl-sim-select')
    sel.addEventListener('change', function () { stopIntro(); selectSim(sel.value); syncHash() })
    document.getElementById('agfl-sim-play').addEventListener('click', function () { stopIntro(); playPause() })
    document.getElementById('agfl-sim-reset').addEventListener('click', resetSim)

    document.getElementById('agfl-legend').addEventListener('click', function (ev) {
      var l = ev.target.closest('[data-legend-type]')
      if (!l) return
      var t = l.getAttribute('data-legend-type')
      state.hiddenTypes[t] = !state.hiddenTypes[t]
      l.classList.toggle('agfl-legend-off', !!state.hiddenTypes[t])
      applyHighlight()
    })

    var themeBtn = document.getElementById('agfl-theme-toggle')
    if (themeBtn) themeBtn.addEventListener('click', cycleTheme)

    var search = document.getElementById('agfl-search')
    if (search) {
      search.addEventListener('change', function () {
        var match = Object.keys(NODES).filter(function (id) { return NODES[id].label.toLowerCase() === search.value.toLowerCase() })[0]
        if (match) {
          stopIntro()
          state.sel = { kind: 'node', id: match }
          updateDetail(); applyHighlight(); syncHash()
          search.value = ''
        }
      })
    }

    var pz = attachPanZoom(svg)
    var zin = document.getElementById('agfl-zoom-in'), zout = document.getElementById('agfl-zoom-out'), zreset = document.getElementById('agfl-zoom-reset')
    if (pz && zin) zin.addEventListener('click', pz.zoomIn)
    if (pz && zout) zout.addEventListener('click', pz.zoomOut)
    if (pz && zreset) zreset.addEventListener('click', pz.reset)

    attachNodeDrag(svg, function (id, x, y) {
      stopIntro()
      pos[id] = { x: x, y: y }
      reflowNode(id)
    })

    document.getElementById('agfl-test-run').addEventListener('click', function () {
      var fromId = document.getElementById('agfl-test-from').value
      var toId = document.getElementById('agfl-test-to').value
      if (!fromId || !toId || fromId === toId) return
      var note = document.getElementById('agfl-test-note').value.trim()
      var r = runRealPathTest(fromId, toId)
      if (r.verdict === 'slipped') testCounters.fail += 1; else testCounters.pass += 1
      testLog.push({ from: NODES[fromId].label, to: NODES[toId].label, verdict: r.verdict, note: note })
      renderTestCounters()
      renderTestLog()
      var out = document.getElementById('agfl-test-result')
      var icon = r.verdict === 'slipped' ? '🔴' : r.verdict === 'documented' ? '✅' : '⚪'
      out.innerHTML = icon + ' <b>' + esc(NODES[fromId].label) + ' → ' + esc(NODES[toId].label) + ':</b> ' + esc(r.detail) +
        (r.mitigation ? '<div class="agfl-mitigation">🛠 ' + esc(r.mitigation) + '</div>' : '')
      document.getElementById('agfl-test-note').value = ''
    })
    document.getElementById('agfl-test-reset').addEventListener('click', function () {
      testCounters = { pass: 0, fail: 0 }
      testLog = []
      renderTestCounters()
      renderTestLog()
      document.getElementById('agfl-test-result').textContent = ''
    })

    bindGuide()
  }

  /* ---------------- user guide modal ---------------- */
  function openGuide() { document.getElementById('agfl-guide-backdrop').style.display = 'flex' }
  function closeGuide() { document.getElementById('agfl-guide-backdrop').style.display = 'none' }
  function bindGuide() {
    var btn = document.getElementById('agfl-guide-btn')
    var backdrop = document.getElementById('agfl-guide-backdrop')
    var closeBtn = document.getElementById('agfl-guide-close')
    if (!btn || !backdrop || !closeBtn) return
    btn.addEventListener('click', openGuide)
    closeBtn.addEventListener('click', closeGuide)
    backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) closeGuide() })
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && backdrop.style.display !== 'none') closeGuide() })
  }

  /* ---------------- init ---------------- */
  function init() {
    document.getElementById('agfl-foot-note').textContent =
      'Snapshot as of ' + AS_OF + ' · breathing = each area’s most recent dated activity · a public, disclosure-abstracted mirror of a real internal governance model — no incident-level detail shown.'
    buildGraph()
    renderLegend()
    renderSimOptions()
    renderSearchList()
    populateRealTestSelects()
    renderTestCounters()
    updateSimUI()
    bindEvents()
    restoreFromHash()
    switchTab('map')
    updateDetail()
    applyHighlight()
    if (!state.sel && state.sim.flow == null) runIntro()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})();
