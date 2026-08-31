/**
 * Substring `{lf_secrets:ID}` / `{env:VAR}` resolve. Secret bag is injected
 * (server reads the file). Does not import server or shared.
 *
 * MCP HTTP header values call this at connect (epic 45 slice D).
 */

import { SECRET_ID_BODY } from './secret-id.js';

export type InterpolatePlaceholdersResult =
	| { readonly ok: true; readonly value: string }
	| { readonly ok: false; readonly message: string };

export type InterpolatePlaceholdersDeps = {
	readonly secrets: Readonly<Record<string, string>>;
	readonly env?: Readonly<Record<string, string | undefined>>;
};

const placeholderRe = (): RegExp =>
	new RegExp(`\\{(lf_secrets|env):(${SECRET_ID_BODY})\\}`, 'g');

/**
 * Replace well-formed placeholders in `input`. Missing or empty secret/env
 * fails loud. Replacement text is not scanned again. Error messages include
 * the id / var name, never the resolved value.
 */
export const interpolatePlaceholders = (
	input: string,
	deps: InterpolatePlaceholdersDeps,
): InterpolatePlaceholdersResult => {
	const env = deps.env ?? process.env;
	const parts: string[] = [];
	let lastIndex = 0;

	for (const match of input.matchAll(placeholderRe())) {
		const full = match[0];
		const kind = match[1];
		const id = match[2];
		const index = match.index;

		if (kind === undefined || id === undefined || index === undefined) {
			continue;
		}

		parts.push(input.slice(lastIndex, index));

		if (kind === 'lf_secrets') {
			const resolved = deps.secrets[id];
			if (resolved === undefined || resolved === '') {
				return {
					ok: false,
					message: `Secret ${id} is not set`,
				};
			}

			parts.push(resolved);
		} else {
			const resolved = env[id];
			if (resolved === undefined || resolved === '') {
				return {
					ok: false,
					message: `Environment variable ${id} is not set`,
				};
			}

			parts.push(resolved);
		}

		lastIndex = index + full.length;
	}

	parts.push(input.slice(lastIndex));
	return { ok: true, value: parts.join('') };
};
