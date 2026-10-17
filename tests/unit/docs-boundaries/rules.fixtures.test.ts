import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatReminder, type Finding } from './reminder.js';
import {
	commandKeys,
	matrixEdgeSet,
	parseDependencySketch,
	checkAdrRefs,
	checkAgentRunCommands,
	checkEpicIndex,
	checkNodeDocs,
	checkPackageAgents,
	checkPackageDag,
	checkPackageList,
	checkSkeletonSkills,
} from './rules/consistency.js';
import {
	checkFreshness,
	freshnessMessages,
	isFreshnessSkip,
} from './rules/freshness.js';
import { checkGenerated, checkSync } from './rules/generated.js';
import {
	checkFrontmatter,
	checkPlacement,
	checkReachable,
	checkSize,
} from './rules/layout.js';
import {
	checkCodeRefs,
	checkLinkDirection,
	checkLinks,
} from './rules/links.js';
import {
	compileGlob,
	extractAnchors,
	headingSlug,
	parseFrontmatter,
} from './scan.js';

const REPO = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const DOCS_GEN = path.join(REPO, 'build/docs-gen.mjs');

const withTemp = (run: (root: string) => void): void => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-docs-'));
	try {
		run(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
};

const write = (root: string, rel: string, text: string): void => {
	const abs = path.join(root, rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, text);
};

const expectPass = (findings: readonly Finding[]): void => {
	expect(findings.map(formatReminder)).toEqual([]);
};

const expectFail = (findings: readonly Finding[], ruleId: string): void => {
	const lines = findings.map(formatReminder);
	expect(lines.length).toBeGreaterThan(0);
	for (const line of lines) {
		expect(line).toContain(`DOC REMINDER [${ruleId}]`);
		expect(line).toMatch(/Fact:|You changed:/);
		expect(line).toContain('Do one of:');
		expect(line).toMatch(/\n {2}1\. /);
		expect(line).toContain('docs/guides/writing-docs.md#freshness');
	}
};

const page = (kind: string, body = ''): string =>
	`---\nkind: ${kind}\nowner: docs\ncovers: []\nstatus: current\n---\n\n# ${kind}\n${body}`;

const git = (root: string, args: readonly string[]): void => {
	const result = spawnSync('git', args, {
		cwd: root,
		encoding: 'utf8',
		windowsHide: true,
	});
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`,
		);
	}
};

const initRepo = (root: string): void => {
	const created = spawnSync('git', ['init', '-b', 'main'], {
		cwd: root,
		encoding: 'utf8',
		windowsHide: true,
	});
	if (created.status !== 0) {
		git(root, ['init']);
		git(root, ['checkout', '-b', 'main']);
	}
};

const commitAll = (root: string, message: string): void => {
	git(root, ['add', '-A']);
	git(root, [
		'-c',
		'user.email=docs-boundaries@example.com',
		'-c',
		'user.name=Docs Boundaries',
		'commit',
		'-m',
		message,
	]);
};

const sketch = (edges: readonly string[]): string => {
	const lines = edges.map((edge) => {
		const [dep, consumer] = edge.split('→');
		return `${dep} → ${consumer}`;
	});
	return `# Nav\n\n\`\`\`text\n${lines.join('\n')}\n\`\`\`\n`;
};

describe('frontmatter parser and slugs', () => {
	it('parses scalars, lists, and CRLF', () => {
		const text = [
			'---',
			'kind: guide',
			'owner: docs',
			'covers:',
			"  - 'tests/unit/docs-boundaries/**'",
			'status: current',
			'---',
			'',
			'# Title',
		].join('\r\n');
		const parsed = parseFrontmatter(text);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.data.kind).toBe('guide');
			expect(parsed.data.covers).toEqual([
				'tests/unit/docs-boundaries/**',
			]);
		}
	});

	it('parses an inline list', () => {
		const parsed = parseFrontmatter(
			'---\nkind: reference\ncovers: [\'src/a.ts\', "src/b.ts"]\n---\n',
		);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.data.covers).toEqual(['src/a.ts', 'src/b.ts']);
		}
	});

	it('reports missing and unparseable frontmatter without throwing', () => {
		expect(parseFrontmatter('# Hello\n').ok).toBe(false);
		const bad = parseFrontmatter('---\n: nope\n---\n');
		expect(bad.ok).toBe(false);
		if (!bad.ok) {
			expect(bad.line).toBeGreaterThan(0);
		}
	});

	it('builds GitHub slugs, duplicate suffixes, and explicit ids', () => {
		expect(headingSlug('ADR-027 — author sdk')).toBe('adr-027--author-sdk');
		expect(extractAnchors('# A\n# A\n<a id="freshness"></a>\n')).toEqual([
			'a',
			'a-1',
			'freshness',
		]);
	});

	it('matches ** globs against nested files', () => {
		const glob = compileGlob('packages/server/src/bootstrap/**');
		expect(glob.test('packages/server/src/bootstrap/skeleton.ts')).toBe(
			true,
		);
		expect(glob.test('packages/server/src/other.ts')).toBe(false);
	});

	it('parses the real NAVIGATION dependency sketch', () => {
		const text = fs.readFileSync(
			path.join(REPO, 'docs/architecture/NAVIGATION.md'),
			'utf8',
		);
		const parsed = parseDependencySketch(text);
		expect(parsed.ok).toBe(true);
	});

	it('reads COMMANDS keys from agent-run', () => {
		const source = fs.readFileSync(
			path.join(REPO, 'build/tools/agent-run.mjs'),
			'utf8',
		);
		const keys = commandKeys(source);
		expect(keys).toContain('docs-gen');
		expect(keys).toContain('docs-sync');
		expect(keys).toContain('typecheck');
	});
});

