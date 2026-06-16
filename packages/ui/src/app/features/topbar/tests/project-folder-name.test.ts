import { describe, expect, it } from 'vitest';
import { projectFolderName } from '../utils/project-folder-name';

describe('projectFolderName', () => {
	it('returns the last posix segment', () => {
		expect(projectFolderName('/home/user/demo-project')).toBe(
			'demo-project',
		);
	});

	it('returns the last windows segment', () => {
		expect(projectFolderName('D:\\Win\\Projects\\demo-project')).toBe(
			'demo-project',
		);
	});

	it('strips trailing separators', () => {
		expect(projectFolderName('/home/user/demo-project/')).toBe(
			'demo-project',
		);
		expect(projectFolderName('D:\\Win\\Projects\\demo-project\\')).toBe(
			'demo-project',
		);
	});

	it('keeps a usable label for root-only paths', () => {
		expect(projectFolderName('/')).toBe('/');
		expect(projectFolderName('C:\\')).toBe('C:');
	});
});
