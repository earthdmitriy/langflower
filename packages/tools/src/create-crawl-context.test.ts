import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCrawlContext } from './create-crawl-context.js';

describe('createCrawlContext', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-crawl-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('writes page JSON under .langflower/crawl/{runId}/', async () => {
		const crawl = createCrawlContext(projectDir, 'run-42');
		const saved = await crawl.savePage({
			url: 'https://example.com/a',
			html: '<html><title>A</title></html>',
			text: 'A',
			title: 'A',
		});

		expect(saved.savedPath).toMatch(
			/^\.langflower\/crawl\/run-42\/0001-.*\.json$/,
		);

		const absolute = path.join(projectDir, saved.savedPath);
		const raw = await fs.readFile(absolute, 'utf8');
		const parsed = JSON.parse(raw) as { url: string; title?: string };

		expect(parsed.url).toBe('https://example.com/a');
		expect(parsed.title).toBe('A');
	});
});
