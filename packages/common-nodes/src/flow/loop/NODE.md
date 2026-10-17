---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/flow/loop/**'
status: current
---

# Loop

|              |               |
| ------------ | ------------- |
| **Type**     | `common-loop` |
| **Category** | Flow          |

## Summary

External **map-collect** for dynamic N specialists (epic 07). Takes a runtime
list on `items`, emits each element on `item` for a body wired on the canvas,
collects body outputs on `bodyResult`, then emits `results` as a JSON string
array. No hidden in-LLM spawn (MECHANICS C2/C8).

## Inputs

| Port         | Type                        | Notes                                                                                                                                                                                       |
| ------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`      | array / JSON / newline list | Dynamic wire; empty → `results` = `[]`                                                                                                                                                      |
| `bodyResult` | any (dynamic)               | One emission per item from the body node                                                                                                                                                    |
| `rerunItems` | array / JSON / newline list | Optional. Re-runs matching entries of the last completed list. Other slots stay. Unknown strings and an empty value emit nothing. A value before the first completed `items` emits nothing. |

## Outputs

| Port      | Type   | Notes                                       |
| --------- | ------ | ------------------------------------------- |
| `item`    | string | One value per list element (paced)          |
| `results` | string | JSON array of body results, order preserved |

## Runtime contract

- Body is **external** — author wires `item` → specialist → `bodyResult`.
- Items are paced **serially** so a single LLM body gets a fresh init session
  per item (`switchMap` on `userPrompt`, ADR-016).
- `rerunItems` selects entries of the last completed list by string. Only
  those indexes emit on `item`, in original order. `results` then replaces
  those slots and keeps the rest. A new `items` value discards that list and
  walks the new one from the start.
- Distinct role budgets still use separate specialist nodes (fixed swarm) or
  the same body template with Loop for dynamic N axes.
- Memory is not required; handoff is the `results` payload.

## Graph shape

```text
axes → Loop.items
Loop.item → Specialist.userPrompt
Specialist.response → Loop.bodyResult
Loop.results → Merge / Synthesizer / Preview
```
