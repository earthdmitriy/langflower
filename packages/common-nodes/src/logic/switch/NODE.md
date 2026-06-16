# Switch

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-switch` |
| **Category** | Logic           |

## Summary

Routes string `value` by rules: first match → named output port; else
`defaultOutput` (default port `default`).

## Inputs

`value` (string, required)

## Outputs

Static ports: `pass`, `fail`, `default`. Panel `rules` may rematch values onto
those port names only (custom output names are clamped to this set).

## Panel

| Param           | Notes                                     |
| --------------- | ----------------------------------------- |
| `rules`         | `[{ match, output }, …]`                  |
| `matchMode`     | `equals` \| `regex`                       |
| `defaultOutput` | fallback port name (default: `"default"`) |

---

_Implemented via `defineReactiveNode` + `bind()` (`src/logic/switch/node.ts`)._
