---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/embeddings/embed-provider/**'
status: current
---

# Embed provider

|              |                         |
| ------------ | ----------------------- |
| **Type**     | `common-embed-provider` |
| **Category** | Embeddings              |

## Summary

Emits a live `EmbedHandle` on `embed` after a one-text probe fixes `dim`.
Panel `providerId` / `model` empty means the Settings default. `embedTexts`
prefixes `query:` or `passage:` and checks the returned dim. Requires the
`embed` capability.

## Inputs

None.

## Outputs

| Port    | Type          | Notes                          |
| ------- | ------------- | ------------------------------ |
| `embed` | `EmbedHandle` | Shared handle for custom packs |

---

Source: [`node.ts`](./node.ts).
