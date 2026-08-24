# AI Agent Flow — 1 Human, 6 AI Agents, Real Governance

A standalone, no-build, double-clickable web page showing how one business runs real work through 1 human and 6 specialized AI agents — with typed routing rules, escalation gates, and channels the system will not use even under a request that looks legitimate. Includes a live tool to test that model, and a second tool letting a visitor paste in and test their own.

**No server, no install, no build step, no tracking.** Everything runs from static files. Nothing you interact with here is sent anywhere or saved anywhere.

## How to open it

1. Open this folder.
2. Double-click **`index.html`** — it opens in your default browser.

Or serve it as a static site (this is what a standard GitHub Pages deploy does) — no configuration needed beyond pointing Pages at this folder.

## What it shows

| Section | What it is |
|---|---|
| **Hero + narrative blocks** | The business case in plain language: why explicit authority + typed routing beats "we use AI," why the model isn't tied to one AI vendor, what runs under the hood, what it's built with |
| **Workflow Map** | SVG graph: 7 nodes (1 human hub + 6 agents) and 17 typed, directed, animated edges — routing gate, delegation, relay, a documented direct exception, a review loop, process routing, pre-briefed handoffs, active redirects, and red-dashed **PROHIBITED** channels |
| **Breathing signal** | Every node's ring breathes; speed scales with that area's most recent dated activity |
| **Click to explore** | Click any node → role, area, last activity, routing rules · click any line → flow type + what it means · click empty space to clear |
| **Simulate** | 6 scripted flows with Play/Pause/Reset + step-by-step narration |
| **Test a scenario (real agents)** | Pick who's asking and who they're trying to reach from the real 7 nodes; checks it against the actual rules on the page and reports "pulled back / documented" or "would slip through and get actioned." Optional case-notes field is a label only — not analyzed. Live pass/fail counter + a session log, both in-memory only |
| **Improvement Draft** | Per-agent, evidence-grounded improvement practice — generalized for public sharing, no names/dates/quotes tied to specific incidents |
| **Bring Your Own Agents** | Paste a simple JSON description of your own agent setup (agents + edges + optional flows) and see it rendered live with the same visual engine, complete with animated step-by-step simulations, its own "test a path" tool + counters, and a "Copy as Mermaid" export. Caps at 20 agents at a time. Nothing pasted here is stored, sent, or logged |
| **Interactivity** | Pan/zoom (wheel + drag + buttons), click-to-toggle edge types via the legend, a short guided intro on first load, a manual light/dark/auto theme toggle, shareable view links (URL hash + copy-link), search/jump-to-agent, and drag-to-rearrange nodes |
| **User guide** | A "📖 Guide" button, fixed top-left, opens a closable modal (✕ button, click-outside, or Escape) covering every feature on the page in plain language — nothing else on the page changes state while it's open |
| **Theme** | Auto light/dark via `prefers-color-scheme`, or override manually via the toggle in the header (nothing persisted — resets to auto on reload) |

## What this is a public version of

This is a disclosure-abstracted mirror of a real internal governance model this business runs day to day. Three things were deliberately handled differently here than internally, by explicit decision, not oversight:

1. **The governance model and routing rules are shown in full** — this is the real, differentiated story.
2. **The fact that a structured, evidence-based improvement practice exists is shown** — also real, and itself a credibility signal.
3. **The specific named-agent, dated, quoted incident log behind that improvement practice is not shown.** That's internal retrospective material — useful for running the business, not something an outside reader needs to see verbatim. The Improvement Draft tab here describes the same real practices in generalized terms instead.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell: hero, narrative blocks, the interactive app (3 tabs), footer + credit |
| `styles.css` | All styling — auto dark/light, plus a manual theme override |
| `app.js` | Workflow Map + Improvement Draft logic: SVG graph, breathing, interactions, simulations, pan/zoom, drag, legend toggle, theme toggle, shareable links, search, the real-agent scenario test. Also exposes small shared helpers (`window.AGFL_SHARED`) reused by `byoa.js`. Vanilla JS, no framework |
| `byoa.js` | "Bring Your Own Agents" tab: input parser/validator (JSON only, no `eval`), auto-layout, its own render/simulation engine, its own path-test tool, Mermaid export |
| `data.js` | All data for the main showcase — nodes, edge types, edges, simulations, improvement draft, activity snapshot (`window.AGFL_DATA`) |
| `favicon.svg` | Browser-tab icon — a simple hub-and-nodes mark matching the page's own visual language |
| `README.md` | This file |

## No data saved, anywhere

This page makes no network calls, sets no cookies, and uses no `localStorage`/`sessionStorage`/`indexedDB`. It's static files, full stop — true for the main showcase, the "test a scenario" tool's counters/log, and everything pasted into "Bring Your Own Agents." All of it lives in plain in-memory JavaScript variables for the life of the tab and is gone on refresh.

The two test tools' case-notes fields are kept only as plain labels shown next to a result — neither is analyzed or interpreted. Doing that for real would mean sending the typed text to an actual AI model over the network, which this page deliberately does not do.

## Open items — not yet resolved

- **Social preview image**: `og:title`/`og:description`/Twitter Card tags are in `index.html`, but there's no `og:image` yet — add one and switch `twitter:card` to `summary_large_image` once a real graphic exists. `og:url` is deliberately not set until the real domain is live.
- **Real-agent scenario test — two pending trade-off decisions**, deliberately not decided unilaterally:
  1. Whether the case-notes text should ever be semantically analyzed (would require a network call to an AI model, breaking the no-network design above), vs. staying a label only (current behavior).
  2. Whether test results/counters should persist across a reload for longer-term reference, vs. staying session-only (current behavior, consistent with the original "no data saved" instruction).

## Updating this page

Edit `data.js` for the main showcase's content, `app.js`/`byoa.js`/`styles.css`/`index.html` for behavior/layout — all plain files, no build step required.
