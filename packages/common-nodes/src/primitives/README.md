# Primitive nodes

Scalar constants and JSON helpers for shaping structured data in a workflow.

| File                     | Type id                 | Role                                   |
| ------------------------ | ----------------------- | -------------------------------------- |
| `string/node.ts`         | `common-string`         | Emits a configured string literal      |
| `number/node.ts`         | `common-number`         | Emits a configured number literal      |
| `boolean/node.ts`        | `common-boolean`        | Emits a configured boolean literal     |
| `json-parse/node.ts`     | `common-json-parse`     | Parses JSON text into an object value  |
| `json-stringify/node.ts` | `common-json-stringify` | Serializes a value to JSON text        |
| `set-fields/node.ts`     | `common-set-fields`     | Shallow-merge field map onto an object |
| `passthrough/node.ts`    | `common-passthrough`    | Passes value through unchanged         |
