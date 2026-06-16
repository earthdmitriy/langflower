# Save Page

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-save-page` |
| **Category** | Crawl              |

## Summary

Persists a page under `<project>/.langflower/crawl/{runId}/` via `ctx.crawl`.

## Inputs

`url`, `html`, `text`

## Outputs

`saved` (json: url, html, text, title?, savedPath)
