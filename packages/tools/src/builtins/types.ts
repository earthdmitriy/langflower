import type { BuiltinToolRegistration } from '../harness-types.js';

export type { BuiltinToolRegistration };

export type HandlerContext = {
	readonly projectRoot: string;
	readonly denyPaths: readonly string[];
	/** Absolute (or project-relative) roots trusted outside the project. */
	readonly allowedRoots: readonly string[];
	readonly bashEnabled: boolean;
	/** Per-invoke abort (tool timeout / run cancel). */
	readonly signal?: AbortSignal;
};

export type BuiltinTool<Id extends string = string> = {
	readonly id: Id;
	readonly registration: BuiltinToolRegistration;
	readonly invoke: (
		ctx: HandlerContext,
		args: Readonly<Record<string, unknown>>,
	) => Promise<string>;
};
