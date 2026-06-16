## Product Purpose

Langflower is a local, project-scoped coding agent that provides a visual workflow graph for developers. It serves as a "hard harness" where the execution order is defined by an explicit graph rather than just the LLM's next-step choice. It aims to make complex multi-stage pipelines (like clarify $\rightarrow$ red team $\rightarrow$ coder $\rightarrow$ QA) visible and manageable on a canvas.

## Core Differentiators

- **Hard Harness vs. Chat Harness:** Unlike pure chat agents, Langflower emphasizes explicit graph topology for execution.
- **Easy Bootstrap:** Designed to be dropped into existing code repos with minimal configuration.
- **Visual Workflow Editor:** Provides immediate visual feedback on the agent's reasoning and progress.

## Primary User

Developers who want to manage complex coding tasks by defining clear, modular steps that can be visualized and iterated upon.

## Current Status

Moving toward "Implementable" for the full multi-loop coding-agent pipeline (Plan $\rightarrow$ Coder pilot).

## Key Features

- **Visual Editor:** Interactive canvas for workflow design.
- **Node Library:** Modular building blocks (AI nodes, Crawl nodes, etc.).
- **HITL Chat:** Human-in-the-loop interaction points within the graph.
- **Project Configuration:** Everything is scoped to a `.langflower/` directory.
