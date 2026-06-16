# Epic 15 — Multi-role HITL identity

**Status:** landed then **removed** (retrospect)  
**Depends on:** multi-gate HITL authorable today  
**Index:** [README.md](README.md)

## Retrospective

This epic shipped a Stage-1 **persona / `requiredRole` identity layer**
(composer Persona switcher, `personaId` on `runner.hitl.event`,
`runner.hitl.rejected` on mismatch). That layer was unnecessary: the reactive
runtime already supports multiple concurrent HITL awaits, and the composer
already lists one tab per open gate.

**Kept product value:** multi-gate clearance — distinct HITL nodes in the graph
and one composer tab per open gate (see
[hitl-chat](../../features/hitl-chat.md) § Multi-gate HITL). No separate
multi-role-approval use case (persona / SSO framing retired with this epic).

**Removed:** persona hats, `params.requiredRole`, persona protocol, and the
wrong-persona reject path. Role separation = graph structure, not identity
simulation. Multi-user SSO remains out of scope (ADR-006 localhost / no auth).

## Original goal (historical)

Distinct human roles (security / product / legal) route to the right approval
gates — not only parallel anonymous Ask User tabs.

## Originally landed (then deleted)

1. Local persona simulation (Security / Product / Legal) in the composer.
2. HITL gates took panel param `requiredRole`.
3. Composer filtered tabs by active persona and sent `personaId`.
4. Server rejected wrong-persona replies with `runner.hitl.rejected`.
5. Demo + CI for the reject path.

## Acceptance criteria (superseded)

1. ~~Wrong persona cannot clear another role's gate~~ — not a product bar;
   multi-gate HITL does not need identity hats.
2. Multi-gate clearance documented on hitl-chat (not a persona / SSO use case).
