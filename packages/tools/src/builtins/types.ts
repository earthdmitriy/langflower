import type { HitlUploadedFile } from '@langflower/node-sdk';
import type { BuiltinToolRegistration } from '../harness-types.js';

export type { BuiltinToolRegistration };

/** One file the `read` builtin asks the host to stage on the bound session. */
export type StageSessionUploadInput = {
	readonly name: string;
	readonly mimeType: string;
	readonly bytes: Uint8Array;
};

export type StageSessionUpload = (
	input: StageSessionUploadInput,
) => Promise<HitlUploadedFile>;

/**
 * What `ask_user` resolves with: the reply text, and the files the person
 * attached to it (already uploaded to the session).
 */
export type AskUserAnswer =
	| string
	| {
			readonly text: string;
			readonly files: readonly HitlUploadedFile[];
	  };

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
	readonly askUser?: (request: AskUserRequest) => Promise<AskUserAnswer>;
	/**
	 * Stages one allowlisted file on the bound workflow session.
	 * Missing outside a Langflower server run — an in-scope media `read`
	 * then fails closed.
	 */
	readonly stageSessionUpload?: StageSessionUpload;
	/**
	 * Records files that are already staged on the session (an `ask_user`
	 * reply with attachments) so the loop hoists them like a `read` result.
	 */
	readonly recordStagedFiles?: (files: readonly HitlUploadedFile[]) => void;
};

export type BuiltinTool<Id extends string = string> = {
	readonly id: Id;
	readonly registration: BuiltinToolRegistration;
	readonly invoke: (
		ctx: HandlerContext,
		args: Readonly<Record<string, unknown>>,
	) => Promise<string>;
};
