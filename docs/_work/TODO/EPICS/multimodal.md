---
kind: work
owner: docs
covers: []
status: current
---

# Multimodal

**Status:** unscheduled. No epic number until it is placed on the queue.

## Problem statement

A person can attach a picture in the composer and ask what is in it. Today
that path does not exist.

The composer sends text only. Chat Input and Chat Loop push a string on
`runner.hitl.event`. Steer is `{ kind: 'steer', text }`. `ask_user` is
`RunnerAskUserReplyPayload.text`. `ChatCompletionMessage.content` is always
a string, and session restore drops a message whose `content` is not a
string
([llm-session-shell.ts](../../../../packages/common-nodes/src/ai/features/llm-session/llm-session-shell.ts)).
The only chat HTTP call is `client.chat.completions.create`
([create-chat-completion-stream.ts](../../../../packages/common-nodes/src/ai/features/openai/create-chat-completion-stream.ts)).
The model catalog is `{ id, name? }` with no vision flag.

`ToolHandler` returns `Promise<string>`
([tool-handle.ts](../../../../packages/node-sdk/src/node-factory/define-tool-registrations/tool-handle.ts)).
A Chat Completions `role: tool` message is a string or text parts. It
cannot carry `image_url`, `input_audio`, or `file`
([create chat completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/)).

Feed images are a side effect of markdown on `result` bubbles
(`renderMarkdown` + DOMPurify). The user bubble (`hitl-user`, steer,
`ask-user-reply`) is a `<pre>`, not markdown
([lf-feed-row.component.ts](../../../../packages/ui/src/app/features/feed/components/lf-feed-row.component.ts)).
Civitai puts `![id](https://…)` on a string port. The server does not
serve project files. Express serves the UI dist only
([create-server.ts](../../../../packages/server/src/create-server.ts)).
There is no multipart parser in the server dependencies.

`HitlUploadedFile` (`fileId`, `name`, `mimeType`, `size`) and
`HitlFileControl` (`kind: 'file'`) already exist
([hitl-config.ts](../../../../packages/node-sdk/src/node-factory/define-reactive-node/hitl-config.ts)).
Nothing in the UI or on the server uses them. `kind: 'file'` is not the
attach control next to the textarea. This epic does not implement it.

## Goal

Langflower supports exactly the multimodal user-message parts that the
OpenAI Chat Completions protocol documents, and nothing beyond that.

