omit meanless entries from bridge protocol

{"schemaVersion":1,"timestamp":"2026-08-06T09:31:05.623Z","kind":"frame","direction":"outbound","scope":"broadcast","type":"runner.output-emitted","payload":{"kind":"output-emitted","runId":"63f4c017-1b32-44ee-aa2d-eff19e6e33c2",

schemaVersion - useless
"kind":"frame" - omit for 'frame' - consider as default value
"direction":"outbound" - use 'dir': 'in/out'
"scope":"broadcast" - useless?
"runId" - no sense, no parallel runs
