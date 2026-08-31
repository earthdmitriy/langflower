import { describe, expect, it } from 'vitest';
import {
	BRIDGE_LOG_REDACTED,
	LANGFLOWER_SECRETS_SAVE_REQUESTED,
	payloadForBridgeEventLog,
	redactSecretBearingKeys,
} from './redact-secret-bearing-keys.js';

describe('redactSecretBearingKeys', () => {
	it('redacts provider api keys without touching token fields', () => {
		expect(
			redactSecretBearingKeys({
				scope: 'global',
				providerApiKeys: { openai: 'sk-live' },
				apiKey: 'sk-direct',
				secretValues: { API_TOKEN: 'tok-secret' },
				nested: { token: 'abc', tokenDelayMs: 40 },
			}),
		).toEqual({
			scope: 'global',
			providerApiKeys: BRIDGE_LOG_REDACTED,
			apiKey: BRIDGE_LOG_REDACTED,
			secretValues: { API_TOKEN: 'tok-secret' },
			nested: { token: 'abc', tokenDelayMs: 40 },
		});
	});
});

describe('payloadForBridgeEventLog', () => {
	it('replaces secrets save payload with REDACTED', () => {
		expect(
			payloadForBridgeEventLog(LANGFLOWER_SECRETS_SAVE_REQUESTED, {
				secretIds: ['API_TOKEN'],
				secretValues: { API_TOKEN: 'sk-live-secret' },
			}),
		).toBe(BRIDGE_LOG_REDACTED);
	});

	it('leaves ordinary token fields on other events', () => {
		expect(
			payloadForBridgeEventLog('workflow.current.snapshot', {
				token: 'broadcast-payload',
			}),
		).toEqual({ token: 'broadcast-payload' });
	});

	it('redacts providerApiKeys on config save', () => {
		expect(
			payloadForBridgeEventLog('langflower.config.save.requested', {
				scope: 'global',
				providerApiKeys: { openai: 'sk-openai' },
				token: 'keep-me',
			}),
		).toEqual({
			scope: 'global',
			providerApiKeys: BRIDGE_LOG_REDACTED,
			token: 'keep-me',
		});
	});
});
