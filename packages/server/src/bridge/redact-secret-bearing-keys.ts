export const BRIDGE_LOG_REDACTED = 'REDACTED';

export const LANGFLOWER_SECRETS_SAVE_REQUESTED =
	'langflower.secrets.save.requested';

const PROVIDER_SECRET_KEYS = new Set(['apikey', 'providerapikeys']);

/**
 * Recursively replace values under `apiKey` / `providerApiKeys`.
 * Used for JSONL of `langflower.config.save.requested` (and any other
 * frame that still carries those keys). Does not match `token`.
 */
export const redactSecretBearingKeys = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map((entry) => redactSecretBearingKeys(entry));
	}

	if (value === null || typeof value !== 'object') {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			PROVIDER_SECRET_KEYS.has(key.toLowerCase())
				? BRIDGE_LOG_REDACTED
				: redactSecretBearingKeys(entry),
		]),
	);
};

/**
 * JSONL payload for one bus frame. Secrets save is replaced wholesale so
 * the log shows a deliberate redact, not an empty object.
 */
export const payloadForBridgeEventLog = (
	busType: string,
	payload: unknown,
): unknown => {
	if (busType === LANGFLOWER_SECRETS_SAVE_REQUESTED) {
		return BRIDGE_LOG_REDACTED;
	}

	return redactSecretBearingKeys(payload);
};
