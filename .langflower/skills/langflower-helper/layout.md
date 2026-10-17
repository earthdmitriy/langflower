# Langflower editor layout — where can I…?

Facts for UI chrome and on-disk paths. Prefer this file over guessing.

## Editor chrome map

- **Topbar** — product mark, then the project folder name (browser
  tab title `<folder> — Langflower`), workflow list, then the **workflow
  file tab** (double-click or the actions menu to rename; a dot when that
  file is dirty; **Save** only while it is dirty and no session is open).
  The actions menu sits next to the workflow list and is hidden while a
  session is open. Then scrollable **session tabs** (`YYYY-MM-DD #N`, name
  order) with **+** (New session) stuck to the last tab. Session tabs
  cannot be renamed. A red dot on a session tab means that session’s graph
  differs from the saved workflow; hover says so. The editor does not copy
  one graph onto the other. × deletes any listed tab after confirmation, including
  one that is not open and a corrupt file. Connection is a dot (the word only while connecting or
  disconnected). Theme toggle and gear → **Settings**.
- **Left palette** — built-in nodes; **Custom** packs; **Update** reloads
  custom packs after disk changes. Collapse with `<<` on the Palette title
  row; restore with floating `>>` at the canvas top-left. Visibility is
  project `paletteVisible` (missing key = shown) and is allowed during a
  run.
- **Center** — canvas (nodes, edges, selection).
- **Right aside** — mutually exclusive modes: **feed** | **inspector** |
  **Settings**. Opening Settings (gear or empty-provider onboarding) swaps out
  feed/inspector; canvas stays. Settings open/close is server-driven.
- **Composer (bottom)** — **Start** / Hard **Stop** / soft **Pause**; HITL
  input and actions; `ask_user` textarea + optional option chips + Send
  (question is in the work log); `permission.ask` Allow/Deny while a run
  needs them.

## Where can I…?

| Goal                                             | Where                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change provider / API key                        | Gear → **Settings** (right aside; Global auto-opens when none configured), or edit `.langflower/langflower.jsonc` (prefer `{env:VAR}`)                                                                                                                                                                                                                                                                                             |
| Store a named secret outside the project         | Gear → **Settings** → **Global** → **Secrets** (write-only). File is `langflower.secrets.json` next to global config — not under the project. Not encryption. Use `{lf_secrets:ID}` or `{env:VAR}` in MCP http `headers`.                                                                                                                                                                                                          |
| Start a Chat Input graph                         | Composer **Start** — not plain **Run**. Prefill lives on the node; Stop then Start reuses it.                                                                                                                                                                                                                                                                                                                                      |
| See run output / stream                          | Right aside **feed**                                                                                                                                                                                                                                                                                                                                                                                                               |
| Answer HITL / send into a waiting node           | Composer + feed context                                                                                                                                                                                                                                                                                                                                                                                                            |
| Answer an agent's `ask_user` question            | Work log shows the question; composer option chips (if any) + textarea + **Send** (not Allow/Deny)                                                                                                                                                                                                                                                                                                                                 |
| Allow or Deny `permission.ask`                   | Composer permission controls                                                                                                                                                                                                                                                                                                                                                                                                       |
| Soft-pause last feed agent / continue            | Composer **Pause** (per-node) / **Continue** (no typed text) or Send (soft pause ≠ Hard Stop)                                                                                                                                                                                                                                                                                                                                      |
| Hard-stop a run                                  | Composer **Stop**                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Edit selected node params / ports                | Select node → right aside **inspector** (not Settings). Close via canvas click or inspector **Close**. Read-only while a run is active — Stop first.                                                                                                                                                                                                                                                                               |
| See what a built-in node does                    | Hover a palette row (popover) **or** select the node → inspector **description** (markdown).                                                                                                                                                                                                                                                                                                                                       |
| Add a node from the palette                      | Drag from the left palette onto the canvas. Disabled while a run is active (`cursor-not-allowed`) — Stop first.                                                                                                                                                                                                                                                                                                                    |
| Hide / show the node palette                     | Palette title `<<` / canvas `>>`. Shared across tabs; stored as `paletteVisible` in project `langflower.jsonc`. Allowed during a run.                                                                                                                                                                                                                                                                                              |
| Add or reload custom nodes                       | Pack under `.langflower/nodes/<pack>/`. Server start loads cached packs when fingerprints match, else compiles. After file changes: on starter, Helper / Writer call `compile_custom_nodes` (Langflower Tools is wired). Else Custom → **Update** (always rebuilds). Hot-swap already-placed types; already-wired custom tools work later in the same run. New types: user places from Custom (no auto-place / auto-wire mid-run). |
| Switch workflow                                  | Topbar workflow list. Load / New / Copy / rename / Delete stay locked while the graph is executing. HITL and steering leave them usable; the parked run stops first.                                                                                                                                                                                                                                                               |
| Continue a conversation after Stop or restart    | Restart opens the newest session. A Run with no tab opens one. **+ New session** is still explicit. A Run continues the head. **Continue from…** lists that session’s points and rewinds. Switching tabs is refused while the graph is executing. HITL and steering allow a switch after the parked run stops.                                                                                                                     |
| Drop a poisoned agent transcript on the next run | Select the agent → inspector **Reset session on input** (OpenAI, Fake, Review, Critique; default off), then start a new run. No reset button. The work log stays.                                                                                                                                                                                                                                                                  |
| Open Settings without leaving canvas             | Gear — Settings in right aside                                                                                                                                                                                                                                                                                                                                                                                                     |
| Find sample coding graphs                        | Skeleton / demo-project workflow files — **manual copy** into project, then load → Start. No Sample workflows catalog UI.                                                                                                                                                                                                                                                                                                          |
| Why extra empty ports on Helper / tools / Router | Those inputs are `multi`. Wiring one slot shows the next free slot. **Feedback** = several sources (HITL + auto-review). **Tools** = several packs. **Router** = extra channels (`ch` / `ch@1`). Leave the empty row unwired.                                                                                                                                                                                                      |
| Project instructions for agents                  | `.langflower/instructions.md`                                                                                                                                                                                                                                                                                                                                                                                                      |

