import { describe, expect, it } from 'vitest';
import { Observable } from 'rxjs';
import type { LangflowerSession } from '../session/langflower-session.js';
import { refreshLiveWiredToolPacks } from './get-live-wired-tools.js';

const trackingPort = (onPeek: () => void) => ({
	value$: new Observable((subscriber) => {
		onPeek();
		subscriber.next([]);
		subscriber.complete();
	}),
});

describe('refreshLiveWiredToolPacks', () => {
	it('peeks tools and subagent-registration outputs', () => {
		const peeked: string[] = [];
		const session = {
			runtime: {
				editor: {
					getNodes: () => [
						{
							outputs: {
								tools: trackingPort(() => {
									peeked.push('tools');
								}),
								'subagent-registration': trackingPort(() => {
									peeked.push('subagent-registration');
								}),
							},
						},
					],
				},
			},
		} as unknown as LangflowerSession;

		refreshLiveWiredToolPacks(session);

		expect(peeked).toEqual(['tools', 'subagent-registration']);
	});
});
