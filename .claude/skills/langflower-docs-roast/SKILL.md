---
name: langflower-docs-roast
description: >-
    Roast-only phase for Langflower docs. Critiques a feature UI spec or use-case
    against honesty, density, and template rules; outputs numbered concrete fixes
    without editing files. Use when the user asks to roast a UI spec or use-case,
    or as phase 2 of langflower-docs-refine.
---

# Langflower — docs roast (phase 2)

**Do not edit files.** Critique only.

For the full loop, prefer
[langflower-docs-refine](../langflower-docs-refine/SKILL.md).

## Instructions

1. Read the target doc + peer feature/use-case it links.
2. Use the matching checklist in
   [langflower-docs-refine/reference.md](../langflower-docs-refine/reference.md)
   § Roast checklists.
3. Verify demo JSON / CLI / Status claims when the doc asserts them.
4. Return **max 12** numbered items, each with a concrete fix instruction.
5. Call out Runtime monsters, soft language, demo lies, fake UI coverage,
   overlap with sibling UCs.

Do not soften the roast. Do not apply fixes (that is
[langflower-docs-fix](../langflower-docs-fix/SKILL.md)).
