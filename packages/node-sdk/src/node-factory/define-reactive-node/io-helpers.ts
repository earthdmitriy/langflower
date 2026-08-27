import type {
	FeedPortMeta,
	FeedRole,
	MetaFromStatefulObservable,
	PortMeta,
} from './port-meta.js';
export type { FeedPortMeta, FeedRole } from './port-meta.js';
import {
	isSuccess,
	statefulConnection,
	StatefulObservable,
	type ResponseWithStatus,
} from '@rx-evo/stateful-observable';
import { concat, concatMap, of, type OperatorFunction } from 'rxjs';
import type { HitlInputConfig } from './hitl-config.js';

/** One choice for the `select` / `multiselect` / `radio` inline kinds. */
export type InlineSelectOption = {
	readonly title: string;
	readonly value: unknown;
	readonly description?: string;
};

/** Default floor for canvas/inspector multiline textareas (px). */
export const DEFAULT_MULTILINE_MIN_HEIGHT_PX = 100;

/**
 * Object form of `'text-multiline'`: authors opt fields into sharing extra
 * node height via CSS flex. Shorthand `'text-multiline'` equals
 * `{ type: 'text-multiline', flex: 1 }` (see ADR-017).
 */
export type InlineTextMultilineConfig = {
	readonly type: 'text-multiline';
	/** Flex grow weight when the node is taller than content; `0` = no grow. */
	readonly flex?: number;
	/** Min height in px (default {@link DEFAULT_MULTILINE_MIN_HEIGHT_PX}). */
	readonly minHeightPx?: number;
};

export type ResolvedMultilineInlineLayout = {
	readonly flex: number;
	readonly minHeightPx: number;
};

/**
 * On-node editor kind for an input port.
 *
 * `'text'` / `'text-multiline'` / `'boolean'` / `'number'` / select-family
 * kinds edit the design-time literal (`node.inputs[portId]`) and are
 * disabled once an edge is wired into the port. `'preview'` /
 * `'preview-markdown'` / `'preview-code'` are read-only displays of the
 * **live** value received during execution (never disabled — there is no
 * editable state to disable).
 */
export type InlineConfig =
	| 'text'
	| 'text-multiline'
	| 'boolean'
	| 'preview'
	| 'preview-markdown'
	| 'preview-code'
	| InlineTextMultilineConfig
	| {
			readonly type: 'select' | 'multiselect' | 'radio';
			readonly options: readonly InlineSelectOption[];
	  }
	| {
			readonly type: 'number';
			readonly min?: number;
			readonly max?: number;
			readonly step?: number;
	  };

/** Resolve multiline layout; `null` when `config` is not text-multiline. */
export const resolveMultilineInlineLayout = (
	config: InlineConfig,
): ResolvedMultilineInlineLayout | null => {
	if (config === 'text-multiline') {
		return { flex: 1, minHeightPx: DEFAULT_MULTILINE_MIN_HEIGHT_PX };
	}

	if (typeof config === 'object' && config.type === 'text-multiline') {
		return {
			flex: config.flex ?? 1,
			minHeightPx: config.minHeightPx ?? DEFAULT_MULTILINE_MIN_HEIGHT_PX,
		};
	}

	return null;
};

/**
 * User-facing input configuration.
 *
 * `dir`, `portId`, `wireType`, and `mode` are set automatically by `makeInput`
 * — callers never provide them.
 */
export type InputParams<T> = {
	readonly name?: string;
	/** Wire type (e.g. `"string"`, `"dynamic"`, `"any"`). */
	readonly wireType?: string | symbol;
	readonly required?: boolean;
	readonly multi?: 'merge' | 'combine' | 'zip';
	readonly description?: string;
	readonly defaultValue?: T;
	/** On-node editor kind — unset means no on-node control at all. */
	readonly inline?: InlineConfig;
	/**
	 * Hidden wire port — no canvas handle. With editable `inline`, still a
	 * visible on-node / inspector field (Chat Input `message`).
	 */
	readonly hidden?: boolean;
	readonly dynamic?: boolean;
	readonly hitl?: HitlInputConfig;
	/** Feed metadata for terminal input facts such as approve / deny. */
	readonly feed?: FeedPortMeta;
};

/** Port metadata for an input — `InputParams` merged with `PortMeta`. */
export type InputPortMeta<T> = InputParams<T> & PortMeta;

/**
 * Configure node input
 *
 * You should define generic input type
 *
 * For example
 *
 * makeInput<string>('text')
 * makeInput<number>('count')
 *
 *
 * @param portId
 * @param config
 * @returns
 */
