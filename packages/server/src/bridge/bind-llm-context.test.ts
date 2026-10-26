import type { HitlUploadedFile } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import type { LangflowerSession } from '../session/langflower-session.js';
import type { WorkflowSessionStore } from '../workflow-sessions/workflow-session-store.js';
import { stageBoundSessionUpload } from './bind-llm-context.js';

const session = (
	binding: LangflowerSession['binding'],
	workflowId?: string,
): LangflowerSession =>
	({
		binding,
		activeWorkflow: workflowId === undefined ? null : { workflowId },
	}) as LangflowerSession;

describe('stageBoundSessionUpload', () => {
	it('throws and does not write when no workflow session is bound', async () => {
		let writes = 0;
		const store = {
			writeUpload: async () => {
				writes += 1;
				throw new Error('should not write');
			},
		} as unknown as WorkflowSessionStore;

		await expect(
			stageBoundSessionUpload(
				session({ kind: 'workflow' }),
				store,
			)({
				name: '1.png',
				mimeType: 'image/png',
				bytes: Uint8Array.from([1, 2, 3]),
			}),
		).rejects.toThrow('No workflow session is bound');
		expect(writes).toBe(0);
	});

	it('writes the bytes and allowlisted MIME through the session store', async () => {
		const bytes = Uint8Array.from([9, 8, 7]);
		const staged: HitlUploadedFile = {
			fileId: 'file-1',
			name: '1.png',
			mimeType: 'image/png',
			size: bytes.byteLength,
		};
		let seen:
			| {
					readonly workflowId: string;
					readonly sessionId: string;
					readonly name: string;
					readonly mimeType: string;
					readonly bytes: Buffer;
			  }
			| undefined;
		const store = {
			writeUpload: async (
				workflowId: string,
				sessionId: string,
				input: {
					readonly name: string;
					readonly mimeType: string;
					readonly bytes: Buffer;
				},
			) => {
				seen = {
					workflowId,
					sessionId,
					name: input.name,
					mimeType: input.mimeType,
					bytes: input.bytes,
				};
				return { ok: true as const, value: staged };
			},
		} as unknown as WorkflowSessionStore;

		const file = await stageBoundSessionUpload(
			session(
				{ kind: 'workflowSession', sessionId: 'session-1' },
				'wf-1',
			),
			store,
		)({
			name: '1.png',
			mimeType: 'image/png',
			bytes,
		});

		expect(file).toEqual(staged);
		expect(seen).toEqual({
			workflowId: 'wf-1',
			sessionId: 'session-1',
			name: '1.png',
			mimeType: 'image/png',
			bytes: Buffer.from(bytes),
		});
	});
});
