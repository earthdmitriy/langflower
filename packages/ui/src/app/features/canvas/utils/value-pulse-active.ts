import { concat, of, timer, type Observable } from 'rxjs';
import { filter, map, startWith, switchMap } from 'rxjs/operators';

export type ValuePulseCommand = 'pulseOn' | 'pulseOff';

export const PULSE_MS = 300;

const readPortSignalState = (event: unknown): string | undefined => {
	if (Array.isArray(event) && typeof event[3] === 'string') {
		return event[3];
	}
	if (
		typeof event === 'object' &&
		event !== null &&
		'state' in event &&
		typeof (event as { readonly state: unknown }).state === 'string'
	) {
		return (event as { readonly state: string }).state;
	}
	return undefined;
};

/** Pure command stream — for unit tests / composition. */
export const valuePulseCommands$ = <E>(
	events$: Observable<E>,
	ms: number = PULSE_MS,
): Observable<ValuePulseCommand> =>
	events$.pipe(
		filter((event) => readPortSignalState(event) === 'value'),
		switchMap(() =>
			concat(
				of<ValuePulseCommand>('pulseOn'),
				timer(ms).pipe(map(() => 'pulseOff' as const)),
			),
		),
	);

/** Boolean projection for UI binding (`toSignal` / async pipe). */
export const valuePulseActive$ = <E>(
	events$: Observable<E>,
	ms: number = PULSE_MS,
): Observable<boolean> =>
	valuePulseCommands$(events$, ms).pipe(
		map((cmd) => cmd === 'pulseOn'),
		startWith(false),
	);
