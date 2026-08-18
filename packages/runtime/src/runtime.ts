import { RuntimeEditor } from './runtime-editor.js';
import { RuntimeRunner } from './runtime-runner.js';
import type { RuntimeOptions } from './types.js';

export { bypassOutputPortId, parseBypassOutputPortId } from './bypass-ports.js';
export { RuntimeEditor } from './runtime-editor.js';
export { graphHasCycle } from './runtime-helpers.js';
export type { GraphCluster } from './runtime-helpers.js';
export { RuntimeRunner } from './runtime-runner.js';
export type {
	MetaFromStatefulObservable,
	NodeId,
	EdgeId,
	RunId,
	PortMeta,
	RuntimeEdge,
	RuntimeEditorApi,
	RuntimeFeedPortMeta,
	RuntimeFeedRole,
	PortTelemetry,
	RuntimeDoneTelemetry,
	RuntimeNode,
	RuntimeResumeOptions,
	RuntimeRunnerApi,
	RuntimeRunnerEvent,
	RuntimeRunnerStatus,
	RuntimeSeedPortValue,
	RuntimeWireType,
	SwapNodeResult,
} from './types.js';
export {
	isPortErrorTelemetry,
	isPortPendingTelemetry,
	isPortTelemetry,
	isPortValueTelemetry,
	isRuntimeDone,
} from './types.js';
export type { RuntimeOptions };
export type { ResponseDto } from '@rx-evo/stateful-observable';

export class RuntimeFacade {
	readonly editor: RuntimeEditor;
	readonly runner: RuntimeRunner;

	constructor(options: RuntimeOptions = {}) {
		this.editor = new RuntimeEditor();
		this.runner = new RuntimeRunner(this.editor, options);
	}
}