describe('links', () => {
	it('passes when relative links and anchors resolve', () => {
		withTemp((root) => {
			write(root, 'docs/a.md', '# Hello\n\nSee [other](b.md#world).\n');
			write(root, 'docs/b.md', '# World\n');
			expectPass(checkLinks(root));
		});
	});

	it('fails when a link or anchor does not resolve', () => {
		withTemp((root) => {
			write(root, 'docs/a.md', '# Hello\n\nSee [x](b.md#missing).\n');
			write(root, 'docs/b.md', '# World\n');
			expectFail(checkLinks(root), 'links');
		});
	});

	it('ignores a broken link inside docs/_archive', () => {
		withTemp((root) => {
			write(root, 'docs/_archive/old.md', 'See [gone](missing.md).\n');
			expectPass(checkLinks(root));
		});
	});

	it('fails a broken link inside docs/_work', () => {
		withTemp((root) => {
			write(root, 'docs/_work/plan.md', 'See [gone](missing.md).\n');
			expectFail(checkLinks(root), 'links');
		});
	});

	it('fails a broken link inside docs/reference', () => {
		withTemp((root) => {
			write(root, 'docs/reference/live.md', 'See [gone](missing.md).\n');
			expectFail(checkLinks(root), 'links');
		});
	});

	it('fails a broken link inside a package doc', () => {
		withTemp((root) => {
			write(
				root,
				'packages/runtime/note.md',
				'See [gone](missing.md).\n',
			);
			expectFail(checkLinks(root), 'links');
		});
	});
});

