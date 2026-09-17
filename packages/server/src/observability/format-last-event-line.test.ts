import type { NodeId, PortTelemetry, ResponseDto } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	formatLastEventLine,
	lastEventIdentity,
	LAST_EVENT_LINE_CAP,
	type CliProgressEvent,
} from './format-last-event-line.js';

const portEvent = (
	response: ResponseDto<unknown>,
	portId = 'draft',
): PortTelemetry => ['out', 'coder' as NodeId, portId, response, 0, [], null];

const portProgress = (
	response: ResponseDto<unknown>,
	portId = 'draft',
): CliProgressEvent => ({
	type: 'port',
	event: portEvent(response, portId),
});

describe('formatLastEventLine', () => {
	it('formats pending / value / error port facts', () => {
		expect(formatLastEventLine(portProgress({ pending: true }))).toBe(
			'Last event: coder · draft · pending',
		);
		expect(formatLastEventLine(portProgress({ value: 'hello' }))).toBe(
			'Last event: coder · draft · value · hello',
		);
		expect(
			formatLastEventLine(
				portProgress({ error: new Error('tool failed') }),
			),
		).toBe('Last event: coder · draft · error · tool failed');
	});

	it('uses JSON placeholder for object values and skips inactive', () => {
		expect(formatLastEventLine(portProgress({ value: { foo: 1 } }))).toBe(
			'Last event: coder · draft · value · JSON',
		);
		expect(
			formatLastEventLine(portProgress({ inactive: true })),
		).toBeNull();
	});

	it('truncates long lines to LAST_EVENT_LINE_CAP', () => {
		const line = formatLastEventLine(
			portProgress({ value: 'x'.repeat(200) }),
		);
		expect(line).not.toBeNull();
		expect(line?.length).toBe(LAST_EVENT_LINE_CAP);
		expect(line?.endsWith('…')).toBe(true);
	});

	it('formats HITL waits and interrupt', () => {
		expect(
			formatLastEventLine({
				type: 'permissionAsk',
				payload: {
					runId: 'r1',
					askId: 'a1',
					nodeId: 'coder',
					toolId: 'bash',
					detail: 'rm',
					summary: 'run bash',
				},
			}),
		).toBe('Last event: waiting · permission.ask · bash');
		expect(
			formatLastEventLine({
				type: 'askUser',
				payload: {
					runId: 'r1',
					askId: 'u1',
					nodeId: 'gate',
					question: 'Continue?',
				},
			}),
		).toBe('Last event: waiting · ask_user · gate');
		expect(formatLastEventLine({ type: 'interrupted' })).toBe(
			'Last event: stopped',
		);
	});

	it('prints a resolved node name instead of the instance id', () => {
		const guid = 'n-7f3a9c2e';
		const names = (id: string): string => (id === guid ? 'Coder' : id);
		expect(
			formatLastEventLine(
				{
					type: 'port',
					event: [
						'out',
						guid as NodeId,
						'draft',
						{ pending: true },
						0,
						[],
						null,
					],
				},
				names,
			),
		).toBe('Last event: Coder · draft · pending');
		expect(
			formatLastEventLine(
				{
					type: 'askUser',
					payload: {
						runId: 'r1',
						askId: 'u1',
						nodeId: guid,
						question: 'Continue?',
					},
				},
				names,
			),
		).toBe('Last event: waiting · ask_user · Coder');
	});
});

describe('lastEventIdentity', () => {
	it('changes when port kind changes', () => {
		expect(lastEventIdentity(portProgress({ pending: true }))).toBe(
			'port:coder:draft:pending',
		);
		expect(lastEventIdentity(portProgress({ value: 'x' }))).toBe(
			'port:coder:draft:value',
		);
		expect(lastEventIdentity(portProgress({ pending: true }))).not.toBe(
			lastEventIdentity(portProgress({ value: 'x' })),
		);
	});

	it('keys HITL waits by askId', () => {
		expect(
			lastEventIdentity({
				type: 'permissionAsk',
				payload: {
					runId: 'r1',
					askId: 'a1',
					nodeId: 'coder',
					toolId: 'bash',
					detail: '',
					summary: '',
				},
			}),
		).toBe('permissionAsk:a1');
		expect(
			lastEventIdentity({
				type: 'askUser',
				payload: {
					runId: 'r1',
					askId: 'u1',
					nodeId: 'gate',
					question: '?',
				},
			}),
		).toBe('askUser:u1');
		expect(lastEventIdentity({ type: 'interrupted' })).toBe('interrupted');
	});
});
