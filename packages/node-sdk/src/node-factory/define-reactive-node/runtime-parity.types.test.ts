/**
 * Contract: SDK port / instance shapes stay structurally aligned with
 * `@langflower/runtime` ([ADR-027](../../../../../docs/ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep)).
 * Test-only relative imports.
 */
import type {
	PortMeta as RuntimePortMeta,
	RuntimeNode,
	RuntimeWireType,
} from '../../../../runtime/src/types.js';
import {
	assertTypeEqual,
	type ExpectEqual,
} from '../../../../websocket-bridge/src/testing/expect-type.js';
import type {
	PortMeta as SdkPortMeta,
	WireType as SdkWireType,
} from './port-meta.js';
import type { ReactiveNodeInstance } from './types.js';

/** Wire brand must match so bypass maps assign both ways. */
assertTypeEqual<ExpectEqual<SdkWireType, RuntimeWireType>>();

/** Port meta must be identical (not merely one-way assignable). */
assertTypeEqual<ExpectEqual<SdkPortMeta, RuntimePortMeta>>();

type SdkInstanceCore = Omit<ReactiveNodeInstance, 'ctxConnection'>;

type RuntimeInstanceCore = Omit<RuntimeNode, 'nodeId' | 'bypassConnections'>;

/** getInstance() fields (sans ctxConnection) ↔ RuntimeNode (sans editor fields). */
assertTypeEqual<SdkInstanceCore extends RuntimeInstanceCore ? true : never>();
assertTypeEqual<RuntimeInstanceCore extends SdkInstanceCore ? true : never>();

/**
 * Shape passed into `RuntimeEditor.addNode` from a live SDK instance.
 * `nodeId` is supplied by the host; ports come from getInstance().
 */
type AddNodeFromSdk = {
	readonly nodeId: RuntimeNode['nodeId'];
	readonly inputs: ReactiveNodeInstance['inputs'];
	readonly outputs: ReactiveNodeInstance['outputs'];
	readonly bypassPorts: ReactiveNodeInstance['bypassPorts'];
};

type AddNodeRuntime = {
	readonly nodeId: RuntimeNode['nodeId'];
	readonly inputs: RuntimeNode['inputs'];
	readonly outputs: RuntimeNode['outputs'];
	readonly bypassPorts: RuntimeNode['bypassPorts'];
};

assertTypeEqual<AddNodeFromSdk extends AddNodeRuntime ? true : never>();
assertTypeEqual<AddNodeRuntime extends AddNodeFromSdk ? true : never>();

assertTypeEqual<ExpectEqual<true, true>>();
