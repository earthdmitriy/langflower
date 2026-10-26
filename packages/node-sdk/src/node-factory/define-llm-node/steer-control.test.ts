import { describe, expect, it } from 'vitest';
import {
	isSteerControlContinue,
	isSteerControlPause,
	isSteerControlPayload,
	STEER_CONTROL_PORT_ID,
} from './steer-control.js';

describe('steer-control', () => {
	it('exports the locked port id', () => {
		expect(STEER_CONTROL_PORT_ID).toBe('steerControl');
	});

	it('recognizes pause / steer / resume payloads', () => {
		expect(isSteerControlPause({ kind: 'pause' })).toBe(true);
		expect(
			isSteerControlContinue({ kind: 'steer', text: 'fix this' }),
		).toBe(true);
		expect(
			isSteerControlContinue({
				kind: 'steer',
				text: 'fix this',
				files: [
					{
						fileId: 'img-1',
						name: 'photo.png',
						mimeType: 'image/png',
						size: 4,
					},
				],
			}),
		).toBe(true);
		expect(isSteerControlContinue({ kind: 'resume' })).toBe(true);
		expect(isSteerControlPayload({ kind: 'steer' })).toBe(false);
		expect(isSteerControlPayload('plain')).toBe(false);
		expect(isSteerControlPayload({ kind: 'steer', text: 'fix this' })).toBe(
			true,
		);
		expect(
			isSteerControlPayload({
				kind: 'steer',
				text: 'fix this',
				files: [
					{
						fileId: 'img-1',
						name: 'photo.png',
						mimeType: 'image/png',
						size: 4,
					},
				],
			}),
		).toBe(true);
	});
});