describe('code-refs', () => {
	it('passes when a docs/ citation exists', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', '# Docs\n');
			write(root, 'src/note.ts', '// see docs/README.md\n');
			expectPass(checkCodeRefs(root));
		});
	});

	it('fails when a docs/ citation is missing', () => {
		withTemp((root) => {
			write(root, 'src/note.ts', '// see docs/missing.md\n');
			expectFail(checkCodeRefs(root), 'code-refs');
		});
	});

	it('ignores a fenced NNN path and still fails a real missing path', () => {
		withTemp((root) => {
			write(
				root,
				'docs/guides/writing-docs.md',
				[
					'# Guide',
					'',
					'```markdown',
					'File: docs/adr/NNN-slug.md',
					'```',
					'',
					'Template: `docs/adr/NNN-slug.md`.',
					'Lives at `docs/product/features/<name>.md`.',
					'',
					'See docs/missing-real.md for the gap.',
					'',
				].join('\n'),
			);
			const findings = checkCodeRefs(root);
			expectFail(findings, 'code-refs');
			const text = findings.map(formatReminder).join('\n');
			expect(text).toContain('docs/missing-real.md');
			expect(text).not.toContain('NNN-slug');
			expect(text).not.toContain('<name>');
		});
	});

	it('ignores a docs/ citation that has no file extension', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', '# Docs\n');
			write(
				root,
				'src/note.ts',
				[
					'// see docs/catalog and docs/layers',
					'// see docs/missing.md',
					'',
				].join('\n'),
			);
			const findings = checkCodeRefs(root);
			expectFail(findings, 'code-refs');
			const text = findings.map(formatReminder).join('\n');
			expect(text).toContain('docs/missing.md');
			expect(text).not.toContain('docs/catalog');
			expect(text).not.toContain('docs/layers');
		});
	});

	it('ignores a broken citation in docs/_archive and test files', () => {
		withTemp((root) => {
			write(root, 'docs/_archive/old.md', 'See docs/missing.md.\n');
			write(
				root,
				'packages/runtime/note.test.ts',
				'// see docs/missing.md\n',
			);
			expectPass(checkCodeRefs(root));
		});
	});

	it('fails a broken citation inside docs/_work', () => {
		withTemp((root) => {
			write(root, 'docs/_work/plan.md', 'See docs/missing.md.\n');
			expectFail(checkCodeRefs(root), 'code-refs');
		});
	});

	it('fails a broken citation in synced skill copies', () => {
		withTemp((root) => {
			write(root, '.langflower/skills/note.md', 'See docs/missing.md.\n');
			write(root, 'demo-project/README.md', 'See docs/missing.md.\n');
			expectFail(checkCodeRefs(root), 'code-refs');
		});
	});

	it('fails a broken citation inside docs/reference', () => {
		withTemp((root) => {
			write(root, 'docs/reference/live.md', 'See docs/missing.md.\n');
			expectFail(checkCodeRefs(root), 'code-refs');
		});
	});

	it('fails a broken citation in package source', () => {
		withTemp((root) => {
			write(root, 'packages/runtime/note.ts', '// see docs/missing.md\n');
			expectFail(checkCodeRefs(root), 'code-refs');
		});
	});

	it('fails a broken citation in a planning note and a move map', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', '# Docs\n');
			write(
				root,
				'docs/_work/TODO/EPICS/50-decisions.md',
				'See docs/missing.md and docs/adr/README.md.\n',
			);
			write(
				root,
				'build/tools/doc-move-map.json',
				'{ "from": "docs/gone.md" }\n',
			);
			expectFail(checkCodeRefs(root), 'code-refs');
		});
	});
});

describe('link-direction', () => {
	it('passes for allowed targets and archive-internal links', () => {
		withTemp((root) => {
			write(
				root,
				'docs/product/a.md',
				`${page('product')}\nSee [ref](../reference/b.md).\n`,
			);
			write(root, 'docs/reference/b.md', page('reference'));
			write(root, 'docs/_archive/old.md', 'See [older](older.md).\n');
			write(root, 'docs/_archive/older.md', '# Older\n');
			expectPass(checkLinkDirection(root));
		});
	});

	it('fails when guides link into _work', () => {
		withTemp((root) => {
			write(
				root,
				'docs/guides/g.md',
				`${page('guide')}\nSee [plan](../_work/todo.md).\n`,
			);
			write(root, 'docs/_work/todo.md', page('work'));
			expectFail(checkLinkDirection(root), 'link-direction');
		});
	});
});

describe('placement', () => {
	it('passes on a tree that already follows the layout', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', page('index'));
			write(root, 'docs/product/p.md', page('product'));
			write(root, 'docs/architecture/a.md', page('architecture'));
			write(root, 'docs/reference/r.md', page('reference'));
			write(root, 'docs/guides/g.md', page('guide'));
			write(root, 'docs/adr/001.md', page('adr'));
			write(root, 'docs/bugs/b.md', page('bug'));
			write(root, 'docs/_work/w.md', page('work'));
			write(root, 'docs/assets/a.md', page('asset'));
			write(root, 'docs/_archive/old.md', '# History\n');
			expectPass(checkPlacement(root));
		});
	});

	it('fails for markdown directly in docs/', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', page('index'));
			write(root, 'docs/NOTES.md', '# Notes\n');
			expectFail(checkPlacement(root), 'placement');
		});
	});
});

