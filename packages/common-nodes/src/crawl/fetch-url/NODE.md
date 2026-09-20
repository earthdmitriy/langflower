# Fetch URL

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-fetch-url` |
| **Category** | Crawl              |

## Summary

HTTP GET via `@langflower/tools/create-web-fetch` (SSRF guards) + HTML →
plain text. Host allowlist comes from `getRunHostServices(ec)?.allowedHosts`
(private bag — not `ctx.harness` on public `ExecutionContext`).

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
- Unit tests mock `createWebFetch` (offline).
