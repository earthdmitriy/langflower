import { concat, of, timer, type Observable } from 'rxjs';
import { filter, map, startWith, switchMap } from 'rxjs/operators';

export type ValuePulseCommand = 'pulseOn' | 'pulseOff';

export const PULSE_MS = 300;

/** Pure command stream — for unit tests / composition. */
export const valuePulseCommands$ = <E extends { state: string }>(
	events$: Observable<E>,
	ms: number = PULSE_MS,
): Observable<ValuePulseCommand> =>
	events$.pipe(
		filter((e) => e.state === 'value'),
		switchMap(() =>
			concat(
				of<ValuePulseCommand>('pulseOn'),
				timer(ms).pipe(map(() => 'pulseOff' as const)),
			),
		),
	);

/** Boolean projection for UI binding (`toSignal` / async pipe). */
export const valuePulseActive$ = <E extends { state: string }>(
	events$: Observable<E>,
	ms: number = PULSE_MS,
): Observable<boolean> =>
	valuePulseCommands$(events$, ms).pipe(
		map((cmd) => cmd === 'pulseOn'),
		startWith(false),
	);
