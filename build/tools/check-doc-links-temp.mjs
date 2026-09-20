/** Temporary verification: every relative markdown link resolves on disk. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

const files = [
	...execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
		.split('\n')
		.filter((line) => line.trim().endsWith('.md')),
	...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((line) => line.trim().endsWith('.md')),
]
	.map((line) => line.trim())
	.filter(
		(file) =>
			file.length > 0 &&
			!file.includes('.cache/') &&
			fs.existsSync(path.join(ROOT, file)),
	);

const linkRegex = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const broken = [];

for (const file of files) {
	const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
	const dir = path.posix.dirname(file.split(path.sep).join('/'));

	for (const match of text.matchAll(linkRegex)) {
		const target = match[1];

		if (
			target.startsWith('#') ||
			target.startsWith('/') ||
			/^[a-z][a-z0-9+.-]*:/i.test(target)
		) {
			continue;
		}

		const pathPart = target.split('#')[0];

		if (pathPart === '') {
			continue;
		}

		const resolved = path.posix.normalize(path.posix.join(dir, pathPart));

		if (!fs.existsSync(path.join(ROOT, resolved))) {
			broken.push(`${file} -> ${target}`);
		}
	}
}

console.log(`checked ${files.length} markdown files`);
console.log(`broken links: ${broken.length}`);
for (const item of broken) {
	console.log(`  ${item}`);
}
