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
	RuntimeInputReceivedEvent,
	RuntimeNode,
	RuntimeOutputEmittedEvent,
	RuntimePortSignalState,
	RuntimeResumeOptions,
	RuntimeRunnerApi,
	RuntimeRunnerEvent,
	RuntimeRunnerStatus,
	RuntimeSeedPortValue,
	RuntimeWireType,
} from './types.js';
export type { RuntimeOptions };

export class RuntimeFacade {
	readonly editor: RuntimeEditor;
	readonly runner: RuntimeRunner;

	constructor(options: RuntimeOptions = {}) {
		this.editor = new RuntimeEditor();
		this.runner = new RuntimeRunner(this.editor, options);
	}
}
