# Refactoring

## Success criterion

**Decreased amount of code.** If refactoring does not reduce code volume, it is not refactoring — it is shuffling.

## Mandatory analysis phase

Before any refactoring starts, answer:

> "Can the amount of code be decreased?"

If the answer is **no** or **not clearly yes**, stop. The refactoring is not justified.

### What counts as decreased code

- Fewer lines of code
- Fewer files
- Fewer abstractions
- Fewer exports

What does **not** count:

- "Cleaner" structure with same or more lines
- More indirection at same volume
- Splitting one file into two without net reduction

### Analysis checklist

1. **Locate the code to refactor** — which files, how many lines, how many exports
2. **Identify duplication** — repeated patterns, near-identical logic, boilerplate
3. **Count current volume** — lines, files, symbols
4. **Propose the new shape** — what it will look like after refactoring
5. **Count projected volume** — new lines, files, symbols
6. **Verify reduction** — projected volume must be strictly less than current

Only proceed if step 6 passes.

## Rules

- Do not refactor for aesthetics alone
- Do not refactor if it adds more code
- Do not refactor if the decrease is negligible (< 10% of touched code)
- If analysis is uncertain, write a prototype first, measure, then decide
