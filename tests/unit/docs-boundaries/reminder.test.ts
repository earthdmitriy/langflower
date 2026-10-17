import { describe, expect, it } from 'vitest';
import {
	RULE_IDS,
	formatReminder,
	type Finding,
	type RuleId,
} from './reminder.js';

const SAMPLES: Record<RuleId, Finding> = {
	links: {
		ruleId: 'links',
		trigger: 'docs/guide.md -> missing.md',
		triggerKind: 'fact',
		docs: ['docs/guide.md'],
		steps: ['Fix the relative link so the file and anchor exist.'],
	},
	'code-refs': {
		ruleId: 'code-refs',
		trigger: 'packages/server/src/app.ts cites docs/missing.md',
		triggerKind: 'fact',
		docs: ['docs/guides/writing-docs.md', 'docs/missing.md'],
		steps: ['Point the docs/ citation at a file that exists.'],
	},
	'link-direction': {
		ruleId: 'link-direction',
		trigger: 'docs/product/a.md links into docs/_work/',
		triggerKind: 'fact',
		docs: ['docs/guides/writing-docs.md', 'docs/README.md'],
		steps: ['Remove the link into docs/_work/.'],
	},
	placement: {
		ruleId: 'placement',
		trigger: 'docs/NOTES.md sits directly in docs/',
		triggerKind: 'fact',
		docs: ['docs/README.md', 'docs/guides/writing-docs.md'],
		steps: ['Move the file into a layer directory.'],
	},
	frontmatter: {
		ruleId: 'frontmatter',
		trigger: 'docs/reference/app.md: dead covers glob src/missing/**',
		triggerKind: 'fact',
		docs: ['docs/reference/app.md', 'docs/guides/writing-docs.md'],
		steps: ['Replace the dead covers glob with one that matches a file.'],
	},
	reachable: {
		ruleId: 'reachable',
		trigger: 'docs/reference/orphan.md is not linked',
		triggerKind: 'fact',
		docs: ['docs/README.md', 'docs/reference/README.md'],
		steps: ['Link the file from docs/README.md or the layer index.'],
	},
	size: {
		ruleId: 'size',
		trigger: 'docs/adr/001-big.md is 30000 bytes',
		triggerKind: 'fact',
		docs: ['docs/adr/001-big.md', 'docs/guides/writing-docs.md'],
		steps: ['Split the ADR so it stays under 24576 bytes.'],
	},
	generated: {
		ruleId: 'generated',
		trigger: 'indexes missing until step 5',
		triggerKind: 'fact',
		docs: ['docs/adr/README.md', 'docs/bugs/README.md'],
		steps: [
			'Run `node build/tools/agent-run.mjs docs-gen` to regenerate indexes.',
		],
	},
	sync: {
		ruleId: 'sync',
		trigger: 'byte drift: .langflower/skills/helper/SKILL.md',
		triggerKind: 'fact',
		docs: ['packages/server/skeleton/skills/langflower-helper/layout.md'],
		steps: [
			'Run `node build/tools/agent-run.mjs docs-sync` ONLY after the user confirms dirty .langflower and demo-project copies may be overwritten.',
		],
	},
	'consistency:package-dag': {
		ruleId: 'consistency:package-dag',
		trigger: 'Dependency sketch differs from ALLOWED_WORKSPACE_DEPS',
		triggerKind: 'fact',
		docs: ['docs/architecture/NAVIGATION.md'],
		steps: [
			'Update the dependency sketch in docs/architecture/NAVIGATION.md.',
		],
	},
	'consistency:package-list': {
		ruleId: 'consistency:package-list',
		trigger: 'PACKAGE_DIRS name runtime is missing from docs/README.md',
		triggerKind: 'fact',
		docs: ['docs/README.md', 'docs/architecture/NAVIGATION.md'],
		steps: ['Mention runtime in docs/README.md.'],
	},
	'consistency:package-agents': {
		ruleId: 'consistency:package-agents',
		trigger: 'packages/runtime/AGENTS.md is missing',
		triggerKind: 'fact',
		docs: ['docs/README.md', 'packages/runtime/AGENTS.md'],
		steps: [
			'Create packages/runtime/AGENTS.md and register it in docs/README.md.',
		],
	},
	'consistency:node-docs': {
		ruleId: 'consistency:node-docs',
		trigger:
			'packages/common-nodes/src/flow/repeat contains node.ts and is missing NODE.md',
		triggerKind: 'fact',
		docs: [
			'docs/reference/NODES.md',
			'packages/common-nodes/src/flow/repeat/NODE.md',
		],
		steps: ['Add NODE.md beside node.ts. See docs/reference/NODES.md.'],
	},
	'consistency:agent-run-commands': {
		ruleId: 'consistency:agent-run-commands',
		trigger: 'COMMANDS key docs-gen is missing from commands.md',
		triggerKind: 'fact',
		docs: ['.cursor/skills/langflower-build/commands.md'],
		steps: [
			'Mention `docs-gen` in .cursor/skills/langflower-build/commands.md.',
		],
	},
	'consistency:adr-refs': {
		ruleId: 'consistency:adr-refs',
		trigger: 'an ADR mention does not resolve to a file or heading',
		triggerKind: 'fact',
		docs: ['docs/adr/README.md'],
		steps: ['Add the missing heading to docs/adr/README.md.'],
	},
	'consistency:skeleton-skills': {
		ruleId: 'consistency:skeleton-skills',
		trigger: 'Skeleton skill beta is not named in layout.md',
		triggerKind: 'fact',
		docs: ['packages/server/skeleton/skills/langflower-helper/layout.md'],
		steps: ['List beta in the helper layout.md.'],
	},
	'consistency:epic-index': {
		ruleId: 'consistency:epic-index',
		trigger: 'docs/TODO/EPICS/03-gap.md is not linked from the README',
		triggerKind: 'fact',
		docs: ['docs/TODO/EPICS/README.md', 'docs/TODO/EPICS/03-gap.md'],
		steps: ['Add a markdown link to 03-gap.md in the epic README.'],
	},
	freshness: {
		ruleId: 'freshness',
		trigger: 'packages/server/src/bootstrap/skeleton.ts',
		triggerKind: 'changed',
		docs: [
			'docs/reference/bootstrap.md',
			'docs/product/use-cases/skeleton-seed.md',
		],
		steps: [
			'Update the doc(s) above in this change.',
			'If behaviour and contracts are unchanged, add to the commit message:\n     Docs: none — <reason>',
		],
	},
};

describe('reminder contract', () => {
	for (const ruleId of RULE_IDS) {
		it(ruleId, () => {
			const finding = SAMPLES[ruleId];
			const text = formatReminder(finding);
			expect(text).toContain(`DOC REMINDER [${ruleId}]`);
			expect(text).toContain(finding.trigger);
			expect(text).toMatch(/Fact:|You changed:/);
			expect(finding.docs.length).toBeGreaterThan(0);
			expect(finding.steps.length).toBeGreaterThan(0);
			for (const doc of finding.docs) {
				expect(text).toContain(doc);
			}
			expect(text).toContain('Do one of:');
			expect(text).toContain(finding.steps[0]);
			expect(text).toContain('docs/guides/writing-docs.md#freshness');
		});
	}
});
