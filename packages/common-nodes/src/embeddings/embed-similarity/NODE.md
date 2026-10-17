---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/embeddings/embed-similarity/**'
status: current
---

# Embed similarity

|              |                           |
| ------------ | ------------------------- |
| **Type**     | `common-embed-similarity` |
| **Category** | Embeddings                |

## Summary

L2-normalized dot product (cosine) of two JSON number vectors. Pure and
offline: no HTTP and no provider panel. Rejects a non-array, a non-finite
component, a dim mismatch, or a zero-norm vector.

## Inputs

| Port | Type | Notes                 |
| ---- | ---- | --------------------- |
| `a`  | json | required number array |
| `b`  | json | required number array |

## Outputs

| Port    | Type   | Notes                                     |
| ------- | ------ | ----------------------------------------- |
| `score` | number | cosine, typically 0–1 for similar vectors |

---

Source: [`node.ts`](./node.ts).
