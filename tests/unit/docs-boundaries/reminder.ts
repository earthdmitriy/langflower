/**
 * Reminder text is the product of the docs-boundaries suite.
 * Every failure an agent sees must name the rule, the trigger,
 * a concrete doc path, one resolution step, and the freshness guide.
 */

export const WRITING_DOCS_GUIDE = 'docs/guides/writing-docs.md#freshness';

export const RULE_IDS = [
	'links',
	'code-refs',
	'link-direction',
	'placement',
	'frontmatter',
	'reachable',
	'size',
	'generated',
	'sync',
	'consistency:package-dag',
	'consistency:package-list',
	'consistency:package-agents',
	'consistency:node-docs',
	'consistency:agent-run-commands',
	'consistency:adr-refs',
	'consistency:skeleton-skills',
	'consistency:epic-index',
	'freshness',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export type TriggerKind = 'changed' | 'fact';

export type Finding = {
	readonly ruleId: string;
	readonly trigger: string;
	readonly triggerKind: TriggerKind;
	readonly docs: readonly string[];
	readonly steps: readonly string[];
};

export const makeFinding = (
	ruleId: string,
	trigger: string,
	docs: readonly string[],
	steps: readonly string[],
	triggerKind: TriggerKind = 'fact',
): Finding => ({
	ruleId,
	trigger,
	triggerKind,
	docs,
	steps,
});

const DOC_LABEL = 'Docs covering: ';

export const formatReminder = (finding: Finding): string => {
	const lead =
		finding.triggerKind === 'changed'
			? `You changed: ${finding.trigger}`
			: `Fact: ${finding.trigger}`;
	const docLines = finding.docs.map((doc, index) =>
		index === 0
			? `${DOC_LABEL}${doc}`
			: `${' '.repeat(DOC_LABEL.length)}${doc}`,
	);
	const stepLines = finding.steps.map(
		(step, index) => `  ${index + 1}. ${step}`,
	);
	return [
		`DOC REMINDER [${finding.ruleId}]`,
		lead,
		...docLines,
		'Do one of:',
		...stepLines,
		`Guide: ${WRITING_DOCS_GUIDE}`,
	].join('\n');
};
