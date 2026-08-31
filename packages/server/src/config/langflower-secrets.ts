import { isValidSecretId } from '@langflower/shared/langflower.js';

export const LANGFLOWER_SECRETS_FILENAME = 'langflower.secrets.json';

export type LangflowerSecretsMap = Readonly<Record<string, string>>;

export type LangflowerSecretsWrite = {
	readonly secretIds?: readonly string[];
	readonly secretValues?: Readonly<Record<string, string>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const trimmedSecretValue = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Parse a secrets file body into a valid id → non-empty string map.
 * Invalid ids and non-string / empty values are dropped.
 */
export const parseLangflowerSecrets = (raw: unknown): LangflowerSecretsMap => {
	if (!isRecord(raw)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(raw).flatMap(([id, value]) => {
			if (!isValidSecretId(id)) {
				return [];
			}

			const secret = trimmedSecretValue(value);
			return secret === undefined ? [] : [[id, secret]];
		}),
	);
};

export const serializeLangflowerSecrets = (
	secrets: LangflowerSecretsMap,
): string => `${JSON.stringify(secrets, null, '\t')}\n`;

/**
 * Apply a Settings secrets patch.
 * `undefined` means the caller must not write the file.
 */
export const mergeLangflowerSecrets = (
	existing: LangflowerSecretsMap,
	patch: LangflowerSecretsWrite,
): LangflowerSecretsMap | undefined => {
	if (patch.secretIds === undefined && patch.secretValues === undefined) {
		return undefined;
	}

	if (patch.secretIds === undefined) {
		const next: Record<string, string> = { ...existing };

		for (const [id, value] of Object.entries(patch.secretValues ?? {})) {
			if (!isValidSecretId(id)) {
				continue;
			}

			const secret = trimmedSecretValue(value);
			if (secret !== undefined) {
				next[id] = secret;
			}
		}

		return next;
	}

	const next: Record<string, string> = {};

	for (const rawId of patch.secretIds) {
		const id = rawId.trim();

		if (!isValidSecretId(id)) {
			continue;
		}

		const incoming = trimmedSecretValue(patch.secretValues?.[id]);
		if (incoming !== undefined) {
			next[id] = incoming;
			continue;
		}

		const kept = existing[id];
		if (kept !== undefined) {
			next[id] = kept;
		}
	}

	return next;
};
