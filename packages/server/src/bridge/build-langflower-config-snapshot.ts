import type { LangflowerConfigSnapshotPayload } from '@langflower/shared/langflower.js';
import { mergeLangflowerConfigLayers } from '@langflower/shared/langflower.js';
import type { ServerContext } from '../server-context.js';
import { redactLangflowerConfigForBridge } from '../config/redact-langflower-config.js';
import { withSkillsCatalog } from '../skills/with-skills-catalog.js';

/**
 * Build the bridge config snapshot (effective + redacted layers + global path).
 */
export const buildLangflowerConfigSnapshot = async (
	context: ServerContext,
): Promise<LangflowerConfigSnapshotPayload> => {
	const layers = await context.langflowerConfigService.readLayers();
	const effective = mergeLangflowerConfigLayers(
		layers.global,
		layers.project,
	);
	const withSkills = await withSkillsCatalog(context.projectDir, effective);

	return {
		config: redactLangflowerConfigForBridge(withSkills),
		projectConfig: redactLangflowerConfigForBridge(layers.project),
		globalConfig: redactLangflowerConfigForBridge(layers.global),
		globalPath: context.langflowerConfigService.globalPath(),
		secretIds: await context.langflowerConfigService.listSecretIds(),
		secretsPath: context.langflowerConfigService.secretsPath(),
	};
};
