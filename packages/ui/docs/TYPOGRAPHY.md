# Typography (UI)

Typography is Tailwind-first.

## Principles

1. Use Tailwind text, font, leading, tracking, and color utilities.
2. Keep semantic HTML: one `h1` for the editor, `h2` for panels, labels for
   controls.
3. Avoid component SCSS for typography unless a third-party surface cannot be
   expressed in Tailwind.

## Suggested Scale

- App title: `text-base font-semibold tracking-tight`
- Panel title: `text-sm font-semibold`
- Body copy: `text-sm leading-6`
- Captions and metadata: `text-xs`
- Inline code: `font-mono text-xs`

These are conventions for consistency, not a second token system.

## Examples

```html
<h1 class="text-base font-semibold tracking-tight">Langflower</h1>
<h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Palette</h2>
<p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
	Node catalog is projected from the bridge.
</p>
```

## Inputs And Forms

Inputs should use native controls with `@angular/aria` when Angular needs
headless accessibility helpers. Do not use Angular Material for form controls.

```html
<label class="flex flex-col gap-2 text-xs font-medium text-zinc-600">
	<span>Prompt</span>
	<textarea
		class="rounded-lg border border-zinc-200 p-3 text-sm"
		aria-describedby="prompt-help"
	></textarea>
	<span id="prompt-help" class="text-xs text-zinc-500">
		This value is sent through a typed bridge intent.
	</span>
</label>
```

Rules:

- Labels must be visible and associated with the control.
- Hints and errors must use `aria-describedby`.
- Disabled/read-only state must be semantic, not only visual.
- Styling is Tailwind utilities or local `@layer components`.
- No `@angular/material`, `mat-form-field`, `mat-input`, or Material tokens.

## Checklist

- [ ] Typography uses Tailwind utilities.
- [ ] Heading hierarchy matches the visible region.
- [ ] Labels are visible and associated with controls.
- [ ] Inputs use native controls plus `@angular/aria` when needed.
- [ ] No Angular Material form/control primitives.
- [ ] Muted text has light and dark color utilities.
