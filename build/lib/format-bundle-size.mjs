/**
 * Bundle / publish size formatting for build CLI output.
 */

import { log } from './logger.mjs';
import { measurePublishSnapshot } from './publish-snapshot.mjs';

// eslint-disable-next-line no-control-regex -- ANSI escape sequences
const STRIP_ANSI = /\x1b\[[0-9;]*m/g;

/**
 * @param {string} output — combined stdout/stderr from `ng build`
 * @returns {string | null} — plain-text size table, or null if not found
 */
export function extractAngularBundleSize(output) {
	const plain = output.replace(STRIP_ANSI, '');
	const start = plain.search(/^Initial chunk files\b/m);

	if (start < 0) {
		return null;
	}

	const fromTable = plain.slice(start);
	const endMatch = fromTable.match(
		/^Application bundle generation complete\.[^\n]*/m,
	);

	if (!endMatch || endMatch.index === undefined) {
		return null;
	}

	return fromTable
		.slice(0, endMatch.index + endMatch[0].length)
		.replace(/\r\n/g, '\n')
		.trimEnd();
}

/**
 * Print a captured Angular bundle size summary under the build success line.
 * @param {string} output
 */
export function logAngularBundleSize(output) {
	const summary = extractAngularBundleSize(output);

	if (summary === null) {
		return;
	}

	process.stdout.write(`\n${summary}\n`);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	const kib = bytes / 1024;

	if (kib < 1024) {
		return `${kib.toFixed(1)} kB`;
	}

	return `${(kib / 1024).toFixed(2)} MB`;
}

/**
 * Print install-local / npm publish snapshot sizes after a full build.
 */
export async function logPublishSnapshotSize() {
	const snapshot = await measurePublishSnapshot();
	const depsLabel = `Registry deps (${snapshot.depsPackageCount} pkgs)`;
	const labelWidth = Math.max(
		...snapshot.rows.map((row) => row.label.length),
		'Total (workspace + UI)'.length,
		depsLabel.length,
		'Total (workspace + UI + deps)'.length,
	);

	log.blank();
	log.info('npm publish estimate (release snapshot)');
	log.info(
		'vendor packages + embedded UI + production registry deps end users download',
	);

	for (const row of snapshot.rows) {
		const label = row.label.padEnd(labelWidth);
		log.info(
			`${label}  ${formatBytes(row.bytes).padStart(9)}  gzip ~${formatBytes(row.gzipBytes)}`,
		);
	}

	const totalLabel = 'Total (workspace + UI)'.padEnd(labelWidth);
	log.info(
		`${totalLabel}  ${formatBytes(snapshot.totalBytes).padStart(9)}  gzip ~${formatBytes(snapshot.totalGzipBytes)}  (${snapshot.totalFileCount} files)`,
	);

	const depsPad = depsLabel.padEnd(labelWidth);
	log.info(
		`${depsPad}  ${formatBytes(snapshot.depsBytes).padStart(9)}  gzip ~${formatBytes(snapshot.depsGzipBytes)}  (${snapshot.depsFileCount} files)`,
	);

	const grandLabel = 'Total (workspace + UI + deps)'.padEnd(labelWidth);
	log.info(
		`${grandLabel}  ${formatBytes(snapshot.grandTotalBytes).padStart(9)}  gzip ~${formatBytes(snapshot.grandTotalGzipBytes)}`,
	);

	if (snapshot.uiMissing) {
		log.warn(
			'UI browser build missing — ui-dist not counted. Run UI build first.',
		);
	}

	if (snapshot.depsPackageCount === 0) {
		log.warn(
			'No registry deps resolved — install node_modules before sizing.',
		);
	}

	if (snapshot.unresolvedDeps.length > 0) {
		log.warn(
			`Unresolved registry deps: ${snapshot.unresolvedDeps.join(', ')}`,
		);
	}
}
