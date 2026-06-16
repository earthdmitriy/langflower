/**
 * Resolve OpenAI-compatible credentials for a Settings draft row probe.
 * Prefer pending draft apiKey; else fall back to the saved layer provider.
 */
import type {
	LangflowerConfig,
	ProviderDraft,
} from '@langflower/shared/langflower.js';
import { resolveProviderCredentials } from './resolve-provider-credentials.js';

type ResolvedCredentials = {
	readonly apiKey?: string;
	readonly baseURL?: string;
};

export type ResolveDraftProviderCredentialsResult =
	| { readonly ok: true; readonly credentials: ResolvedCredentials }
	| { readonly ok: false; readonly message: string };

const ENV_REF_PATTERN = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

const resolveEnvRef = (
	value: string,
	context: string,
):
	| { readonly ok: true; readonly value: string }
	| { readonly ok: false; readonly message: string } => {
	const match = ENV_REF_PATTERN.exec(value);
	if (match === null) {
		return { ok: true, value };
	}

	const varName = match[1]!;
	const resolved = process.env[varName];

	if (resolved === undefined || resolved === '') {
		return {
			ok: false,
			message: `Environment variable ${varName} is not set (${context})`,
		};
	}

	return { ok: true, value: resolved };
};

export const resolveDraftProviderCredentials = (
	row: ProviderDraft,
	savedLayer: LangflowerConfig,
): ResolveDraftProviderCredentialsResult => {
	const baseURL = row.baseURL.trim();
	if (baseURL.length === 0) {
		return {
			ok: false,
			message: 'Base URL is empty',
		};
	}

	const context = `draft provider ${row.id.trim() || '(new)'}`;
	const pendingKey = row.apiKey.trim();

	if (pendingKey.length > 0) {
		const resolved = resolveEnvRef(pendingKey, context);
		if (!resolved.ok) {
			return resolved;
		}
		return {
			ok: true,
			credentials: {
				apiKey: resolved.value,
				baseURL,
			},
		};
	}

	const providerId = row.id.trim();
	if (
		providerId.length > 0 &&
		savedLayer.provider?.[providerId] !== undefined
	) {
		const fromSaved = resolveProviderCredentials(savedLayer, providerId);
		if (!fromSaved.ok) {
			return fromSaved;
		}
		return {
			ok: true,
			credentials: {
				...fromSaved.credentials,
				baseURL,
			},
		};
	}

	return {
		ok: true,
		credentials: { baseURL },
	};
};