describe('frontmatter', () => {
	it('passes a CRLF file whose covers glob matches', () => {
		withTemp((root) => {
			write(root, 'src/app.ts', 'export const value = 1;\n');
			write(
				root,
				'docs/reference/app.md',
				[
					'---',
					'kind: reference',
					'owner: server',
					'covers:',
					"  - 'src/**'",
					'status: current',
					'---',
					'',
					'# App',
				].join('\r\n'),
			);
			expectPass(checkFrontmatter(root));
		});
	});

	it('fails a dead covers glob', () => {
		withTemp((root) => {
			write(
				root,
				'docs/reference/app.md',
				`${page('reference').replace('covers: []', "covers:\n  - 'missing/**'")}`,
			);
			expectFail(checkFrontmatter(root), 'frontmatter');
		});
	});

	it('fails a bad kind enum', () => {
		withTemp((root) => {
			write(
				root,
				'docs/reference/app.md',
				page('reference').replace('kind: reference', 'kind: nope'),
			);
			expectFail(checkFrontmatter(root), 'frontmatter');
		});
	});

	it('fails empty covers on architecture, reference, and guides', () => {
		withTemp((root) => {
			write(root, 'docs/reference/app.md', page('reference'));
			write(root, 'docs/architecture/shape.md', page('architecture'));
			write(root, 'docs/guides/other.md', page('guide'));
			expectFail(checkFrontmatter(root), 'frontmatter');
		});
	});

	it('allows empty covers on pure process guides', () => {
		withTemp((root) => {
			write(root, 'docs/guides/writing-docs.md', page('guide'));
			write(root, 'docs/guides/REFACTORING.md', page('guide'));
			write(root, 'docs/product/story.md', page('product'));
			expectPass(checkFrontmatter(root));
		});
	});

	it('fails a package NODE.md with no frontmatter', () => {
		withTemp((root) => {
			write(
				root,
				'packages/common-nodes/src/flow/loop/NODE.md',
				'# Loop\n',
			);
			expectFail(checkFrontmatter(root), 'frontmatter');
		});
	});

	it('passes a package NODE.md whose covers glob matches', () => {
		withTemp((root) => {
			write(
				root,
				'packages/common-nodes/src/flow/loop/node.ts',
				'export const node = 1;\n',
			);
			write(
				root,
				'packages/common-nodes/src/flow/loop/NODE.md',
				[
					'---',
					'kind: guide',
					'owner: common-nodes',
					'covers:',
					"  - 'packages/common-nodes/src/flow/loop/**'",
					'status: current',
					'---',
					'',
					'# Loop',
				].join('\n'),
			);
			expectPass(checkFrontmatter(root));
		});
	});
});

describe('reachable', () => {
	it('passes when the router and a layer index link the docs', () => {
		withTemp((root) => {
			write(
				root,
				'docs/README.md',
				`${page('index')}\nSee [a](product/a.md).\n`,
			);
			write(
				root,
				'docs/product/README.md',
				`${page('index')}\nSee [b](b.md).\n`,
			);
			write(root, 'docs/product/a.md', page('product'));
			write(root, 'docs/product/b.md', page('product'));
			expectPass(checkReachable(root));
		});
	});

	it('fails an orphan doc', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', page('index'));
			write(root, 'docs/product/orphan.md', page('product'));
			expectFail(checkReachable(root), 'reachable');
		});
	});
});

describe('size', () => {
	it('passes a small doc and an oversized archive file', () => {
		withTemp((root) => {
			write(root, 'docs/product/a.md', page('product'));
			write(
				root,
				'docs/_archive/huge.md',
				`${'# Old\n'}${'x'.repeat(50_000)}`,
			);
			expectPass(checkSize(root));
		});
	});

	it('fails an adr above 24576 bytes', () => {
		withTemp((root) => {
			write(
				root,
				'docs/adr/big.md',
				`${page('adr')}${'x'.repeat(30_000)}`,
			);
			expectFail(checkSize(root), 'size');
		});
	});

	it('warns between 24KB and 40KB without failing', () => {
		withTemp((root) => {
			write(
				root,
				'docs/guides/wide.md',
				`${page('guide')}${'x'.repeat(30_000)}`,
			);
			const warnings: string[] = [];
			const original = console.warn;
			console.warn = (...args: unknown[]) => {
				warnings.push(args.map((arg) => String(arg)).join(' '));
			};
			try {
				expectPass(checkSize(root));
			} finally {
				console.warn = original;
			}
			expect(
				warnings.some((line) => line.includes('DOC REMINDER [size]')),
			).toBe(true);
		});
	});
});

