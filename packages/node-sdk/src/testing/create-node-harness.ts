import { of, firstValueFrom, type Subscription } from 'rxjs';
import type {
	ExecutionContext,
	ReactiveNodeDefinition,
	ReactiveNodeInstance,
} from '../node-factory/define-reactive-node/define-reactive-node.js';
import {
	defaultParamsFromUiSchema,
	type UISchemaConstItem,
} from '../node-factory/define-reactive-node/ui-schema-inference.js';

type HarnessUi = readonly UISchemaConstItem[];
type HarnessInstance = ReactiveNodeInstance<HarnessUi, object>;
type HarnessContext = ExecutionContext<HarnessUi, object>;

export type NodeHarnessOptions = {
	readonly projectDir?: string;
	readonly runId?: string;
	readonly nodeId?: string;
	readonly params?: Readonly<Record<string, unknown>>;
};

export type CollectedPort<T> = {
	readonly values: readonly T[];
	readonly stop: () => void;
};

export type NodeHarness = {
	readonly instance: HarnessInstance;
	readonly send: (portId: string, value: unknown) => void;
	readonly next: <T>(portId: string) => Promise<T>;
	readonly collect: <T>(portId: string) => CollectedPort<T>;
	readonly dispose: () => void;
};

const missingPort = (kind: 'input' | 'output', portId: string): Error =>
	new Error(`Unknown ${kind} port "${portId}"`);

/**
 * Drive a {@link ReactiveNodeDefinition} in unit tests: seed context,
 * `send` on input ports, `next` / `collect` on outputs.
 *
 * Subscribe with `next` or `collect` **before** `send` when the graph can
 * emit synchronously.
 */
export const createNodeHarness = (
	definition: Pick<ReactiveNodeDefinition, 'getInstance' | 'uiSchema'>,
	options?: NodeHarnessOptions,
): NodeHarness => {
	const instance = definition.getInstance();
	const collectors: Subscription[] = [];
	const uiSchema = definition.uiSchema;
	const params = {
		...defaultParamsFromUiSchema(uiSchema),
		...options?.params,
	};

	instance.ctxConnection.connect(
		of({
			projectDir: options?.projectDir ?? '/tmp',
			runId: options?.runId ?? 'test',
			nodeId: options?.nodeId ?? 'node-1',
			params,
			uiSchema,
		} as HarnessContext),
	);

	const send = (portId: string, value: unknown): void => {
		const input = instance.inputs[portId];
		if (input === undefined) {
			throw missingPort('input', portId);
		}
		input.connect(of(value));
	};

	const next = <T>(portId: string): Promise<T> => {
		const output = instance.outputs[portId];
		if (output === undefined) {
			return Promise.reject(missingPort('output', portId));
		}
		return firstValueFrom(output.value$) as Promise<T>;
	};

	const collect = <T>(portId: string): CollectedPort<T> => {
		const output = instance.outputs[portId];
		if (output === undefined) {
			throw missingPort('output', portId);
		}
		const values: T[] = [];
		const subscription = output.value$.subscribe({
			next: (value) => {
				values.push(value as T);
			},
		});
		collectors.push(subscription);
		return {
			get values() {
				return values;
			},
			stop: () => {
				subscription.unsubscribe();
			},
		};
	};

	const dispose = (): void => {
		for (const subscription of collectors) {
			subscription.unsubscribe();
		}
		collectors.length = 0;
	};

	return { instance, send, next, collect, dispose };
};