## On-disk `.langflower/` map

| Path               | Role                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `langflower.jsonc` | Providers, secrets refs, project config                                                                                                                                                                                                                |
| `workflows/`       | Saved workflow graphs                                                                                                                                                                                                                                  |
| `skills/`          | Agent skills (`langflower-helper/`, `langflower-node-writer/`, `langflower-workflow-writer/`, `spec-architect/`)                                                                                                                                       |
| `nodes/`           | Custom node packs — one folder / `package.json` each (`my-nodes/`, sample `hello-embed/`, extra sibling packs; no jsonc registration)                                                                                                                  |
| `instructions.md`  | Project-level agent instructions                                                                                                                                                                                                                       |
| `sessions/`        | Workflow sessions named like the tab (`<workflowId>/<label>.json`, `schemaVersion: 1`, plus `<label>.feed.jsonl`). JSON: graph, `nodeStates`, point byte offsets. JSONL: the feed (last run is the slice after the last marker). Not read from `runs/` |
| `logs/`            | Server bridge diagnostic JSONL logs when the server runs                                                                                                                                                                                               |
| `.gitignore`       | Seeded ignore rules: compiled node cache (`.cache/`), `logs/`, pack `node_modules/`                                                                                                                                                                    |

## Out of chrome

- Source and other files **outside** `.langflower/` are the user’s project —
  bootstrap does not rewrite them.
- Closing the browser tab is not “where is Stop” — see companion
  `architecture.md` (server-first runs) and Knowledge base §7.

## Langflower repository docs

When the open folder is the Langflower repo, live docs are
`docs/product/features/README.md`, `docs/product/use-cases/README.md`,
`docs/reference/SESSIONS.md`, `docs/adr/README.md`, and
`docs/bugs/README.md`. Planning notes are `docs/_work/TODO/README.md`.
Frozen history is `docs/_archive/DONE/README.md`.