describe('generated', () => {
	it('passes after docs-gen write on a temp tree', () => {
		withTemp((root) => {
			write(
				root,
				'docs/adr/001-sample.md',
				`${page('adr', 'id: ADR-001\nsupersedes: []\nsuperseded-by: []\npackage: docs\n')}`.replace(
					'# adr',
					'# ADR-001 — Sample',
				),
			);
			write(
				root,
				'docs/bugs/BUG-2026-10-16-sample.md',
				page(
					'bug',
					'date: 2026-10-16\nflaw: state-ownership\npackage: server\nfixed: yes\n',
				),
			);
			write(
				root,
				'docs/README.md',
				`${page('index')}\n<!-- package-local-registry:start -->\nplaceholder\n<!-- package-local-registry:end -->\n`,
			);
			const wrote = spawnSync(
				process.execPath,
				[DOCS_GEN, '--root', root],
				{
					encoding: 'utf8',
					windowsHide: true,
				},
			);
			expect(wrote.status, wrote.stderr || wrote.stdout).toBe(0);
			expectPass(checkGenerated(root));
		});
	});

	it('fails when adr and bugs indexes are missing', () => {
		withTemp((root) => {
			write(root, 'docs/README.md', page('index'));
			const findings = checkGenerated(root);
			expectFail(findings, 'generated');
			expect(findings.map(formatReminder).join('\n')).toContain(
				'indexes missing until step 5',
			);
			expect(findings.map(formatReminder).join('\n')).toContain(
				'node build/tools/agent-run.mjs docs-gen',
			);
		});
	});
});

describe('sync', () => {
	const skill = (text: string) => text;

	it('passes when both copies match the skeleton', () => {
		withTemp((root) => {
			const body = skill('# Helper\n');
			write(root, 'packages/server/skeleton/skills/alpha/SKILL.md', body);
			write(root, 'demo-project/.langflower/skills/alpha/SKILL.md', body);
			write(root, '.langflower/skills/alpha/SKILL.md', body);
			expectPass(checkSync(root));
		});
	});

	it('fails when a dogfood copy drifts', () => {
		withTemp((root) => {
			write(
				root,
				'packages/server/skeleton/skills/alpha/SKILL.md',
				'# Helper\n',
			);
			write(
				root,
				'demo-project/.langflower/skills/alpha/SKILL.md',
				'# Helper!\n',
			);
			write(root, '.langflower/skills/alpha/SKILL.md', '# Helper\n');
			const findings = checkSync(root);
			expectFail(findings, 'sync');
			expect(findings.map(formatReminder).join('\n')).toContain(
				'ONLY after the user confirms',
			);
		});
	});
});

describe('consistency:package-dag', () => {
	it('passes when the sketch matches the matrix', () => {
		withTemp((root) => {
			write(
				root,
				'docs/architecture/NAVIGATION.md',
				sketch([...matrixEdgeSet()].sort()),
			);
			expectPass(checkPackageDag(root));
		});
	});

	it('fails when an edge is missing', () => {
		withTemp((root) => {
			write(
				root,
				'docs/architecture/NAVIGATION.md',
				sketch(['tools→eval']),
			);
			const findings = checkPackageDag(root);
			expectFail(findings, 'consistency:package-dag');
			expect(findings.map(formatReminder).join('\n')).toContain(
				'docs/architecture/NAVIGATION.md',
			);
		});
	});
});

describe('consistency:package-list', () => {
	const both = (root: string, omit?: string): void => {
		const lines = [
			'# Nav',
			...[
				'runtime',
				'websocket-bridge',
				'node-sdk',
				'compiler',
				'tools',
				'shared',
				'common-nodes',
				'server',
				'ui',
				'eval',
				'langflower-mcp',
				'cli',
			]
				.filter((name) => name !== omit)
				.map((name) => `packages/${name}`),
		];
		write(root, 'docs/architecture/NAVIGATION.md', `${lines.join('\n')}\n`);
		write(root, 'docs/README.md', `${lines.join('\n')}\n`);
	};

	it('passes when every package dir is named', () => {
		withTemp((root) => {
			both(root);
			expectPass(checkPackageList(root));
		});
	});

	it('fails when the router omits a package', () => {
		withTemp((root) => {
			both(root);
			const readme = fs.readFileSync(
				path.join(root, 'docs/README.md'),
				'utf8',
			);
			fs.writeFileSync(
				path.join(root, 'docs/README.md'),
				readme.replace('packages/websocket-bridge\n', ''),
			);
			expectFail(checkPackageList(root), 'consistency:package-list');
		});
	});
});

