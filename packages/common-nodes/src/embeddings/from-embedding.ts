/**
 * Run an embeddings Promise on a teardown-owned AbortSignal.
 * Stays open after the first value so unsubscribe (runner Stop) can still
 * abort in-flight work — unlike `from(promise)`, which completes and would
 * abort immediately after a successful probe.
 */
import { defer, Observable } from 'rxjs';

export const fromEmbedding = <T>(
	work: (signal: AbortSignal) => Promise<T>,
): Observable<T> =>
	defer(() => {
		const cancel = new AbortController();
		return new Observable<T>((subscriber) => {
			void work(cancel.signal).then(
				(value) => {
					if (!subscriber.closed) {
						subscriber.next(value);
					}
				},
				(error: unknown) => {
					if (!subscriber.closed) {
						subscriber.error(error);
					}
				},
			);
			return () => {
				cancel.abort();
			};
		});
	});
