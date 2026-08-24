import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { EditorPaletteVisibleProjectionService } from '../services/editor-palette-visible-projection.service';

const createBridgeSubjects = () => ({
	'session.state.snapshot': new Subject<{
		readonly paletteVisible: boolean;
	}>(),
	'editor.paletteVisible.snapshot': new Subject<boolean>(),
	'editor.paletteVisible.requested': new Subject<boolean>(),
});

describe('EditorPaletteVisibleProjectionService', () => {
	let subjects: ReturnType<typeof createBridgeSubjects>;
	let service: EditorPaletteVisibleProjectionService;

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
			() => new EditorPaletteVisibleProjectionService(),
		);
	});

	it('does not emit until a server snapshot', () => {
		const seen: boolean[] = [];
		const sub = service.paletteVisible$.subscribe((value) => {
			seen.push(value);
		});

		expect(seen).toEqual([]);

		subjects['session.state.snapshot'].next({ paletteVisible: false });
		expect(seen).toEqual([false]);

		sub.unsubscribe();
	});

	it('follows session.state.snapshot.paletteVisible', async () => {
		const next = firstValueFrom(service.paletteVisible$);
		subjects['session.state.snapshot'].next({ paletteVisible: false });

		await expect(next).resolves.toBe(false);
	});

	it('follows live editor.paletteVisible.snapshot', async () => {
		const next = firstValueFrom(service.paletteVisible$);
		subjects['editor.paletteVisible.snapshot'].next(false);

		await expect(next).resolves.toBe(false);
	});

	it('requestHide emits paletteVisible.requested false', () => {
		const spy = vi.spyOn(
			subjects['editor.paletteVisible.requested'],
			'next',
		);
		service.requestHide();
		expect(spy).toHaveBeenCalledWith(false);
	});

	it('requestShow emits paletteVisible.requested true', () => {
		const spy = vi.spyOn(
			subjects['editor.paletteVisible.requested'],
			'next',
		);
		service.requestShow();
		expect(spy).toHaveBeenCalledWith(true);
	});
});
