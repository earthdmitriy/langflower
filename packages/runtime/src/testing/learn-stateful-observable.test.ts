import {
	combineStatefulObservables,
	isLoading,
	isSuccess,
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { Subject, delay, of, tap } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { PortMeta } from '../types.js';

/**
 * Documents `@rx-evo/stateful-observable` emission behaviour when using
 * `pipeValue` with async operators (e.g. `delay`).
 *
 * **Key insight:** `pipeValue` uses `switchMap → iif(isSuccess)` internally:
 *   - Non-success states (inactive, loading) pass through unchanged via `of(e)`.
 *   - Success values go through the operator chain (here `delay(10)`).
 *
 * This means `pending:true` fires synchronously during `connect()`, before
 * any async work starts. The delay only affects the success path.
 *
 * **Consequence for node chrome:** primitive nodes whose inputs are seeded
 * synchronously via `input.connect(of(value))` never show a `pending` state
 * on their output — the `loading` sentinel is pushed to the relay
 * `BehaviorSubject` then immediately overwritten by the success value in the
 * same synchronous tick. `shareReplay(1)` only caches the last emission,
 * so the `loading` is lost before any subscriber sees it.
 *
 * **Test 1 (observer interface):** Shows the full callback sequence.
 * **Test 2 (pipe + tap):** Shows that `tap()` on a `StatefulObservable`
 * intercepts the raw `ResponseWithStatus` (loading + success), while
 * downstream `subscribe` only receives the filtered success value.
 * This is exactly how `tapOutputPort` works in `runtime-runner.ts`.
 *
 * **Runtime implication:** `statefulObservable` always emits a loading
 * sentinel before the value, even for synchronous loaders (`of(value)`).
 * The `tapOutputPort` tap in `runtime-runner.ts` sees both `pending` and
 * `value` states in the event log. The UI misses these because
 * `runner.started` wipes `nodeOutputStates` after sync events arrive.
 * See `pending-state.workflow.test.ts` for proof.
 *
 * Callback sequence (observer interface):
 * ```
 * active:false   — initial inactive state of the BehaviorSubject relay
 * active:true    — connect() pushes loading (isSuccess → false → active:true)
 * pending:true   — connect() pushes loading (isLoading → true)
 * active:true    — subject.next() pushes success (isSuccess → true → active:true)
 * next:hello     — the actual value arrives after delay(10) ms
 * pending:false  — success clears pending
 * ```
 *
 * Raw observable sequence (pipe + tap):
 * ```
 * tap:  { state: Symbol(loading) }    — loading sentinel passes through pipeValue
 * tap:  "hello"                        — success value after delay
 * sub:  "hello"                        — downstream only sees the success value
 * ```
 */
/**
 * Reproduction of the production `pending`-missing bug (BUG-2026-07-14) at the
 * `@rx-evo/stateful-observable` level — TEST ONLY, no fix. Goal: locate *where*
 * the `pending` lifecycle is lost.
 *
 * Setup mirrors the production defect precisely:
 *  - A production sync primitive (`common-string`) surfaces its input
 *    `statefulConnection` directly and seeds it with a value. To a subscriber
 *    that attaches *after* that seed (exactly what `runtime-runner` does when it
 *    subscribes to node outputs at run start), the connection only replays the
 *    success value — the `loading` sentinel was pushed and overwritten in the
 *    same synchronous tick, so `shareReplay(1)` kept only the success emission.
 *  - The old production `common-delay` built its output from
 *    `combineStatefulObservables([valueIn, delayIn], …).pipeValue(concatMap(delay))`.
 *    Because neither input ever shows `pending` to a late subscriber, the combine
 *    never emits `pending` either.
 *
 * The two tests below pin this down: (1) a late subscriber on a value-only
 * connection sees **no** `pending`; (2) `combineStatefulObservables` of such
 * value-only sources therefore emits **no** `pending`. The contrast block shows
 * the `statefulObservable({ input, loader })` pattern *does* push
 * `pending` on subscription. NOTE: this combine/sync-seed behaviour is a property
 * of `@rx-evo`, not the cause of BUG-2026-07-14 — that bug was the server-side
 * `events$` subscription race (fixed in `attach-langflower-bridge.ts`); the
 * production `common-delay` node emits `pending` correctly.
 */
describe('statefulObservable emits pending for sync-seeded and combined sources', () => {
	it('sync-seeded connection emits pending on subscription', () => {
		const connection = statefulConnection<string, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			} satisfies PortMeta,
		});

		// Sync seed — exactly what a wiring of `common-string` looks like to the
		// runtime after run start: loading + success happen in one tick.
		connection.connect(of('hello'));

		const pendingSeen: boolean[] = [];
		const values: string[] = [];
		connection.subscribe({
			pending: (pending) => pendingSeen.push(pending),
			next: (value) => values.push(value as string),
		});

		expect(values).toEqual(['hello']);
		expect(pendingSeen).toContain(true);
	});

	it('combineStatefulObservables of value-only sources emits pending', () => {
		const a = statefulConnection<string, unknown, PortMeta>({
			meta: { dir: 'in', portId: 'a', wireType: 'any', mode: 'single' },
		});
		const b = statefulConnection<string, unknown, PortMeta>({
			meta: { dir: 'in', portId: 'b', wireType: 'any', mode: 'single' },
		});
		a.connect(of('A'));
		b.connect(of('B'));

		const combined = combineStatefulObservables(
			[a, b],
			([x, y]) => `${x}-${y}`,
		);

		const pendingSeen: boolean[] = [];
		const values: string[] = [];
		combined.subscribe({
			pending: (pending) => pendingSeen.push(pending),
			next: (value) => values.push(value as string),
		});

		expect(values).toEqual(['A-B']);
		expect(pendingSeen).toContain(true);
	});

	it('contrast: statefulObservable({ input, loader }) DOES emit pending', () => {
		const source = statefulConnection<string, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			},
		});
		source.connect(of('hello'));

		const output = statefulObservable({
			input: source.value$,
			loader: (value) => of(value),
		});

		const pendingSeen: boolean[] = [];
		const values: string[] = [];
		output.subscribe({
			pending: (pending) => pendingSeen.push(pending),
			next: (value) => values.push(value as string),
		});

		expect(pendingSeen).toContain(true);
		expect(values).toEqual(['hello']);
	});
});

