# Themes (UI)

Tailwind is the only theming system.

## Principles

1. Use Tailwind utilities for colors, spacing, borders, radius, and state.
2. Use Tailwind dark variants for dark mode.
3. Keep theme switching UI-only; it must not become workflow state.
4. Repeated visual primitives belong in `@layer components`, not ad-hoc SCSS
   token files.

## Files

- `src/styles.scss` imports Tailwind and defines the dark custom variant.
- `src/app/services/theme.service.ts` persists `dark` / `light` and writes
  `html[data-theme]`.
- `.postcssrc.json` loads `@tailwindcss/postcss`.

## Dark Mode

Dark mode is selected by `html[data-theme='dark']`.

```scss
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```

Use normal Tailwind classes:

```html
<section
	class="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100"
></section>
```

## Buttons and tooltips

- **Cursor** — global base styles give `button` a pointer cursor when enabled
  and `not-allowed` when `disabled` / `aria-disabled`. Resize grips keep their
  own `cursor-col-resize` / `cursor-row-resize` utilities.
- **Tooltips** — use styled `lf-hover-tip`
  (`src/app/components/lf-hover-tip.component.ts`), not bare OS `title`.
  Icon-only controls and disabled actions must explain themselves on hover
  (what the control does, or why it is disabled).
- **Anchor** — near the right window edge prefer `align="end"` so the tip
  grows left and is not clipped. Workflow topbar controls use
  `side="bottom" align="center"`; composer footer actions keep the default
  `side="top" align="end"`.
- **Composer normalize tokens** (shipped, epic 35; SSOT
  [`docs/palette.html`](../../../docs/palette.html) §8): shared control height
  (`--lf-control-h`) and pill pad (`--lf-btn-pad`) in `src/styles.scss`; text
  CTAs use `.lf-composer-pill`; round icons use `.lf-composer-icon-btn`
  (both under `@layer components`).
- **Run-control encoding**
  ([ADR-031](../../../docs/ADR.md#adr-031--stop-hard-cancel-vs-pause-soft-interrupt-vs-steer)):
  **Start** = emerald; hard **Stop** = rose (left while running); soft
  **Pause** / Steer accents = amber (right while running). Do not reuse amber
  for hard Stop. Left-corner tip grows top-left; right-corner tip grows
  top-right.

## Component Checklist

- [ ] Styling is Tailwind-first.
- [ ] Dark mode has explicit `dark:*` classes where needed.
- [ ] Form controls use native elements plus `@angular/aria` when headless
      accessibility behaviour is needed.
- [ ] Inputs, textareas, buttons, selects, and dialogs are styled with Tailwind,
      not Angular Material.
- [ ] Buttons follow **Buttons and tooltips** above (`lf-hover-tip` where needed).
- [ ] Repeated visual primitives use `@layer components`.
- [ ] Scrollable regions (`overflow-auto` / `overflow-y-auto`, dropdowns,
      panels) include the `.lf-scroll` utility — do not ship a bare system
      scrollbar.
- [ ] No domain data is stored to support visual state.
- [ ] Both light and dark modes are checked when changing shared chrome.
