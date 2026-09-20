import type { BuiltinToolRegistration } from '../harness-types.js';

export type { BuiltinToolRegistration };

export type AskUserQuestion = {
	readonly id: string;
	readonly prompt: string;
	readonly options: readonly {
		readonly id: string;
		readonly label: string;
	}[];
	readonly allowMultiple: boolean;
};

export type AskUserRequest = {
	readonly question: string;
	/** Empty / omitted for a legacy single-`question` call. */
	readonly questions?: readonly AskUserQuestion[];
};

export type HandlerContext = {
	readonly projectRoot: string;
	readonly denyPaths: readonly string[];
	/** Absolute (or project-relative) roots trusted outside the project. */
	readonly allowedRoots: readonly string[];
	readonly bashEnabled: boolean;
	/** Per-invoke abort (tool timeout / run cancel). */
	readonly signal?: AbortSignal;
	/**
	 * Live HITL host for the `ask_user` builtin. Missing outside a Langflower
	 * server run — invoke then fails closed.
	 */
	readonly askUser?: (request: AskUserRequest) => Promise<string>;
};

export type BuiltinTool<Id extends string = string> = {
	readonly id: Id;
	readonly registration: BuiltinToolRegistration;
	readonly invoke: (
		ctx: HandlerContext,
		args: Readonly<Record<string, unknown>>,
	) => Promise<string>;
};
