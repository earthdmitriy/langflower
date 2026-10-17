---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/embeddings/embed-text/**'
status: current
---

# Embed text

|              |                     |
| ------------ | ------------------- |
| **Type**     | `common-embed-text` |
| **Category** | Embeddings          |

## Summary

Embeds one wired string through the host embeddings factory. Sends the raw
text (no e5 role prefix). Panel `providerId` / `model` empty means the
Settings default. Requires the `embed` capability. An empty vector list
from the provider is an error.

## Inputs

| Port   | Type   | Notes    |
| ------ | ------ | -------- |
| `text` | string | required |

## Outputs

| Port      | Type   | Notes                                       |
| --------- | ------ | ------------------------------------------- |
| `vector`  | json   | number array from the first returned vector |
| `dim`     | number | provider dim                                |
| `preview` | string | `dim=` plus the first eight rounded floats  |

---

Source: [`node.ts`](./node.ts).
