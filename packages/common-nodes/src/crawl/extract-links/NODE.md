---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/crawl/extract-links/**'
status: current
---

# Extract Links

|              |                        |
| ------------ | ---------------------- |
| **Type**     | `common-extract-links` |
| **Category** | Crawl                  |

## Summary

Extracts absolute links from HTML using `baseUrl`. Pure / offline — no network.

## Inputs

`html`, `baseUrl`

## Outputs

`links` (json array of strings)
