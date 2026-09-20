import type { EditorSettingsSnapshotPayload } from '@langflower/shared/types/langflower-editor.js';
import type { SessionStateSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap.js';
import type { LangflowerConfigService } from '../config/langflower-config.service.js';
import { redactLangflowerConfigForBridge } from '../config/redact-langflower-config.js';
import type { CustomNodeRegistry } from '../palette/custom-node-registry.js';
import { withSkillsCatalog } from '../skills/with-skills-catalog.js';
import type { ResolveNodeDefinition } from '../workflow/workflow-document.js';
import { buildSelectedNodePayload } from './build-selected-node-payload.js';
import { LangflowerSession } from './langflower-session.js';

/** Empty effective providers → open Global Settings for bootstrap onboarding. */
export const settingsAsideForEffectiveConfig = (
	provider: Readonly<Record<string, unknown>> | undefined,
	current: EditorSettingsSnapshotPayload,
): EditorSettingsSnapshotPayload => {
	if (Object.keys(provider ?? {}).length === 0) {
		return { open: true, scope: 'global' };
	}
	return current;
};

export async function buildSessionBootstrap(
	session: LangflowerSession,
	langflowerConfigService: LangflowerConfigService,
	resolveDefinition: ResolveNodeDefinition,
	projectDir: string,
	customNodeRegistry: CustomNodeRegistry,
): Promise<SessionStateSnapshotPayload> {
	const langflowerConfig = redactLangflowerConfigForBridge(
		await withSkillsCatalog(
			projectDir,
			await langflowerConfigService.read(),
		),
	);

	session.settings = settingsAsideForEffectiveConfig(
		langflowerConfig.provider,
		session.settings,
	);

	return {
		version: LangflowerSession.snapshotVersion,
		langflowerConfig,
		dividerPositions: session.dividerPositions,
		paletteVisible: session.paletteVisible,
		selectedNode: buildSelectedNodePayload(
			session,
			resolveDefinition,
			customNodeRegistry,
		).node,
		settings: session.settings,
	};
}
