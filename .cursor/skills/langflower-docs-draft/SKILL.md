---
name: langflower-docs-draft
description: >-
    Draft-only phase for Langflower docs. Writes or overwrites a feature UI spec
    (docs/features) or use-case (docs/use-cases) from templates without roasting.
    Use when the user asks to draft a UI spec or use-case only, or as phase 1 of
    langflower-docs-refine.
---

# Langflower — docs draft (phase 1)

Docs-only. For the full loop, prefer
[langflower-docs-refine](../langflower-docs-refine/SKILL.md).

## Instructions

1. Determine kind: **feature** (`docs/features/`) or **use-case** (`docs/use-cases/`).
2. Read templates in
   [langflower-docs-refine/reference.md](../langflower-docs-refine/reference.md).
3. Read related demos/JSON before claiming alignment.
4. Overwrite the target file; **do not invent** shipped behaviour.
5. Return path + headings.

Rules: Value/Goal is SoT; MUST on bars; Runtime ≤6 acid-test for use-cases;
Feature Details have no file paths.
