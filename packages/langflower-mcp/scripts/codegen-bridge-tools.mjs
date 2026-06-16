#!/usr/bin/env node
/**
 * Parse langflower-bus-config.ts → generated/bridge-tool-meta.ts
 * (JSDoc descriptions + JSON Schema stubs keyed by intent).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../..');
const BUS_CONFIG = path.join(
	REPO_ROOT,
	'packages/shared/src/langflower-bus-config.ts',
);
const OUT_FILE = path.join(PKG_ROOT, 'src/generated/bridge-tool-meta.ts');

/** @type {Record<string, object>} */
const NAMED_SCHEMAS = {
	WorkflowLoadPayload: {
		type: 'object',
		properties: { workflowId: { type: 'string' } },
		required: ['workflowId'],
		additionalProperties: false,
	},
	WorkflowDeletePayload: {
		type: 'object',
		properties: { workflowId: { type: 'string' } },
		required: ['workflowId'],
		additionalProperties: false,
	},
	WorkflowCreatePayload: {
		type: 'object',
		properties: {
			name: { type: 'string' },
			id: { type: 'string' },
		},
		additionalProperties: false,
	},
	WorkflowCopyPayload: {
		type: 'object',
		properties: { workflowId: { type: 'string' } },
		required: ['workflowId'],
		additionalProperties: false,
	},
	WorkflowRenameCurrentPayload: {
		type: 'object',
		properties: { name: { type: 'string' } },
		required: ['name'],
		additionalProperties: false,
	},
	WorkflowSaveCurrentPayload: {
		type: 'object',
		additionalProperties: false,
	},
	RunnerPermissionReplyPayload: {
		type: 'object',
		properties: {
			runId: { type: 'string' },
			askId: { type: 'string' },
			decision: { type: 'string', enum: ['allow', 'deny'] },
		},
		required: ['runId', 'askId', 'decision'],
		additionalProperties: false,
	},
	RunnerResumeRequestedPayload: {
		type: 'object',
		properties: { runId: { type: 'string' } },
		required: ['runId'],
		additionalProperties: false,
	},
	RunnerCheckpointDiscardRequestedPayload: {
		type: 'object',
		properties: { runId: { type: 'string' } },
		required: ['runId'],
		additionalProperties: false,
	},
};

const emptyObjectSchema = {
	type: 'object',
	additionalProperties: false,
};

const objectSchemaForType = (typeExpr) => {
	const trimmed = typeExpr.replace(/\s+/g, ' ').trim();

	if (
		trimmed === '{}' ||
		trimmed === 'Record<string, never>' ||
		trimmed.startsWith('Record<string, never>')
	) {
		return emptyObjectSchema;
	}

	const named = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)$/);
	if (named !== null && NAMED_SCHEMAS[named[1]] !== undefined) {
		return NAMED_SCHEMAS[named[1]];
	}

	if (trimmed.includes('interrupt')) {
		return {
			type: 'string',
			description: `TypeScript payload: ${trimmed}`,
		};
	}

	if (
		trimmed.includes("['start']") ||
		trimmed.includes("['startNode']") ||
		trimmed.includes('startNode')
	) {
		return {
			type: 'array',
			description: `TypeScript payload: ${trimmed}`,
			items: {},
		};
	}

	return {
		type: 'object',
		description: `TypeScript payload: ${trimmed}`,
		additionalProperties: true,
	};
};

const jsdocToDescription = (raw) => {
	const lines = raw
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*\*\s?/, '')
				.replace(/^\s*\/\*\*\s?/, '')
				.replace(/\s*\*\/\s*$/, '')
				.trim(),
		)
		.filter(
			(line) =>
				line.length > 0 &&
				!line.startsWith('@') &&
				!line.startsWith('{@'),
		);

	return lines.join(' ').replace(/\s+/g, ' ').trim();
};

/**
 * Extract balanced `<...>` type argument after `message`.
 * @param {string} source
 * @param {number} messageIndex index of "message"
 */
const extractMessageTypeArg = (source, messageIndex) => {
	const open = source.indexOf('<', messageIndex);
	if (open === -1) {
		return null;
	}

	let depth = 0;
	for (let i = open; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === '<') {
			depth += 1;
		} else if (ch === '>') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(open + 1, i);
			}
		}
	}

	return null;
};

const source = fs.readFileSync(BUS_CONFIG, 'utf8');

/** @type {Record<string, { description: string; typeExpr: string; inputSchema: object }>} */
const meta = {};

const keyRe = /'([^']+)':\s*(?:\n\s*)?message</g;
let keyMatch;
while ((keyMatch = keyRe.exec(source)) !== null) {
	const intent = keyMatch[1];
	const messageIndex = source.indexOf('message', keyMatch.index);
	const typeExpr = extractMessageTypeArg(source, messageIndex);

	if (typeExpr === null) {
		console.error(`codegen-bridge-tools: failed type parse for ${intent}`);
		process.exit(1);
	}

	const before = source.slice(0, keyMatch.index);
	const lastJsdocStart = before.lastIndexOf('/**');
	let description = intent;
	if (lastJsdocStart !== -1) {
		const trailing = before.slice(lastJsdocStart);
		const jsdocMatch = trailing.match(/^\/\*\*([\s\S]*?)\*\//);
		if (jsdocMatch !== null) {
			const between = before.slice(lastJsdocStart + jsdocMatch[0].length);
			// Only accept JSDoc that is immediately above the key (whitespace only).
			if (between.trim().length === 0) {
				description = jsdocToDescription(jsdocMatch[1]) || intent;
			}
		}
	}

	meta[intent] = {
		description: description || intent,
		typeExpr: typeExpr.replace(/\s+/g, ' ').trim(),
		inputSchema: objectSchemaForType(typeExpr),
	};
}

if (Object.keys(meta).length === 0) {
	console.error('codegen-bridge-tools: no message<> entries parsed');
	process.exit(1);
}

const serialized = JSON.stringify(meta, null, '\t');
const out = `/* AUTO-GENERATED by scripts/codegen-bridge-tools.mjs — do not edit */
export type BridgeToolMetaEntry = {
	readonly description: string;
	readonly typeExpr: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
};

export const BRIDGE_TOOL_META = ${serialized} as const satisfies Readonly<
	Record<string, BridgeToolMetaEntry>
>;
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, out, 'utf8');
console.log(
	`codegen-bridge-tools: wrote ${Object.keys(meta).length} intents → ${path.relative(REPO_ROOT, OUT_FILE)}`,
);
