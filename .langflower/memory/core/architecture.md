# Architecture

## Monorepo Structure

Langflower is organized as a monorepo to facilitate shared logic between the core engine, UI components, and various specialized modules. This structure allows for easy scaling of features while maintaining consistency across the project.

## Reactive Ports System

The heart of Langflower's reactivity is the **Reactive Ports** system.

- **Ports**: Input/Output points on a node that can emit or receive data.
- **Streams**: Data flows through ports as continuous streams, allowing for asynchronous and parallel processing.
- **Reactivity**: Changes in one port automatically propagate downstream, minimizing manual state updates and maximizing flow fluidity.