describe('consistency:package-agents', () => {
	const dirs = [
		'runtime',
		'websocket-bridge',
		'node-sdk',
		'compiler',
		'tools',
		'shared',
		'common-nodes',
		'server',
		'ui',
		'eval',
		'langflower-mcp',
		'cli',
	];

	it('passes when every AGENTS.md exists and is registered', () => {
		withTemp((root) => {
			const lines = dirs.map((dir) => `packages/${dir}/AGENTS.md`);
			for (const line of lines) {
				write(root, line, '# Agents\n');
			}
			write(root, 'docs/README.md', `${lines.join('\n')}\n`);
			expectPass(checkPackageAgents(root));
		});
	});

	it('fails when runtime has no AGENTS.md', () => {
		withTemp((root) => {
			const lines: string[] = [];
			for (const dir of dirs) {
				if (dir === 'runtime') {
					continue;
				}
				const rel = `packages/${dir}/AGENTS.md`;
				write(root, rel, '# Agents\n');
				lines.push(rel);
			}
			write(root, 'docs/README.md', `${lines.join('\n')}\n`);
			const findings = checkPackageAgents(root);
			expectFail(findings, 'consistency:package-agents');
			const text = findings.map(formatReminder).join('\n');
			expect(text).toContain('Create packages/runtime/AGENTS.md');
			expect(text).toContain('register');
		});
	});
});

describe('consistency:node-docs', () => {
	it('passes when NODE.md sits beside node.ts', () => {
		withTemp((root) => {
			write(
				root,
				'packages/common-nodes/src/flow/loop/node.ts',
				'export const node = {};\n',
			);
			write(
				root,
				'packages/common-nodes/src/flow/loop/NODE.md',
				'# Loop\n',
			);
			expectPass(checkNodeDocs(root));
		});
	});

	it('fails when node.ts has no NODE.md', () => {
		withTemp((root) => {
			write(
				root,
				'packages/common-nodes/src/flow/repeat/node.ts',
				'export const node = {};\n',
			);
			const findings = checkNodeDocs(root);
			expectFail(findings, 'consistency:node-docs');
			const text = findings.map(formatReminder).join('\n');
			expect(text).toContain('docs/reference/NODES.md');
			expect(text).toContain('packages/common-nodes/src/flow/repeat');
		});
	});
});

describe('consistency:agent-run-commands', () => {
	const source = `const COMMANDS = {\n\talpha: 'alpha.mjs',\n\tbeta: 'beta.mjs',\n};\n`;

	it('passes when every key is mentioned', () => {
		withTemp((root) => {
			write(root, 'build/tools/agent-run.mjs', source);
			write(
				root,
				'.cursor/skills/langflower-build/commands.md',
				'Use alpha and beta.\n',
			);
			expectPass(checkAgentRunCommands(root));
		});
	});

	it('fails when a key is undocumented', () => {
		withTemp((root) => {
			write(root, 'build/tools/agent-run.mjs', source);
			write(
				root,
				'.cursor/skills/langflower-build/commands.md',
				'Use alpha only.\n',
			);
			expectFail(
				checkAgentRunCommands(root),
				'consistency:agent-run-commands',
			);
		});
	});
});

