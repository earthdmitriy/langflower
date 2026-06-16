# Crawl

|              |                |
| ------------ | -------------- |
| **Type**     | `common-crawl` |
| **Category** | Crawl          |

## Summary

BFS crawl with depth / page / same-host limits. Uses `ctx.harness.webFetch`
(SSRF) and `ctx.crawl.savePage`. Budget control = hard caps, not QPS rate
limiting. No browser automation / CAPTCHA.

## Inputs

`startUrl` (string, required)

## Outputs

`pages` (json array of `{ url, text, status, title?, savedPath? }`)

## Params

| Param          | Default |
| -------------- | ------- |
| `maxDepth`     | 1       |
| `maxPages`     | 8       |
| `sameHostOnly` | true    |
| `timeoutMs`    | 30000   |
| `maxBytes`     | 5e6     |
