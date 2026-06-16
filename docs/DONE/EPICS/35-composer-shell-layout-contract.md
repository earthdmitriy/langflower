# Epic 35 — Composer shell layout contract (UI)

**Status:** landed  
**Depends on:** — (docs already locked in feed-panel / hitl-chat / palette §8)  
**Index:** [README.md](README.md)  
**Next:** —  
**Feeds:** [hitl-chat](../../features/hitl-chat.md),
[feed-panel](../../features/feed-panel.md)

## Goal

Implement the composer shell from [feed-panel](../../features/feed-panel.md)
§ Composer layout and [`docs/palette.html`](../../palette.html) §8: full-bleed
textarea, no field labels, tabs only when 2+ HITL, no single-gate title chrome,
pill CTAs, shared control height.

## Prerequisites (already done)

- Feature docs + THEMES normalize tokens documented (docs pass 2026-07-24).

## Acceptance criteria

1. Composer is one full-bleed textarea — no Goal / Message / Feedback field
   labels; destination = pressed CTA.
2. Tab strip only when 2+ awaiting HITL gates; 0–1 gate → no tab strip and no
   title-only chrome row.
3. Footer one line; text CTAs = `rounded-full` pills; round icons match
   `--lf-control-h` / `--lf-btn-pad` (THEMES).
4. Idle Chat Input **Start** (emerald) and mid-run reply CTAs match the layout
   table; chat footer stays mounted for the run (no jump to plain full-width
   Run).
5. STATUS / feature docs no longer claim shell layout docs-ahead for these
   items once shipped.
6. UI unit / component coverage where practical; `verify` green.

## Landed

- `lf-composer-shell` owns stage + footer; `editor-shell` only passes height.
- No textarea field labels; `config.title` kept as `aria-label` only.
- Tab strip via `showComposerTabStrip` (2+ only); no single-gate title chrome.
- Footer modes: permission / working (Stop left · Pause right) / hitl
  (Stop left when running; Pause never) / idleRun.
- Tokens `--lf-control-h` / `--lf-btn-pad` + `.lf-composer-pill` /
  `.lf-composer-icon-btn` in `packages/ui/src/styles.scss`.
- Pure tests: `composer-footer-mode.test.ts`.

## Verify

- Manual vs palette §8 specimens 1–4 (Start, single HITL, multi tabs, chat
  answer); multi-browser tab awaiting via bus facts (operator Test Case 5).
- `node build/tools/agent-run.mjs verify` / `verify --quick`.
