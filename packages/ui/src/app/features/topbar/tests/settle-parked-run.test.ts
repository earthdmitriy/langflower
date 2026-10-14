import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { settleParkedRunThen } from '../settle-parked-run';

describe('settleParkedRunThen', () => {
	it('runs the action immediately when the runner is idle', async () => {
		const interrupted$ = new Subject<void>();
		const requestInterrupt = vi.fn();
		const action = vi.fn();

		await settleParkedRunThen({
			running: false,
			requestInterrupt,
			interrupted$,
			action,
		});

		expect(requestInterrupt).not.toHaveBeenCalled();
		expect(action).toHaveBeenCalledOnce();
	});

	it('interrupts a parked run and then runs the action', async () => {
		const interrupted$ = new Subject<void>();
		const requestInterrupt = vi.fn(() => {
			interrupted$.next();
		});
		const action = vi.fn();

		await settleParkedRunThen({
			running: true,
			requestInterrupt,
			interrupted$,
			action,
		});

		expect(requestInterrupt).toHaveBeenCalledOnce();
		expect(action).toHaveBeenCalledOnce();
		expect(requestInterrupt.mock.invocationCallOrder[0]).toBeLessThan(
			action.mock.invocationCallOrder[0] ?? 0,
		);
	});
});
