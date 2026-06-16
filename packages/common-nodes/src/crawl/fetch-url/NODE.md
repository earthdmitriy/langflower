# Fetch URL

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-fetch-url` |
| **Category** | Crawl              |

## Summary

HTTP GET via server `ctx.harness.webFetch` (SSRF guards) + HTML → plain text.

## Inputs

`url` (string, required)

## Outputs

`text`, `html`, `status`

## Params

| Param       | Default   |
| ----------- | --------- |
| `timeoutMs` | 30000     |
| `maxBytes`  | 5_000_000 |

## Safety

- Blocks private / loopback / link-local targets (and metadata IPs).
- Optional `harness.allowedHosts` in `langflower.jsonc`.
- Unit tests must mock `webFetch` (offline).
