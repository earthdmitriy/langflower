import { describe, expect, it } from 'vitest';
import { normalizeLlmRecoveryPolicy } from './normalize-llm-recovery-policy.js';
import { DEFAULT_LLM_RECOVERY_POLICY } from './llm-loop-types.js';

describe('normalizeLlmRecoveryPolicy', () => {
	it('defaults autokick and dead-loop detection on', () => {
		const policy = normalizeLlmRecoveryPolicy({});

		expect(policy.autokickOnIdle).toBe(true);
		expect(policy.deadLoopEnabled).toBe(true);
		expect(policy.maxAutokickAttempts).toBe(0);
		expect(policy.autokickBackoffMs).toBe(
			DEFAULT_LLM_RECOVERY_POLICY.autokickBackoffMs,
		);
		expect(policy.deadLoop.maxWindowTokens).toBe(1_000);
		expect(policy.subagentTimeoutMs).toBe(0);
	});

	it('keeps 0 maxAutokickAttempts as unlimited', () => {
		expect(
			normalizeLlmRecoveryPolicy({ maxAutokickAttempts: 0 })
				.maxAutokickAttempts,
		).toBe(0);
	});

	it('keeps 0 subagentTimeoutMs as unlimited', () => {
		expect(
			normalizeLlmRecoveryPolicy({ subagentTimeoutMs: 0 })
				.subagentTimeoutMs,
		).toBe(0);
	});

	it('clamps the dead-loop window to 10–8000', () => {
		expect(
			normalizeLlmRecoveryPolicy({ deadLoopMaxWindowTokens: 5 }).deadLoop
				.maxWindowTokens,
		).toBe(10);
		expect(
			normalizeLlmRecoveryPolicy({ deadLoopMaxWindowTokens: 9_000 })
				.deadLoop.maxWindowTokens,
		).toBe(8_000);
	});
});
