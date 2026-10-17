/**
 * Skeleton skills are the source. The two dogfood trees are copies.
 * check mode reports byte drift and writes nothing.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SKILL_SOURCE = 'packages/server/skeleton/skills';

export const SKILL_DESTINATIONS = [
	'demo-project/.langflower/skills',
	'.langflower/skills',
];

const SKIP = new Set(['node_modules', 'dist', '.git', 'vendor']);

const listFiles = (abs) => {
	const out = [];
	const visit = (dir) => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (SKIP.has(entry.name)) {
				continue;
			}
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				visit(full);
				continue;
			}
			if (entry.isFile()) {
				out.push(path.relative(abs, full).replace(/\\/g, '/'));
			}
		}
	};
	visit(abs);
	return out.sort();
};

const skillNames = (root) => {
	const abs = path.join(root, SKILL_SOURCE);
	let names;
	try {
		names = fs.readdirSync(abs, { withFileTypes: true });
	} catch {
		return null;
	}
	return names
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
};

export const skillDrifts = (root) => {
	const names = skillNames(root);
	if (names === null) {
		return [
			{
				message: 'missing skeleton skills directory',
				path: SKILL_SOURCE,
				skeleton: SKILL_SOURCE,
			},
		];
	}
	const drifts = [];
	for (const name of names) {
		const sourceDir = path.join(root, SKILL_SOURCE, name);
		const sourceFiles = listFiles(sourceDir);
		const sourceSet = new Set(sourceFiles);
		for (const destRoot of SKILL_DESTINATIONS) {
			const destDir = path.join(root, destRoot, name);
			const destRel = `${destRoot}/${name}`;
			if (!fs.existsSync(destDir)) {
				drifts.push({
					message: 'missing skill copy',
					path: destRel,
					skeleton: `${SKILL_SOURCE}/${name}`,
				});
				continue;
			}
			const destFiles = listFiles(destDir);
			const destSet = new Set(destFiles);
			for (const file of sourceFiles) {
				const destFile = `${destRel}/${file}`;
				const skeleton = `${SKILL_SOURCE}/${name}/${file}`;
				if (!destSet.has(file)) {
					drifts.push({
						message: 'missing file',
						path: destFile,
						skeleton,
					});
					continue;
				}
				const left = fs.readFileSync(path.join(sourceDir, file));
				const right = fs.readFileSync(path.join(destDir, file));
				if (!left.equals(right)) {
					drifts.push({
						message: 'byte drift',
						path: destFile,
						skeleton,
					});
				}
			}
			for (const file of destFiles) {
				if (!sourceSet.has(file)) {
					drifts.push({
						message: 'extra file',
						path: `${destRel}/${file}`,
						skeleton: `${SKILL_SOURCE}/${name}/${file}`,
					});
				}
			}
		}
	}
	return drifts;
};

const removeEmptyDirs = (abs) => {
	let entries;
	try {
		entries = fs.readdirSync(abs, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			removeEmptyDirs(path.join(abs, entry.name));
		}
	}
	if (fs.readdirSync(abs).length === 0) {
		fs.rmdirSync(abs);
	}
};

/** Copy skeleton skills onto both destination trees. Does not print. */
export const syncSkills = (root) => {
	const names = skillNames(root) ?? [];
	for (const name of names) {
		const from = path.join(root, SKILL_SOURCE, name);
		const sourceFiles = new Set(listFiles(from));
		for (const destRoot of SKILL_DESTINATIONS) {
			const to = path.join(root, destRoot, name);
			fs.mkdirSync(to, { recursive: true });
			fs.cpSync(from, to, { recursive: true, force: true });
			for (const file of listFiles(to)) {
				if (!sourceFiles.has(file)) {
					fs.rmSync(path.join(to, file), { force: true });
				}
			}
			removeEmptyDirs(to);
		}
	}
};