describe('consistency:adr-refs', () => {
	it('passes via a monolith heading when docs/adr has no numbered files', () => {
		withTemp((root) => {
			write(
				root,
				'docs/adr/README.md',
				'# Decisions\n\n## ADR-004 — Sample\n',
			);
			write(root, 'src/note.ts', '// see ADR-004\n');
			expectPass(checkAdrRefs(root));
		});
	});

	it('fails a mention with no heading and no file', () => {
		withTemp((root) => {
			write(root, 'docs/adr/README.md', '# Decisions\n');
			write(root, 'src/note.ts', '// see ADR-999\n');
			const findings = checkAdrRefs(root);
			expectFail(findings, 'consistency:adr-refs');
			expect(findings.map(formatReminder).join('\n')).toContain(
				'docs/adr/README.md',
			);
		});
	});

	it('resolves to numbered files and does not fall back to the monolith', () => {
		withTemp((root) => {
			write(root, 'docs/adr/004-sample.md', '# ADR-004 — Sample\n');
			write(
				root,
				'docs/adr/README.md',
				'## ADR-005 — Only in the monolith\n',
			);
			write(
				root,
				'src/note.ts',
				'// ADR-004 is filed\n// ADR-005 is not\n',
			);
			const findings = checkAdrRefs(root);
			expectFail(findings, 'consistency:adr-refs');
			expect(findings.map(formatReminder).join('\n')).toContain(
				'ADR-005',
			);
			expect(findings.map(formatReminder).join('\n')).not.toContain(
				'ADR-004 is mentioned',
			);
		});
	});
});

describe('consistency:skeleton-skills', () => {
	it('passes when layout.md names each skill directory', () => {
		withTemp((root) => {
			write(
				root,
				'packages/server/skeleton/skills/langflower-helper/layout.md',
				'Skills: langflower-helper and alpha.\n',
			);
			write(
				root,
				'packages/server/skeleton/skills/alpha/SKILL.md',
				'# Alpha\n',
			);
			expectPass(checkSkeletonSkills(root));
		});
	});

	it('fails when a skill directory is unnamed', () => {
		withTemp((root) => {
			write(
				root,
				'packages/server/skeleton/skills/langflower-helper/layout.md',
				'Skills: langflower-helper.\n',
			);
			write(
				root,
				'packages/server/skeleton/skills/beta/SKILL.md',
				'# Beta\n',
			);
			expectFail(
				checkSkeletonSkills(root),
				'consistency:skeleton-skills',
			);
		});
	});
});

describe('consistency:epic-index', () => {
	it('passes when every epic md except README is linked', () => {
		withTemp((root) => {
			write(
				root,
				'docs/TODO/EPICS/README.md',
				'# Epics\n\nSee [01](01-one.md).\n',
			);
			write(root, 'docs/TODO/EPICS/01-one.md', '# One\n');
			write(
				root,
				'docs/DONE/EPICS/README.md',
				'# Done\n\nSee [02](02-two.md).\n',
			);
			write(root, 'docs/DONE/EPICS/02-two.md', '# Two\n');
			expectPass(checkEpicIndex(root));
		});
	});

	it('fails an unlinked working note the same as any epic', () => {
		withTemp((root) => {
			write(
				root,
				'docs/_work/TODO/EPICS/README.md',
				'# Epics\n\nSee [50](50-knowledge-base-restructure.md).\n',
			);
			write(
				root,
				'docs/_work/TODO/EPICS/50-knowledge-base-restructure.md',
				'# Epic\n',
			);
			write(
				root,
				'docs/_work/TODO/EPICS/50-decisions.md',
				'# Decisions\n',
			);
			expectFail(checkEpicIndex(root), 'consistency:epic-index');
		});
	});

	it('fails an epic that the folder README does not link', () => {
		withTemp((root) => {
			write(root, 'docs/TODO/EPICS/README.md', '# Epics\n');
			write(root, 'docs/TODO/EPICS/03-gap.md', '# Gap\n');
			expectFail(checkEpicIndex(root), 'consistency:epic-index');
		});
	});
});

