# Using the editor

## Open a project

Start Langflower with your folder (see [Getting started](getting-started.md)).
The toolbar shows which project directory is active. Switching projects means
restarting the CLI with a different path.

## Canvas and workflows

- Pick a workflow from the project’s list, or create one.
- Nodes are steps (agents, tools, review, logic). Edges define order and data
  flow.
- Open a node to edit its settings in the inspector.

Built-in nodes appear in the node library. You can also add custom packs under
`.langflower/nodes/` — see [Extending](extending.md).

## Run a workflow

1. Start a run from the editor.
2. Watch progress on the canvas and in the feed (timeline of steps, messages,
   and file activity).
3. When a step asks for a human decision, answer in the feed / composer
   (approve, reject, or send feedback).
4. When the run finishes, find outputs in the same project folder.

You can stop or pause a run from the UI when you need to redirect the work.

## Human review

Review is a normal part of the graph, not a special “interrupt mode.” If a
workflow includes approval, fact check, or rewrite stages, the run waits for
you and continues when you reply.

Sensitive file edits or shell commands can also ask permission before they
run — configure the floor in project settings
([Configuration](configuration.md)).

## Close the browser and come back

The **server** owns the active session. Closing the browser tab does not cancel
a long-running job. Reopen the same UI URL while the CLI process is still
running; the editor reconnects to current progress.

When you stop the CLI process (Ctrl+C), that session ends.

## Tips

- Keep one Langflower process per project (or use different ports).
- Prefer small, reusable workflows you can apply to similar folders.
- Put durable instructions in skills under `.langflower/skills/` rather than
  only in chat — see [Extending](extending.md).
