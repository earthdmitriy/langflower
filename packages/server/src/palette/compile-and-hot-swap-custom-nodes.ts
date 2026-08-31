import type { CustomPaletteSnapshotPayload } from '@langflower/shared/langflower.js';
import { swapCustomNodesInEditor } from '../workflow/apply-editor-mutation.js';
import { refreshLiveWiredToolPacks } from '../bridge/get-live-wired-tools.js';
import { bridgeEmit } from '../bridge/bridge-outbound.js';
import type { LangflowerBridge } from '../bridge/langflower-bridge.types.js';
import type { ServerContext } from '../server-context.js';
import type { LangflowerSession } from '../session/langflower-session.js';

/**
 * One composer for Custom → Update and `compile_custom_nodes` (via bus
 * intent `customPalette.update.requested`): compile, registry, live swap,
 * then palette snapshot (and deleteEdges if ports vanished).
 */
export const compileAndHotSwapCustomNodes = async (
	session: LangflowerSession,
	context: ServerContext,
	bridge: LangflowerBridge,
	options?: { readonly force?: boolean },
): Promise<CustomPaletteSnapshotPayload> => {
	bridgeEmit(
		bridge,
		'customPalette.snapshot',
		context.customPaletteService.compilingSnapshot(),
	);

	const { snapshot } = await context.customPaletteService.update(
		context.projectDir,
		{ force: options?.force === true },
	);
	const customTypes = new Set(snapshot.nodes.map((node) => node.type));
	const droppedEdges = swapCustomNodesInEditor(
		session,
		context.projectDir,
		context.resolveDefinition,
		customTypes,
	);
	refreshLiveWiredToolPacks(session);

	if (droppedEdges.length > 0) {
		bridgeEmit(bridge, 'editor.deleteEdges', droppedEdges);
		bridgeEmit(bridge, 'workflow.currentStatus.snapshot', {
			status: session.currentStatus,
		});
	}

	bridgeEmit(bridge, 'customPalette.snapshot', snapshot);

	return snapshot;
};