export function makeInput<T>(portId: string, meta: InputParams<T>) {
	const wireType =
		meta.dynamic === true ? 'dynamic' : (meta.wireType ?? 'any');

	return statefulConnection<T, unknown, InputPortMeta<T>>({
		meta: {
			...meta,
			dir: 'in' as const,
			portId,
			wireType,
			mode: meta.multi ?? 'single',
		},
	});
}

export type InputConfig = ReturnType<typeof makeInput>;

export type OutputParams = {
	/**
	 * display name
	 */
	readonly name?: string;
	/**
	 * description in tooltip
	 */
	readonly description?: string;
	/** No visible port on canvas or palette preview. */
	readonly hidden?: boolean;
	/**
	 * When true, emitting a value on this port writes a durable workflow
	 * checkpoint (ADR-018 D). Prefer a dedicated `common-checkpoint` node;
	 * this flag is the advanced escape for custom nodes.
	 */
	readonly createCheckpoint?: boolean;
	/**
	 * Optional static label stored with the checkpoint when
	 * {@link createCheckpoint} fires (overridden by node `inputs.label`
	 * when present).
	 */
	readonly checkpointLabel?: string;
	/**
	 * if set - output will be connected to feed at sidebar
	 */
	readonly feed?: FeedPortMeta;
};

type WithWireType = { readonly wireType: string };
type PassthroughConfig = {
	readonly inferTypeFrom:
		InputParams<unknown> | StatefulObservable<unknown, unknown, PortMeta>;
};
type WithWireTypeOrPassthrough = WithWireType | PassthroughConfig;

function hasWireType(input: WithWireTypeOrPassthrough): input is WithWireType {
	return 'wireType' in input;
}

function isPassthrough(
	input: WithWireTypeOrPassthrough,
): input is PassthroughConfig {
	return 'inferTypeFrom' in input;
}

function resolveInferTypeFromName(
	inferTypeFrom:
		InputParams<unknown> | StatefulObservable<unknown, unknown, PortMeta>,
): string | undefined {
	const meta = (
		inferTypeFrom as StatefulObservable<unknown, unknown, PortMeta>
	).meta;
	if (meta !== undefined && 'name' in meta && typeof meta.name === 'string') {
		return meta.name;
	}
	if ('name' in inferTypeFrom && typeof inferTypeFrom.name === 'string') {
		return inferTypeFrom.name;
	}
	return undefined;
}

export function configureOutput<T>(
	portId: string,
	stream: StatefulObservable<T, unknown, PortMeta | undefined>,
	meta?: WithWireTypeOrPassthrough & OutputParams,
) {
	const fromInput =
		meta && isPassthrough(meta)
			? resolveInferTypeFromName(meta.inferTypeFrom)
			: undefined;

	const wireType = fromInput
		? ('dynamic' as const)
		: meta && hasWireType(meta)
			? meta.wireType
			: 'any';

	// Probe `inferTypeFrom` is author-time only — never store the live stream
	// on serializable port meta (palette / WS JSON).
	const restMeta =
		meta === undefined
			? {}
			: isPassthrough(meta)
				? (() => {
						const { inferTypeFrom: _omit, ...rest } = meta;
						return rest;
					})()
				: meta;

	return stream.with({
		meta: {
			...restMeta,
			dir: 'out',
			portId,
			wireType,
			...(fromInput !== undefined ? { fromInput } : {}),
		} as OutputParams & PortMeta,
	});
}

export type OutputConfig = ReturnType<typeof configureOutput>;

/** Serializable descriptor for one output port — `OutputConfig['meta']`. */
export type OutputPortMeta = MetaFromStatefulObservable<OutputConfig>;

const LOADING = {
	state: Symbol.for('@rx-evo/stateful-observable/loading'),
};

/**
 * Stamp `{ pending: true }` on each new success, then re-emit that success.
 * Use on the raw SO stream **before** async `pipeValue` work:
 *
 * `combineInputs(...).pipe(withLoading()).pipeValue(concatMap(delay))`
 *
 * `pipeValue` + `delay` / `from(Promise)` does **not** create loading.
 * Do not wrap token/chunk streams (re-pends every emit through demux).
 */
export const withLoading = <T>(): OperatorFunction<T, T> =>
	concatMap((response) =>
		isSuccess(response as ResponseWithStatus<T>)
			? concat(of(LOADING as T), of(response))
			: of(response),
	);