Sources: [create chat completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/)
for user `content` parts, and
[file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
for the `file` part (PDF only).

Two ways the model receives a file. The person attaches an allowed file
in the composer and asks a question. Or they name a project file in the
text ("what is drawn in `1.png`"): the model calls `read`, and the
OpenAI node places that file on a following `role: user` message.
The same hoist carries an in-scope image, wav/mp3, or PDF.
Bytes go browser or disk → server → Chat Completions. The reply shows
in the feed as it does today. `read` today returns UTF-8 text
([read/tool.ts](../../../../packages/tools/src/builtins/read/tool.ts)),
so those bytes never reach the model.

## Scope

User-message parts this epic builds:

| MIME                                                 | Part                               |
| ---------------------------------------------------- | ---------------------------------- |
| `image/png`, `image/jpeg`, `image/gif`, `image/webp` | `image_url`                        |
| `audio/wav`                                          | `input_audio` with `format: 'wav'` |
| `audio/mpeg`, `audio/mp3`                            | `input_audio` with `format: 'mp3'` |
| `application/pdf`                                    | `file`                             |

Video and every other format are unsupported. The browser checks
`file.type` before upload. `<input accept>` is this list. A file with
another MIME, or an empty `file.type`, never enters the draft. The
extension does not stand in for an empty MIME. A rejected file is not
written to disk. The server repeats the same list on POST and does not
store a foreign MIME.

Text files, docx, spreadsheets, and source code are not turned into
message parts. Chat Completions does not define those as multimodal
parts.

## In scope

- Composer attach on the surfaces that become `role: user`: Chat Input,
  Chat Loop, and Steer.
- After a tool round that read an in-scope image, wav/mp3, or PDF, a
  following `role: user` message carries those parts. The `role: tool`
  message stays text.
- Staging bytes under the bound workflow session, then expanding
  `fileId` references into Chat Completions parts at request time.
- A user-bubble image for image MIME, via a same-origin GET. Audio and
  PDF show name and MIME, not a player.
- Session history stores references, not base64.
- Skeleton and demo-project graphs that wire Chat Input and Chat Loop
  move to the new ports.
- Docs listed under Mechanics, including the two REST routes named in
  [ADR-012](../../../adr/012-internal-websocket-bus-rest-for-bulk-escape-hatches.md).

## Out of scope

- Video, and any MIME outside the scope table.
- Inlining text or office files as a text part.
- Responses API, Gemini, and the OpenAI Files API (`file_id`).
- An asset gallery.
- `HitlFileControl` (`kind: 'file'`).
- A vision flag on the model catalog.
- Attachments on `ask_user`.
- Video, and any other extension, returned by `read` as bytes. Those
  files stay on the UTF-8 `read`.
- A migrator for graphs already saved in a project.
- A live provider run in CI.

## How other harnesses answer "what is in 1.png"

The question is a path in the text, not a composer attachment. The
model calls a read tool. What happens to the bytes depends on the
provider protocol.

- **Claude Code.** `Read` on an image returns a `tool_result` whose
  content is an `image` block (base64). Anthropic's Messages API allows
  `text` and `image` blocks inside `tool_result`
  ([handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)).
  The tool's own description says an image file is presented visually
  ([claude-code#35866](https://github.com/anthropics/claude-code/issues/35866)).
- **Codex CLI.** A separate `view_image` tool loads a local image by
  path and sends the pixels. A screenshot is taken with the shell, then
  opened with that tool
  ([harness notes](http://harnessnotes.com/image-input)).
- **Cursor.** `Read` includes `.png`, `.jpg`, `.gif`, `.webp`, and
  `.svg` for Cursor's own models
  ([Agent overview](https://cursor.com/docs/agent/overview)). A path
  typed as plain text is not an attachment. On a custom
  OpenAI-compatible endpoint, image bytes from `Read` do not arrive the
  way they do for built-in models; paste, drag, or `@image.png` does
  ([forum](https://forum.cursor.com/t/custom-api-models-cannot-read-local-image-file-paths-pasted-images-work/167497)).
  Some models receive a text caption instead of pixels.
- **OpenCode, on OpenAI-compatible chat.** `Read` can load the image,
  but Chat Completions accepts only text on `role: tool`. The fix
  extracts the image from the tool result and injects a synthetic
  `role: user` message with `image_url`
  ([opencode#11323](https://github.com/anomalyco/opencode/pull/11323)).
  LiteLLM does the same hoist: tool messages stay a contiguous run, and
  the images move to a user message after that run, so `tool_calls` and
  `role: tool` stay adjacent
  ([litellm#34462](https://github.com/BerriAI/litellm/pull/34462)).

This epic follows that last shape. Anthropic `tool_result` image
blocks and a Codex-style extra tool are not added. Langflower's only
chat call is Chat Completions.

## Mechanics

### Provider body

Only `POST /v1/chat/completions`. `toOpenAiMessages` reads bytes from
disk when it builds the body. A compatible base URL is not promised a
Files API or a Responses API, so those are not called.

- Image → `{ type: 'image_url', image_url: { url: 'data:<mime>;base64,…' } }`.
  Do not send `detail`.
- Audio → `{ type: 'input_audio', input_audio: { data, format } }`.
  `data` is raw base64, not a data URI. `format` is `wav` or `mp3`.
- PDF → `{ type: 'file', file: { filename, file_data: 'data:application/pdf;base64,…' } }`.

Part order on the user message: the question text, then files in attach
order.

Provider limits, from the file-inputs page: each file under 50 MB, and
the sum of files in one request at most 50 MB. `express.raw` on the
upload route uses that same per-file ceiling. Do not invent a smaller
cap.

A model without vision fails as a provider error, the same way other
provider errors surface today. Do not add a capability flag.

A missing file on disk is a turn error, not an omitted part.

### Browser gate

The file input `accept` is the scope MIME list. Drop anything else,
including an empty `file.type`, before the draft and before POST. The
server allowlist is the same check again, so a crafted POST cannot
store video or another type.

### Transport

Bytes do not ride the WebSocket
([ADR-012](../../../adr/012-internal-websocket-bus-rest-for-bulk-escape-hatches.md)).
Two localhost routes on the existing Express server
([ADR-006](../../../adr/006-express-ws-localhost-only-no-auth-stage-1.md)):
no auth, same bind. Name both routes in ADR-012 as bulk hatches. Do not
add a multipart dependency. The server has none today.

- `POST` one file as a raw body (`express.raw`). Name and MIME are
  headers. The response is the existing `HitlUploadedFile`.
- `GET` by `fileId` serves the bytes for an `<img>` in the feed.

Do not write base64 into the feed jsonl or into node state.

Disk path:
`.langflower/sessions/<workflowId>/<label>/uploads/<fileId>`.
The file name on disk is `fileId`, not the user's name. Writes stay
under `.langflower/`. Upload fails when no workflow session is bound,
because the bytes live next to that session.
**Reset session** deletes that uploads directory together with
`nodeStates` and points
([SESSIONS.md](../../../reference/SESSIONS.md)).
**Continue from…** does not delete the files: a point stores ids only.

### Graph wires

`RuntimeEditor` connects ports only when `wireType` matches. LLM
`userPrompt` and `feedback` stay `wireType: 'string'`. Review Gate and
string prompts keep using them. `String(object)` on those ports would
drop the attachment.

New wire type `user-turn`. Payload:

```ts
{
	readonly text: string;
	readonly files: readonly HitlUploadedFile[];
}
```

`files` may be empty.

- Chat Input `message` and Chat Loop `feedback` change their output
  from `string` to `user-turn`
  ([chat-input](../../../../packages/common-nodes/src/hitl/chat-input/node.ts),
  [chat-loop](../../../../packages/common-nodes/src/hitl/chat-loop/node.ts)).
- The LLM gains `userTurn` (turn 0) and `turnFeedback` (`multi: 'merge'`,
  later turns). String `userPrompt` and `feedback` stay. Merge the two
  turn streams with `merge`. Do not use `withLatestFrom`.
- A run that has both `userPrompt` and `userTurn` wired does not start.
  String `feedback` and `turnFeedback` are separate events. They do not
  need that exclusion.

Skeleton and demo-project workflows that wire Chat Input → `userPrompt`
and Chat Loop → `feedback` move those edges to `userTurn` and
`turnFeedback`. There is no migrator for a graph already saved in a
project. That edge stops validating until the operator rewires it.

Empty text is still rejected. A file without a question does not start
a turn.

### Steer

Steer is not a graph wire.
`SteerControlSteer` gains `files` next to `text`
([steer-control.ts](../../../../packages/node-sdk/src/node-factory/define-llm-node/steer-control.ts)).
The reducer appends a user message with content parts, not
`content: text` alone.

### Media after a tool call

Chat Completions cannot put `image_url`, `input_audio`, or `file` on
`role: tool`. The OpenAI node still sends those parts, on a following
`role: user` message. The part is the same one a composer attachment
of that MIME would build.

`read` of these extensions reads bytes, not UTF-8, and stages them
like a composer upload (`HitlUploadedFile`, same 50 MB ceiling):

| Extension       | Part                            |
| --------------- | ------------------------------- |
| `.png`          | `image_url` (`image/png`)       |
| `.jpg`, `.jpeg` | `image_url` (`image/jpeg`)      |
| `.gif`          | `image_url` (`image/gif`)       |
| `.webp`         | `image_url` (`image/webp`)      |
| `.wav`          | `input_audio` (`format: 'wav'`) |
| `.mp3`          | `input_audio` (`format: 'mp3'`) |
| `.pdf`          | `file` (`application/pdf`)      |

The string returned to the model is one text line: path, MIME, size.
It does not contain base64. Any other extension, including video,
stays on the current UTF-8 `read`.

`ToolHandler` stays `Promise<string>`
([tool-handle.ts](../../../../packages/node-sdk/src/node-factory/define-tool-registrations/tool-handle.ts)).
The staged ref rides beside the text on the loop fact
`tool.completed` (`result` stays the string;
[llm-loop-types.ts](../../../../packages/common-nodes/src/ai/features/llm-loop/llm-loop-types.ts)).
It is not a new return type on the author SDK.

Message order for that round, matching the LiteLLM hoist:

1. Assistant message with `tool_calls`.
2. Every `role: tool` message for that round, text only, still
   contiguous.
3. One following `role: user` if the round staged any file from the
   table above. Its content is those parts, in call order: `image_url`,
   `input_audio`, or `file`. No staged file means no extra user
   message.

That user message is not a composer turn and not `ask_user`. The feed
does not add a human bubble for it. The tool row keeps the text line.
An image on that row uses the same GET as a composer attachment.
Audio and PDF on that row show name and MIME, not a player. History
stores the `fileId` on that user message, same as an attached file.
Compaction names the file and does not resend the bytes.

### ask_user

`ask_user` has no attach control. A tool message accepts only a string
or text parts, and every MIME in scope is illegal there. The `ask_user`
composer does not insert an extra user message.
`RunnerAskUserReplyPayload` stays `{ text }`. Other tools still return
`Promise<string>`.

### History and the feed

Node state stores `fileId` references on the user turn, not bytes.
`readChatMessage` still accepts a legacy `content: string`, and also
accepts parts that cite `fileId`. `toOpenAiMessages` fills in the bytes
for the HTTP call. Until compaction runs, the next turn reads the bytes
from disk again.

Compaction stays a text summary. Text parts are included. A non-text
part becomes one line that names the file. The summary request does not
include the bytes.

The user bubble shows the question text and, for an image MIME, an
`<img>` whose `src` is the GET route. Audio and PDF show name and MIME,
without a player. Do not use the agent markdown bubble for the person's
attachment. Remote markdown images on `result` stay as they are.

### Docs when this lands

Narrow the non-goal "image / video asset management" in
[PRODUCT.md](../../../product/PRODUCT.md), the root
[README.md](../../../../README.md), and the helper skill
([SKILL.md](../../../../packages/server/skeleton/skills/langflower-helper/SKILL.md)).
This epic is not an asset library. Turn attachments are their own
use-case, written from the use-case template. Update
[hitl-chat.md](../../../product/features/hitl-chat.md) and
[feed-panel.md](../../../product/features/feed-panel.md).
Run `node build/tools/agent-run.mjs docs-gen` after the docs change.
Do not hand-edit generated indexes. Sync the dogfood helper copy when
the skeleton skill changes.

## Acceptance criteria

1. In the Chat Input or Chat Loop composer the person attaches an
   image, types a question, and presses Start or Send. The file is
   under that session's uploads directory. The chat-completions user
   message contains an `image_url` data URI. Saved history stores
   `fileId` and does not store base64. The model reply appears in the
   feed as it does today. The user bubble shows the image from GET.
2. A PDF becomes a `file` part. wav / mp3 becomes `input_audio`. A
   picker file whose MIME is outside the scope table (video, text,
   docx, or an empty `file.type`) is not added to the draft and is not
   uploaded.
3. Steer with an image produces the same user content parts. `ask_user`
   has no attach control, and its reply is still one string.
4. Reset session deletes that session's uploads. Continue from… leaves
   the files in place, and the next turn reads the bytes again.
5. A graph with a string `userPrompt` and no `userTurn` behaves as it
   does today. A graph with both wired does not start.
6. A fixture `read` of `1.png`, a `.wav` or `.mp3`, and a `.pdf` (or
   the same staged files on `tool.completed`) yields `role: tool`
   messages whose text has no data URI, then one `role: user` message
   with `image_url`, `input_audio`, and `file` parts in call order.
   Saved history stores `fileId`, not base64. A text `read` in the same
   round adds no part. A video `read` stays UTF-8 text and adds no
   user message.

## Proof

Default `verify` does not call a cloud model and does not drive a
browser
([TESTING.md](../../../guides/TESTING.md#live-openai-compatible--mcp-tool-calling),
[What we do not test](../../../guides/TESTING.md#what-we-do-not-test-yet)).
Do not add a `LANGFLOWER_LIVE_LLM` suite. The automated stand-in is
unit tests plus the WebSocket harness under `tests/integration/ws/`.
A scripted chat-completion factory records the outbound `messages`.
That is the end-to-end check this repo has. A browser pass is the
maintainer's.

### Automated

The suite proves the bytes, the JSON, and the feed projection. It does
not prove that a model describes the picture.

- Staged png, jpeg, gif, and webp become `image_url` data URIs. wav
  and mp3 become `input_audio`. A pdf becomes a `file` part. History
  JSON stores `fileId` and does not store base64. A missing file is a
  turn error. A file at or over 50 MB is refused. A request whose
  staged files sum past 50 MB is refused.
- `POST` stores only an allowlisted MIME and returns
  `HitlUploadedFile`. A foreign MIME is not written. `GET` returns
  those bytes. Reset session deletes that session's uploads directory.
  Continue from… leaves the files, and the next body reads them again.
- A `user-turn` from Chat Input or Chat Loop reaches `userTurn` or
  `turnFeedback`. A string `userPrompt` with no `userTurn` still runs.
  Both wired does not start. Empty text does not start a turn.
- Steer `{ kind: 'steer', text, files }` becomes user content parts.
  The `ask_user` composer has no file control, and its reply is one
  string.
- One scripted round reads `1.png`, a wav or mp3, and a pdf. Each
  `role: tool` text has no data URI. One following `role: user` has
  `image_url`, `input_audio`, and `file` in that order. A text read in
  the same round adds no part. A video read stays UTF-8 and adds no
  user message.
- The feed fold puts an image URL on the user bubble and on the tool
  row, and name plus MIME for audio and PDF. The hoist does not add a
  human bubble.

### Maintainer, by hand

Needs a browser and an OpenAI-compatible model that accepts the part
under test. Record the provider and the model. Not part of `verify`.

- Chat Input: attach a png, ask what is in it, Start. The bubble shows
  that image. The reply describes that picture, not a guess from the
  file name.
- The same attach on Chat Loop, and on Steer after Pause.
- The picker does not take a video, a txt, or a file whose `file.type`
  is empty.
- With `read` wired, ask what is drawn in `1.png` on disk. The model
  calls `read`. The tool row shows the image and no second human
  bubble. The reply describes the picture.
- The same question for a wav or mp3 on a model that accepts
  `input_audio`, and for a pdf on a model that accepts `file` parts.
- A text-only model fails with the provider error. It does not hang
  and it does not answer as if it saw the file.
- Reset session removes the staged files from disk and from the bubble.
  Continue from… still shows the image, and the next turn sends it
  again.

## Verify

- Intermediate: package tests for common-nodes, server, and ui, and
  `verify --quick`, while iterating.
- **Close-out (required):** `npm run format`, then `npm run typecheck`
  and `npm run test` (or full `verify`). Do not mark done on
  `verify --quick` or on tests without typecheck.
