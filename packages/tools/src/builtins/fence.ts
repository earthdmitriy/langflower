import {
	toHarnessDisplayPath,
	type PathFenceOptions,
} from '../path-sandbox.js';
import type { HandlerContext } from './types.js';

export const fenceOptions = (ctx: HandlerContext): PathFenceOptions => ({
	denyPaths: ctx.denyPaths,
	allowedRoots: ctx.allowedRoots,
});

export const displayPath = (ctx: HandlerContext, absolute: string): string =>
	toHarnessDisplayPath(ctx.projectRoot, absolute, ctx.allowedRoots);
