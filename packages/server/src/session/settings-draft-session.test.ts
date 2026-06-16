import { describe, expect, it } from 'vitest';
import { configToDraft } from '@langflower/shared/langflower.js';
import {
	applyDraftPatch,
	buildDraftSnapshot,
	idleConnectionsForDraft,
	seedScopeDraft,
} from './settings-draft-session.js';

describe('settings-draft-session', () => {
	it('seeds baseline and checking connections when Base URL is present', () => {
		const seeded = seedScopeDraft({
			provider: {
				lm: {
					name: 'LM',
					models: ['a'],
					options: { baseURL: 'http://127.0.0.1:1234/v1' },
					hasApiKey: true,
				},
			},
		});

		expect(seeded.draft.providers).toHaveLength(1);
		expect(seeded.connections['0']).toEqual({ state: 'checking' });
		expect(buildDraftSnapshot('project', seeded).dirty).toBe(false);
		expect(
			buildDraftSnapshot('project', seeded).draft.providers[0]?.apiKey,
		).toBe('');
	});

	it('seeds idle connections when Base URL is empty', () => {
		const seeded = seedScopeDraft({
			provider: {
				lm: { name: 'LM', models: ['a'] },
			},
		});

		expect(seeded.connections['0']).toEqual({ state: 'idle' });
	});

	it('marks dirty when a pending apiKey is set', () => {
		const baseline = configToDraft({});
		const state = {
			draft: {
				...baseline,
				providers: [
					{
						id: 'p',
						name: 'P',
						baseURL: '',
						modelsText: '',
						apiKey: 'sk-test',
						hasApiKey: false,
					},
				],
			},
			baseline,
			connections: idleConnectionsForDraft(baseline),
		};

		expect(buildDraftSnapshot('global', state).dirty).toBe(true);
		expect(
			buildDraftSnapshot('global', state).draft.providers[0]?.apiKey,
		).toBe('');
	});

	it('probes when baseURL or apiKey changes', () => {
		const previous = seedScopeDraft({
			provider: {
				p: {
					name: 'P',
					options: { baseURL: 'http://old/v1' },
				},
			},
		});

		const patched = applyDraftPatch(previous, {
			...previous.draft,
			providers: [
				{
					...previous.draft.providers[0]!,
					baseURL: 'http://new/v1',
				},
			],
		});

		expect(patched.probeIndexes).toEqual([0]);
		expect(patched.next.connections['0']).toEqual({ state: 'checking' });
	});

	it('keeps pending apiKey when patch sends empty key', () => {
		const previous = {
			...seedScopeDraft({}),
			draft: {
				...configToDraft({}),
				providers: [
					{
						id: 'p',
						name: 'P',
						baseURL: 'http://x/v1',
						modelsText: '',
						apiKey: 'pending',
						hasApiKey: false,
					},
				],
			},
		};

		const patched = applyDraftPatch(previous, {
			...previous.draft,
			providers: [
				{
					...previous.draft.providers[0]!,
					apiKey: '',
					name: 'Renamed',
				},
			],
		});

		expect(patched.next.draft.providers[0]?.apiKey).toBe('pending');
		expect(patched.next.draft.providers[0]?.name).toBe('Renamed');
	});
});
