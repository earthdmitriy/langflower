import { describe, expect, it } from 'vitest';
import { createFakeSkillCaseRunner } from './create-fake-skill-case-runner.js';

const TRIAGE_SKILL = `# Triage skill (eval fixture)

When asked for the greeting token, answer exactly: \`HELLO_OK\`.

When asked for the farewell token, answer exactly: \`BYE_OK\`.

Do not add punctuation or extra words.
`;

const packStub = {
	id: 'golden-sample',
	threshold: 1,
	scorer: 'exact' as const,
	cases: [],
};

describe('createFakeSkillCaseRunner', () => {
	const runCase = createFakeSkillCaseRunner();

	it('returns greeting token from skill for greet-style input', async () => {
		const actual = await runCase({
			pack: packStub,
			case: {
				id: 'greet',
				input: 'Say the greeting token from the skill.',
				expected: 'HELLO_OK',
			},
			skillMarkdown: TRIAGE_SKILL,
			projectRoot: '.',
			harness: null,
		});
		expect(actual).toBe('HELLO_OK');
	});

	it('returns farewell token from skill for farewell-style input', async () => {
		const actual = await runCase({
			pack: packStub,
			case: {
				id: 'farewell',
				input: 'Say the farewell token from the skill.',
				expected: 'BYE_OK',
			},
			skillMarkdown: TRIAGE_SKILL,
			projectRoot: '.',
			harness: null,
		});
		expect(actual).toBe('BYE_OK');
	});

	it('fails closed when skill markdown is missing', async () => {
		await expect(
			runCase({
				pack: packStub,
				case: {
					id: 'greet',
					input: 'Say the greeting token from the skill.',
					expected: 'HELLO_OK',
				},
				skillMarkdown: null,
				projectRoot: '.',
				harness: null,
			}),
		).rejects.toThrow(/skillPath markdown/);
	});
});
