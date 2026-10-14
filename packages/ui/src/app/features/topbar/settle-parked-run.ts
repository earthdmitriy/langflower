import { firstValueFrom, type Observable } from 'rxjs';
import { take } from 'rxjs/operators';

/**
 * A parked HITL or steering run is still `running` on the server.
 * Stop it before a workflow or session switch. An idle runner skips
 * the interrupt. An executing run never calls this: those controls
 * stay disabled.
 */
export const settleParkedRunThen = async (args: {
	readonly running: boolean;
	readonly requestInterrupt: () => void;
	readonly interrupted$: Observable<unknown>;
	readonly action: () => void;
}): Promise<void> => {
	if (args.running) {
		const settled = firstValueFrom(args.interrupted$.pipe(take(1)));
		args.requestInterrupt();
		await settled;
	}

	args.action();
};
