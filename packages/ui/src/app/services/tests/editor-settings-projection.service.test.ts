import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSettingsProjectionService } from '../editor-settings-projection.service';
import { LangflowerBridgeService } from '../langflower-bridge.service';

const createBridgeSubjects = () => ({
	'session.state.snapshot': new Subject<{
		readonly settings: {
			readonly open: boolean;
			readonly scope: 'project' | 'global';
		};
	}>(),
	'editor.settings.snapshot': new Subject<{
		readonly open: boolean;
		readonly scope: 'project' | 'global';
	}>(),
	'editor.settings.requested': new Subject<{
		readonly open: boolean;
		readonly scope?: 'project' | 'global';
	}>(),
});

describe('EditorSettingsProjectionService', () => {
	let subjects: ReturnType<typeof createBridgeSubjects>;
	let service: EditorSettingsProjectionService;

	beforeEach(() => {
		subjects = createBridgeSubjects();
		const injector = Injector.create({
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: { raw: subjects, cached: subjects },
				},
				{ provide: DestroyRef, useValue: { onDestroy: () => {} } },
			],
		});
		service = runInInjectionContext(
			injector,
			() => new EditorSettingsProjectionService(),
		);
	});

	it('starts closed on project scope', () => {
		expect(service.open()).toBe(false);
		expect(service.scope()).toBe('project');
	});

	it('hydrates from session.state.snapshot.settings', () => {
		subjects['session.state.snapshot'].next({
			settings: { open: true, scope: 'global' },
		});

		expect(service.open()).toBe(true);
		expect(service.scope()).toBe('global');
	});

	it('follows live editor.settings.snapshot', async () => {
		subjects['editor.settings.snapshot'].next({
			open: true,
			scope: 'project',
		});

		const late = await firstValueFrom(service.settings$);
		expect(late).toEqual({ open: true, scope: 'project' });
		expect(service.open()).toBe(true);
	});

	it('requestOpen emits settings.requested with scope', () => {
		const spy = vi.spyOn(subjects['editor.settings.requested'], 'next');
		service.requestOpen('global');
		expect(spy).toHaveBeenCalledWith({ open: true, scope: 'global' });
	});

	it('requestClose emits open false', () => {
		const spy = vi.spyOn(subjects['editor.settings.requested'], 'next');
		service.requestClose();
		expect(spy).toHaveBeenCalledWith({ open: false });
	});
});
