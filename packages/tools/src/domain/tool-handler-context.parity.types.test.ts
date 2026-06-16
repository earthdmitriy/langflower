/**
 * Contract: tools `ToolHandlerContext` (identity + optional host hooks)
 * remains assignable both ways with the SDK identity-only
 * `ToolHandlerContext` (`projectDir` / `runId`). Test-only relative import
 * of the SDK facade — production tools must not depend on node-sdk.
 */
import type { ToolHandlerContext as SdkCtx } from '../../../node-sdk/src/node-factory/define-tool-registrations/tool-handle.js';
import {
	assertTypeEqual,
	type ExpectEqual,
} from '../../../websocket-bridge/src/testing/expect-type.js';
import type { ToolHandlerContext as ToolsCtx } from './domain-tool-configs.js';

/** Domain handlers / shell bags satisfy the SDK identity facade. */
assertTypeEqual<ToolsCtx extends SdkCtx ? true : never>();

/** SDK identity is enough to call tools handlers (host hooks optional). */
assertTypeEqual<SdkCtx extends ToolsCtx ? true : never>();

assertTypeEqual<ExpectEqual<true, true>>();
