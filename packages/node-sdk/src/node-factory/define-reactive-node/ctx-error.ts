/**
 * Error-lane payload for the hidden node `ctx` port
 * (`StatefulObservable<ExecutionContext, CtxError, PortMeta>`).
 * Not an `Error` subclass — SO 2nd generic types `error$` as `false | CtxError`.
 */
export type CtxError = {
	readonly message: string;
};
