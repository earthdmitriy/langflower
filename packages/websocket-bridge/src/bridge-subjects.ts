import type { Subscription } from 'rxjs';
import { Subject, type Observable } from 'rxjs';
import type { WsBridgeConfig, WsBridgeEvent } from './bridge-types.js';

export type WsBridgeMessageSection = keyof Pick<
	WsBridgeConfig,
	'fromClientToServer' | 'fromServerToClient'
>;

export function readMessageKeys(
	config: WsBridgeConfig,
	section: WsBridgeMessageSection,
): readonly string[] {
	return Object.keys(config[section]);
}

export function createSubjectMap(
	keys: readonly string[],
): Record<string, Subject<unknown>> {
	const subjects: Record<string, Subject<unknown>> = {};

	for (const key of keys) {
		subjects[key] = new Subject<unknown>();
	}

	return subjects;
}

export function toObservables(
	subjects: Record<string, Subject<unknown>>,
): Record<string, Observable<unknown>> {
	const observables: Record<string, Observable<unknown>> = {};

	for (const [key, subject] of Object.entries(subjects)) {
		observables[key] = subject.asObservable();
	}

	return observables;
}

export function wireOutgoingSubjects(
	subjects: Record<string, Subject<unknown>>,
	send: (event: WsBridgeEvent, transportDir: 'in' | 'out') => void,
	transportDir: 'in' | 'out',
): Subscription[] {
	return Object.entries(subjects).map(([type, subject]) =>
		subject.subscribe((payload) => {
			send({ type, payload }, transportDir);
		}),
	);
}

export function routeInboundEvent(
	event: WsBridgeEvent,
	subjects: Record<string, Subject<unknown>>,
	clientId?: string,
): boolean {
	const subject = subjects[event.type];

	if (subject === undefined) {
		return false;
	}

	subject.next(
		clientId === undefined
			? event.payload
			: { clientId, payload: event.payload },
	);
	return true;
}

export function completeSubjects(
	subjects: Record<string, Subject<unknown>>,
): void {
	for (const subject of Object.values(subjects)) {
		subject.complete();
	}
}
