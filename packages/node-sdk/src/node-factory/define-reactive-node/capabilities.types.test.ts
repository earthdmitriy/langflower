/**
 * Compile-time: `requires` makes capability fields non-optional on bind ctx,
 * and omitted `requires` keeps them absent.
 */
import { map } from 'rxjs';
import {
	assertTypeEqual,
	type ExpectEqual,
} from '../../../../websocket-bridge/src/testing/expect-type.js';
import type { CapsFor } from './capabilities.js';
import { defineReactiveNode } from './define-reactive-node.js';
import type { ExecutionContext } from './types.js';

type ChatCaps = CapsFor<['chat']>;
type PlainCaps = CapsFor<[]>;

assertTypeEqual<
	ExpectEqual<'chat' extends keyof ChatCaps ? true : false, true>
>();
assertTypeEqual<
	ExpectEqual<undefined extends ChatCaps['chat'] ? true : false, false>
>();
assertTypeEqual<
	ExpectEqual<'chat' extends keyof PlainCaps ? true : false, false>
>();

type ChatCtx = ExecutionContext<readonly [], ChatCaps>;
type PlainCtx = ExecutionContext<readonly [], PlainCaps>;

assertTypeEqual<
	ExpectEqual<'chat' extends keyof ChatCtx ? true : false, true>
>();
assertTypeEqual<
	ExpectEqual<undefined extends ChatCtx['chat'] ? true : false, false>
>();
assertTypeEqual<
	ExpectEqual<'chat' extends keyof PlainCtx ? true : false, false>
>();

const withChat = defineReactiveNode({
	type: 'test-requires-chat',
	displayName: 'Requires chat',
	requires: ['chat'] as const,
	uiSchema: [] as const,
	bind(ctx, { configureOutput }) {
		const chat$ = ctx.pipeValue(
			map((ec) => {
				const factory: ChatCaps['chat'] = ec.chat;
				return factory;
			}),
		);
		return {
			inputs: [],
			outputs: [
				configureOutput('chat', chat$, {
					wireType: 'json',
				}),
			],
		};
	},
});

const withoutCaps = defineReactiveNode({
	type: 'test-requires-none',
	displayName: 'No requires',
	uiSchema: [] as const,
	bind(ctx, { configureOutput }) {
		const id$ = ctx.pipeValue(
			map((ec) => {
				type HasChat = 'chat' extends keyof typeof ec ? true : false;
				assertTypeEqual<ExpectEqual<HasChat, false>>();
				return ec.nodeId;
			}),
		);
		return {
			inputs: [],
			outputs: [
				configureOutput('id', id$, {
					wireType: 'string',
				}),
			],
		};
	},
});

void withChat.requires;
void withoutCaps.requires;
