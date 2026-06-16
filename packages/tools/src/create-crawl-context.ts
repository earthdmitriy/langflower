import fs from 'node:fs/promises';
import path from 'node:path';

/** Structural match for node-sdk `CrawlSavedPage`. */
export type CrawlSavedPage = {
	readonly url: string;
	readonly html: string;
	readonly text: string;
	readonly title?: string;
	readonly savedPath: string;
};

/** Structural match for node-sdk `CrawlContext`. */
export type CrawlContext = {
	readonly runId: string;
	readonly savePage: (page: {
		readonly url: string;
		readonly html: string;
		readonly text: string;
		readonly title?: string;
	}) => Promise<CrawlSavedPage>;
};

const sanitizeSegment = (value: string): string =>
	value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);

/**
 * Persist crawl pages under `<project>/.langflower/crawl/{runId}/`.
 */
export const createCrawlContext = (
	projectDir: string,
	runId: string,
): CrawlContext => {
	const safeRunId = sanitizeSegment(runId || 'run');
	const rootDir = path.join(projectDir, '.langflower', 'crawl', safeRunId);
	let sequence = 0;

	return {
		runId: safeRunId,
		savePage: async (page): Promise<CrawlSavedPage> => {
			await fs.mkdir(rootDir, { recursive: true });
			sequence += 1;
			const stem = `${String(sequence).padStart(4, '0')}-${sanitizeSegment(page.url)}`;
			const fileName = `${stem}.json`;
			const savedPath = path.join(rootDir, fileName);
			const record: CrawlSavedPage = {
				url: page.url,
				html: page.html,
				text: page.text,
				...(page.title !== undefined && page.title.length > 0
					? { title: page.title }
					: {}),
				savedPath: path
					.relative(projectDir, savedPath)
					.replace(/\\/g, '/'),
			};

			await fs.writeFile(
				savedPath,
				`${JSON.stringify(record, null, 2)}\n`,
				'utf8',
			);

			return record;
		},
	};
};
