import { concat, of, timer, type Observable } from 'rxjs';
import { filter, map, startWith, switchMap } from 'rxjs/operators';

export type ValuePulseCommand = 'pulseOn' | 'pulseOff';

export const PULSE_MS = 300;

const isValueResponse = (slot: unknown): boolean =>
	slot !== null && typeof slot === 'object' && 'value' in slot;

const isValueEmission = (event: unknown): boolean => {
	if (Array.isArray(event)) {
		return isValueResponse(event[3]);
	}
	if (typeof event !== 'object' || event === null) {
		return false;
	}
	if ('state' in event) {
		const state = (event as { readonly state: unknown }).state;
		return state === 'value' || isValueResponse(state);
	}
	return 'value' in event;
};

/** Pure command stream — for unit tests / composition. */
export const valuePulseCommands$ = <E>(
	events$: Observable<E>,
	ms: number = PULSE_MS,
): Observable<ValuePulseCommand> =>
	events$.pipe(
		filter((event) => isValueEmission(event)),
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
