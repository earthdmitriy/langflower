---
name: langflower-docs-fix
description: >-
    Fix-only phase for Langflower docs. Applies a roast list to overwrite a
    feature UI spec or use-case while keeping canonical section order and honesty
    rules. Use when the user asks to fix docs after a roast, or as phase 3 of
    langflower-docs-refine.
---

# Langflower — docs fix (phase 3)

Docs-only overwrite from an existing roast list.

For the full loop, prefer
[langflower-docs-refine](../langflower-docs-refine/SKILL.md).

## Instructions

1. Require a roast list (from user or prior
   [langflower-docs-roast](../langflower-docs-roast/SKILL.md) turn). If missing,
   ask or run roast first.
2. Keep canonical shape from
   [langflower-docs-refine/reference.md](../langflower-docs-refine/reference.md).
3. Overwrite the target applying each roast item (or Status deferral with
   reason).
4. Preserve: no invent; MUST language; Runtime ≤6 acid-test; Feature Details
   without code paths; every Sn in UI specs table.
5. Sync README Index/Status only if the roast demanded it.
6. Return a short what-changed summary.