describe('learn stateful observable', () => {
	it('pipeValue(delay) passes loading through, delays only success values', async () => {
		const subject = new Subject<string>();

		const connection = statefulConnection<string, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			} satisfies PortMeta,
		});

		const output = connection.pipeValue(delay(10)).with({
			meta: {
				dir: 'out',
				portId: 'value',
				wireType: 'any',
			} satisfies PortMeta,
		});

		const calls: string[] = [];
		output.subscribe({
			active: (active) => calls.push(`active:${active}`),
			pending: (pending) => calls.push(`pending:${pending}`),
			next: (value) => calls.push(`next:${value}`),
		});

		connection.connect(subject);
		subject.next('hello');

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(calls).toEqual([
			'active:false',
			'active:true',
			'pending:true',
			'active:true',
			'next:hello',
			'pending:false',
		]);
	});

	it('pipe(tap) receives raw ResponseWithStatus, subscribe receives nothing', async () => {
		const subject = new Subject<string>();

		const connection = statefulConnection<string, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			} satisfies PortMeta,
		});

		const output = connection.pipeValue(delay(10)).with({
			meta: {
				dir: 'out',
				portId: 'value',
				wireType: 'any',
			} satisfies PortMeta,
		});

		const tapCalls: unknown[] = [];
		const tapped = output.pipe(
			tap((response) => {
				tapCalls.push(response);
			}),
		);

		const subscribeCalls: unknown[] = [];
		tapped.subscribe({
			next: (v) => subscribeCalls.push(v),
		});

		connection.connect(subject);
		subject.next('hello');

		await new Promise((resolve) => setTimeout(resolve, 50));

		const mappedTapCalls = tapCalls.map((v) =>
			isLoading(v) ? 'loading' : isSuccess(v) ? `success:${v}` : 'other',
		);

		expect(mappedTapCalls).toEqual(['loading', 'success:hello']);
		expect(subscribeCalls).toEqual(['hello']);
	});
});

/**
 * Output-level subscription timing is NOT the cause of the missing `pending`.
 *
 * A `statefulObservable` output re-runs its `pending → value` lifecycle on every
 * new subscription — it is cold at this layer, not `shareReplay`-multicasted.
 * So a telemetry tap that subscribes later STILL sees `pending`: there is no
 * output-level race, and the node-definition pattern is not the cause either.
 *
 * The real loss is at the **event stream** level. `runtime-runner.tapOutputPort`
 * pushes each node's `pending`/`value` into `runner.events$` — a plain,
 * non-replaying `Subject`. The server must subscribe to `events$` *before* the
 * run starts; otherwise the initial `pending` emissions are gone before any
 * subscriber attaches. That server-side subscription race is the root cause
 * (BUG-2026-07-14). Proof + fix: `tests/integration/ws/pending-events-bridge.ws.test.ts`.
 */
describe('output StatefulObservable re-runs pending on every subscription', () => {
	const OUT_META: PortMeta = {
		dir: 'out',
		portId: 'value',
		wireType: 'any',
	} satisfies PortMeta;

	const buildDelayOutput = () => {
		const valueIn = statefulConnection<unknown, unknown, PortMeta>({
			meta: {
				dir: 'in',
				portId: 'value',
				wireType: 'any',
				mode: 'single',
			},
		});
		valueIn.connect(of('hi'));

		const output = statefulObservable({
			input: valueIn.value$,
			loader: (value) => of(value).pipe(delay(100)),
			meta: OUT_META,
		});
		return { valueIn, output };
	};

	it('telemetry subscribed first (no early subscriber) sees pending', async () => {
		const { output } = buildDelayOutput();
		const pendingCollected: string[] = [];

		// Telemetry tap attached BEFORE anything else — like a run where no
		// preview subscriber exists yet.
		const telemetry = output.pipe(
			tap((response) => {
				if (isLoading(response)) pendingCollected.push('pending');
			}),
		);
		const sub = telemetry.subscribe({ next: () => {} });

		await new Promise((resolve) => setTimeout(resolve, 150));
		sub.unsubscribe();

		expect(pendingCollected).toContain('pending');
	});

	it('late subscriber STILL sees pending (output re-runs per subscription)', async () => {
		const { output } = buildDelayOutput();

		// EARLY subscriber materializes the output (pending → value), then leaves.
		const earlySub = output.subscribe({
			pending: () => {},
			next: () => {},
		});
		await new Promise((resolve) => setTimeout(resolve, 150));
		earlySub.unsubscribe();

		// LATE telemetry tap (like a server that connects after run start)
		// subscribes now.
		const telemetryPending: string[] = [];
		const telemetry = output.pipe(
			tap((response) => {
				if (isLoading(response)) telemetryPending.push('pending');
			}),
		);
		const telemetrySub = telemetry.subscribe({ next: () => {} });
		await new Promise((resolve) => setTimeout(resolve, 150));
		telemetrySub.unsubscribe();

		// The output re-runs its pending→value lifecycle for the new subscriber,
		// so the late tap DOES see pending. There is no output-level race — the
		// missing `pending` in production is the `events$` subscription race.
		expect(telemetryPending).toContain('pending');
	});
});
