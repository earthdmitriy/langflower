import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalLangflowerConfigPath } from './resolve-global-langflower-config-path.js';

describe('resolveGlobalLangflowerConfigPath', () => {
	const priorPlatform = process.platform;
	const priorAppData = process.env.APPDATA;
	const priorXdg = process.env.XDG_CONFIG_HOME;

	afterEach(() => {
		Object.defineProperty(process, 'platform', {
			value: priorPlatform,
		});
		if (priorAppData === undefined) {
			delete process.env.APPDATA;
		} else {
			process.env.APPDATA = priorAppData;
		}
		if (priorXdg === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = priorXdg;
		}
	});

	it('uses APPDATA on win32', () => {
		Object.defineProperty(process, 'platform', { value: 'win32' });
		process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
		expect(resolveGlobalLangflowerConfigPath()).toBe(
			path.join(
				'C:\\Users\\test\\AppData\\Roaming',
				'langflower',
				'langflower.jsonc',
			),
		);
	});

	it('uses Application Support on darwin', () => {
		Object.defineProperty(process, 'platform', { value: 'darwin' });
		expect(resolveGlobalLangflowerConfigPath()).toBe(
			path.join(
				os.homedir(),
				'Library',
				'Application Support',
				'langflower',
				'langflower.jsonc',
			),
		);
	});

	it('uses XDG_CONFIG_HOME on linux', () => {
		Object.defineProperty(process, 'platform', { value: 'linux' });
		process.env.XDG_CONFIG_HOME = '/custom/config';
		expect(resolveGlobalLangflowerConfigPath()).toBe(
			path.join('/custom/config', 'langflower', 'langflower.jsonc'),
		);
	});
});
