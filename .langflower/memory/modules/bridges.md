# Bridges

## Overview

Bridges in Langflower connect different systems or data flows, primarily acting as connectors between the core engine and external entities (like tools via MCP) or internal components (via WebSockets).

## MCP Bridge (`langflower-mcp`)

Connects the **Langflower engine** to the **Model Context Protocol (MCP)** ecosystem. It allows Langflower nodes to interact with external tools, data sources, and prompts in a standardized way.

- **Key Mechanism:** `createBridgeSession` initializes the connection and manages the lifecycle of the session.
- **Features:**
    - **Event Caching:** Stores snapshots (like `runner.snapshot`) so data can be retrieved instantly without re-querying the server.
    - **Sequence Tracking:** Uses an `eventSeq` to track the order of events, allowing for "wait" logic.
    - **Live Feed Tail:** Provides a way to see the most recent frames of execution without loading the entire history.

## WebSocket Bridge (`@langflower/websocket-bridge`)

A lower-level transport bridge that provides the foundational communication layer for almost all real-time data in the project.

- **Key Mechanism:** It abstracts raw WebSockets into **reactive streams** (using RxJS).
- **Role:** It handles the "plumbing" of moving data between the server and clients, providing status updates (`status$`) and handling asynchronous message flows.

## Summary Table

| Bridge Type    | Package                        | Primary Role                                                    | Key Mechanism                                       |
| :------------- | :----------------------------- | :-------------------------------------------------------------- | :-------------------------------------------------- |
| **MCP Bridge** | `@langflower/mcp`              | Connects Langflower to external tools via MCP protocol.         | `createBridgeSession`, Event Caching, Seq Tracking. |
| **WS Bridge**  | `@langflower/websocket-bridge` | The underlying transport layer for all real-time communication. | Reactive WS Client, Status Streams.                 |
