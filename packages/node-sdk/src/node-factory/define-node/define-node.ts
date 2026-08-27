import type { PortMeta } from '../define-reactive-node/port-meta.js';
import { type StatefulObservable } from '@rx-evo/stateful-observable';
import { from, mergeMap, of, throwError } from 'rxjs';
import {
	type InputParams,
	withLoading,
} from '../define-reactive-node/io-helpers.js';
import {
	defineReactiveNode,
	type DefinedReactiveNodeConfig,
	type ReactiveNodeDefinition,
} from '../define-reactive-node/define-reactive-node.js';
import type { ExecutionContext } from '../define-reactive-node/types.js';
import type {
	AssertConstUISchema,
	UISchemaConstItem,
} from '../define-reactive-node/ui-schema-inference.js';

export type DefineNodePortMeta = {
	readonly wireType?: string;
	readonly required?: boolean;
	readonly multi?: 'merge' | 'combine' | 'zip';
	readonly description?: string;
	readonly name?: string;
	readonly dynamic?: boolean;
	readonly inline?: InputParams<unknown>['inline'];
	readonly hidden?: boolean;
};

export type DefineNodeConfig<
	UI extends readonly UISchemaConstItem[] = readonly UISchemaConstItem[],
> = {
	readonly type: string;
	readonly displayName: string;
	readonly category?: string;
	readonly paletteSecondary?: boolean;
	readonly description?: string;
	readonly icon?: string;
	readonly stopsRun?: boolean;
	readonly emitOncePerActivation?: boolean;
	readonly chatEntry?: boolean;
	readonly uiSchema: AssertConstUISchema<UI>;
	readonly inputs?: Readonly<Record<string, DefineNodePortMeta>>;
	readonly outputs?: Readonly<Record<string, DefineNodePortMeta>>;
	readonly execute: (
		ctx: ExecutionContext<UI>,
		inputs: Readonly<Record<string, unknown>>,
	) =>
		| Readonly<Record<string, unknown>>
		| Promise<Readonly<Record<string, unknown>>>;
};

const inputParamsFromMeta = (
	portId: string,
	meta: DefineNodePortMeta,
): InputParams<unknown> => {
	const params: InputParams<unknown> = {
		name: meta.name ?? portId,
		defaultValue: null,
	};
	return {
		...params,
		...(meta.wireType !== undefined ? { wireType: meta.wireType } : {}),
		...(meta.required !== undefined ? { required: meta.required } : {}),
		...(meta.multi !== undefined ? { multi: meta.multi } : {}),
		...(meta.description !== undefined
			? { description: meta.description }
			: {}),
		...(meta.dynamic !== undefined ? { dynamic: meta.dynamic } : {}),
		...(meta.inline !== undefined ? { inline: meta.inline } : {}),
		...(meta.hidden !== undefined ? { hidden: meta.hidden } : {}),
	};
};

/**
 * Simple authoring factory: sync/Promise `execute` without RxJS.
 * Adapter over {@link defineReactiveNode} (one reactive runtime path).
 * Stamps `{ pending: true }` on outputs before each `execute` via
 * {@link withLoading} — authors do not call it.
 */
export const defineNode = <const UI extends readonly UISchemaConstItem[]>(
	config: DefineNodeConfig<UI>,
): ReactiveNodeDefinition => {
	const inputEntries = Object.entries(config.inputs ?? {});
	const outputEntries = Object.entries(config.outputs ?? {});

	const reactiveConfig = {
		type: config.type,
		displayName: config.displayName,
		uiSchema: config.uiSchema,
		emitOncePerActivation: config.emitOncePerActivation ?? true,
		...(config.category !== undefined ? { category: config.category } : {}),
		...(config.paletteSecondary === true
			? { paletteSecondary: true as const }
			: {}),
		...(config.description !== undefined
			? { description: config.description }
			: {}),
		...(config.icon !== undefined ? { icon: config.icon } : {}),
		...(config.stopsRun !== undefined ? { stopsRun: config.stopsRun } : {}),
		...(config.chatEntry !== undefined
			? { chatEntry: config.chatEntry }
			: {}),
		bind(
			ctx: Parameters<DefinedReactiveNodeConfig<UI>['bind']>[0],
			{
				makeInput: mk,
				configureOutput: cfgOut,
				combineInputs,
			}: Parameters<DefinedReactiveNodeConfig<UI>['bind']>[1],
		) {
			const inputPorts = inputEntries.map(([portId, meta]) =>
				mk<unknown>(portId, inputParamsFromMeta(portId, meta)),
			);

			const sources: StatefulObservable<
				unknown,
				unknown,
				PortMeta | undefined
			>[] = [ctx, ...inputPorts];

			const combined$ = combineInputs(sources, (values) => {
				const ec = values[0] as ExecutionContext<UI>;
				const inputs: Record<string, unknown> = {};
				for (let i = 0; i < inputEntries.length; i += 1) {
					const portId = inputEntries[i]?.[0];
					if (portId !== undefined) {
						inputs[portId] = values[i + 1];
					}
				}
				return { ec, inputs };
			});

			const result$ = combined$.pipe(withLoading()).pipeValue(
				mergeMap(({ ec, inputs }) =>
					from(
						Promise.resolve(config.execute(ec, inputs)).then(
							(outputs) => outputs,
							(error: unknown) => {
								throw error instanceof Error
									? error
									: new Error(String(error));
							},
						),
					),
				),
			);

			if (outputEntries.length === 0) {
				return {
					inputs: inputPorts,
					outputs: [cfgOut('result', result$, { wireType: 'any' })],
				};
			}

			const outputs = outputEntries.map(([portId, meta]) => {
				const port$ = result$.pipeValue(
					mergeMap((record) => {
						if (!(portId in record)) {
							return throwError(
								() =>
									new Error(
										`defineNode ${config.type}: execute result missing output «${portId}»`,
									),
							);
						}
						return of(record[portId]);
					}),
				);
				return cfgOut(portId, port$, {
					name: meta.name ?? portId,
					wireType:
						meta.dynamic === true
							? 'dynamic'
							: (meta.wireType ?? 'any'),
					...(meta.description !== undefined
						? { description: meta.description }
						: {}),
					...(meta.hidden !== undefined
						? { hidden: meta.hidden }
						: {}),
				});
			});

			return {
				inputs: inputPorts,
				outputs,
			};
		},
	};

	// `AssertConstUISchema` collapses to `never` under the unconstrained UI
	// default on `DefinedReactiveNodeConfig`; call sites still pass `as const`.
	return defineReactiveNode(reactiveConfig as never);
};
