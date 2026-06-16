# Split workflow

One constant output fans out to two parallel delay branches.

```mermaid
flowchart LR
	src["src<br/>(constant)<br/>out: value"]
	d1["d1<br/>(delay)<br/>in: value → out: value"]
	d2["d2<br/>(delay)<br/>in: value → out: value"]

	src -->|"value → value"| d1
	src -->|"value → value"| d2
```

Scenario: [`split.workflow.test.ts`](./split.workflow.test.ts)