describe('freshness', () => {
	const seed = (root: string): void => {
		write(root, 'src/app.ts', 'export const value = 1;\n');
		write(
			root,
			'docs/reference/app.md',
			[
				'---',
				'kind: reference',
				'owner: server',
				'covers:',
				"  - 'src/**'",
				'status: current',
				'---',
				'',
				'# App',
			].join('\n'),
		);
		initRepo(root);
		commitAll(root, 'init');
		git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
	};

	it('passes when the covering doc changes with the code', () => {
		withTemp((root) => {
			seed(root);
			write(root, 'src/app.ts', 'export const value = 2;\n');
			write(
				root,
				'docs/reference/app.md',
				fs.readFileSync(
					path.join(root, 'docs/reference/app.md'),
					'utf8',
				) + '\nUpdated.\n',
			);
			commitAll(root, 'update code and doc');
			const result = checkFreshness(root, { baseRef: 'origin/main' });
			expect(Array.isArray(result)).toBe(true);
			if (Array.isArray(result)) {
				expectPass(result);
			}
		});
	});

	it('fails when covered code changes and the doc does not', () => {
		withTemp((root) => {
			seed(root);
			write(root, 'src/app.ts', 'export const value = 2;\n');
			commitAll(root, 'update code only');
			const result = checkFreshness(root, { baseRef: 'origin/main' });
			expect(Array.isArray(result)).toBe(true);
			if (Array.isArray(result)) {
				expectFail(result, 'freshness');
			}
		});
	});

	it('passes a Docs: none em dash trailer', () => {
		withTemp((root) => {
			seed(root);
			write(root, 'src/app.ts', 'export const value = 3;\n');
			commitAll(root, 'update code\n\nDocs: none — fixture reason');
			const result = checkFreshness(root, { baseRef: 'origin/main' });
			expect(Array.isArray(result)).toBe(true);
			if (Array.isArray(result)) {
				expectPass(result);
			}
		});
	});

	it('does not treat a hyphen trailer as Docs: none', () => {
		withTemp((root) => {
			seed(root);
			write(root, 'src/app.ts', 'export const value = 4;\n');
			commitAll(root, 'update code\n\nDocs: none - hyphen is not enough');
			const result = checkFreshness(root, { baseRef: 'origin/main' });
			expect(Array.isArray(result)).toBe(true);
			if (Array.isArray(result)) {
				expectFail(result, 'freshness');
			}
		});
	});

	it('skips when the directory is not a git repo', () => {
		withTemp((root) => {
			const result = checkFreshness(root);
			expect(isFreshnessSkip(result)).toBe(true);
			if (isFreshnessSkip(result)) {
				expect(result.cause).toBe('not-git');
			}
		});
	});

	it('skips when the base ref is missing', () => {
		withTemp((root) => {
			write(root, 'src/app.ts', 'export const value = 1;\n');
			initRepo(root);
			commitAll(root, 'init');
			const result = checkFreshness(root, { baseRef: 'origin/main' });
			expect(isFreshnessSkip(result)).toBe(true);
			if (isFreshnessSkip(result)) {
				expect(result.cause).toBe('missing-base');
			}
		});
	});

	it('falls back to origin/master when origin/main is absent', () => {
		withTemp((root) => {
			write(root, 'src/app.ts', 'export const value = 1;\n');
			write(
				root,
				'docs/reference/app.md',
				[
					'---',
					'kind: reference',
					'owner: server',
					'covers:',
					"  - 'src/**'",
					'status: current',
					'---',
					'',
					'# App',
				].join('\n'),
			);
			initRepo(root);
			commitAll(root, 'init');
			git(root, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
			write(root, 'src/app.ts', 'export const value = 2;\n');
			write(
				root,
				'docs/reference/app.md',
				`${fs.readFileSync(path.join(root, 'docs/reference/app.md'), 'utf8')}\nUpdated.\n`,
			);
			commitAll(root, 'update code and doc');
			const result = checkFreshness(root, { envBase: '' });
			expect(isFreshnessSkip(result)).toBe(false);
			if (Array.isArray(result)) {
				expectPass(result);
			}
		});
	});

	it('skips when origin/main and origin/master are both absent', () => {
		withTemp((root) => {
			write(root, 'src/app.ts', 'export const value = 1;\n');
			initRepo(root);
			commitAll(root, 'init');
			const result = checkFreshness(root, { envBase: '' });
			expect(isFreshnessSkip(result)).toBe(true);
			if (isFreshnessSkip(result)) {
				expect(result.cause).toBe('missing-base');
			}
		});
	});

	it('fails in CI when the base ref is missing', () => {
		const outcome = freshnessMessages(
			{
				skipped: true,
				cause: 'missing-base',
				reason: 'Base ref origin/main is missing. Set DOCS_BASE_REF.',
			},
			true,
		);
		expect(outcome.notice).toBeNull();
		expect(outcome.messages.length).toBeGreaterThan(0);
		expect(outcome.messages[0]).toContain('DOCS_BASE_REF');
		expect(outcome.messages[0]).toContain(
			'docs/guides/writing-docs.md#freshness',
		);
	});
});
