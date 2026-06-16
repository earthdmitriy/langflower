# Langflower editor layout — where can I…?

Facts for UI chrome and on-disk paths. Prefer this file over guessing.

## Editor chrome map

- **Topbar** — workflow list (switch / create / rename as shipped), gear →
  **Settings**.
- **Left palette** — built-in nodes; **Custom** packs; **Update** reloads
  custom packs after disk changes.
- **Center** — canvas (nodes, edges, selection).
- **Right aside** — mutually exclusive modes: **feed** | **inspector** |
  **Settings**. Opening Settings (gear or empty-provider onboarding) swaps out
  feed/inspector; canvas stays. Settings open/close is server-driven.
- **Composer (bottom)** — **Start** / Hard **Stop** / soft **Pause**; HITL
  input and actions; `permission.ask` Allow/Deny while a run needs them.

## Where can I…?

| Goal                                   | Where                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Change provider / API key              | Gear → **Settings** (right aside; Global auto-opens when none configured), or edit `.langflower/langflower.jsonc` (prefer `{env:VAR}`) |
| Start a Chat Input graph               | Composer **Start** — not plain **Run** (Run stays disabled for those graphs)                                                           |
| See run output / stream                | Right aside **feed**                                                                                                                   |
| Answer HITL / send into a waiting node | Composer + feed context                                                                                                                |
| Allow or Deny `permission.ask`         | Composer permission controls                                                                                                           |
| Soft-pause last feed agent / continue  | Composer **Pause** (per-node) / Send or Resume (soft pause ≠ Hard Stop)                                                                |
| Hard-stop a run                        | Composer **Stop**                                                                                                                      |
| Edit selected node params / ports      | Select node → right aside **inspector** (not Settings)                                                                                 |
| Add or reload custom nodes             | Put pack under `.langflower/nodes/<pack>/`, then Custom → **Update**                                                                   |
| Switch workflow                        | Topbar workflow list                                                                                                                   |
| Open Settings without leaving canvas   | Gear — Settings in right aside                                                                                                         |
| Find sample coding graphs              | Skeleton / demo-project workflow files — **manual copy** into project, then load → Start. No Sample workflows catalog UI.              |
| Project instructions for agents        | `.langflower/instructions.md`                                                                                                          |

## On-disk `.langflower/` map

| Path               | Role                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `langflower.jsonc` | Providers, secrets refs, project config                                                       |
| `workflows/`       | Saved workflow graphs                                                                         |
| `skills/`          | Agent skills (`langflower-helper/`, `langflower-node-writer/`, `langflower-workflow-writer/`) |
| `nodes/`           | Custom node packs (e.g. `my-nodes/`)                                                          |
| `instructions.md`  | Project-level agent instructions                                                              |
| `runs/`            | Run artifacts / checkpoints when created                                                      |
| `logs/`            | Server bridge diagnostic JSONL logs when the server runs                                      |

## Out of chrome

- Source and other files **outside** `.langflower/` are the user’s project —
  bootstrap does not rewrite them.
- Closing the browser tab is not “where is Stop” — see companion
  `architecture.md` (server-first runs) and Knowledge base §7.
