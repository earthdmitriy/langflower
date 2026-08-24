// @vitest-environment jsdom

import '@angular/compiler';
import { AsyncPipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component';
import { EditorSettingsProjectionService } from '../../../services/editor-settings-projection.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { LangflowerConfigProjectionService } from '../../../services/langflower-config-projection.service';
import { ModelsCatalogProjectionService } from '../../../services/models-catalog-projection.service';
import { SelectedNodeProjectionService } from '../../../services/selected-node-projection.service';
import { ThemeService } from '../../../services/theme.service';
import { EditorPaletteVisibleProjectionService } from '../../palette/services/editor-palette-visible-projection.service';
import { EditorShellComponent } from '../components/editor-shell.component';

@Component({
	selector: 'lf-project-dir',
	standalone: true,
	template: '',
})
class StubProjectDirComponent {}

@Component({
	selector: 'lf-workflow-topbar',
	standalone: true,
	template: '',
})
class StubWorkflowTopbarComponent {}

@Component({
	selector: 'lf-palette-sidebar',
	standalone: true,
	template: '',
})
class StubPaletteSidebarComponent {}

@Component({
	selector: 'lf-canvas-container',
	standalone: true,
	template: '',
})
class StubCanvasContainerComponent {}

@Component({
	selector: 'lf-inspector-panel',
	standalone: true,
	template: '',
})
class StubInspectorPanelComponent {}

@Component({
	selector: 'lf-settings-panel',
	standalone: true,
	template: '',
})
class StubSettingsPanelComponent {}

@Component({
	selector: 'lf-work-log-panel',
	standalone: true,
	template: '',
})
class StubWorkLogPanelComponent {}

@Component({
	selector: 'lf-composer-shell',
	standalone: true,
	template: '',
})
class StubComposerShellComponent {}

const sessionSnapshot = {
	version: 7,
	langflowerConfig: {},
	dividerPositions: {
		leftWidth: 280,
		rightWidth: 360,
		composerHeight: 168,
	},
	paletteVisible: true,
	selectedNode: null,
	settings: { open: false, scope: 'project' as const },
};

describe('EditorShellComponent palette chrome', () => {
	let fixture: ComponentFixture<EditorShellComponent>;
	let paletteVisible$: BehaviorSubject<boolean>;
	let requestShow: ReturnType<typeof vi.fn>;

	beforeAll(() => {
		if (typeof globalThis.ResizeObserver === 'undefined') {
			globalThis.ResizeObserver = class {
				observe(): void {}
				unobserve(): void {}
				disconnect(): void {}
			} as typeof ResizeObserver;
		}

		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(async () => {
		TestBed.resetTestingModule();
		paletteVisible$ = new BehaviorSubject(true);
		requestShow = vi.fn();
		const session$ = new BehaviorSubject(sessionSnapshot);

		TestBed.overrideComponent(EditorShellComponent, {
			set: {
				imports: [
					AsyncPipe,
					LfHoverTipComponent,
					StubProjectDirComponent,
					StubWorkflowTopbarComponent,
					StubPaletteSidebarComponent,
					StubCanvasContainerComponent,
					StubInspectorPanelComponent,
					StubSettingsPanelComponent,
					StubWorkLogPanelComponent,
					StubComposerShellComponent,
				],
			},
		});

		await TestBed.configureTestingModule({
			imports: [EditorShellComponent],
			providers: [
				{
					provide: LangflowerBridgeService,
					useValue: {
						cached: {
							'session.state.snapshot': session$,
							'editor.dividers.snapshot': new Subject(),
						},
						raw: {
							status$: new BehaviorSubject('connected'),
							'editor.dividers.requested': new Subject(),
						},
					},
				},
				{
					provide: EditorPaletteVisibleProjectionService,
					useValue: {
						paletteVisible$,
						requestShow,
					},
				},
				{
					provide: SelectedNodeProjectionService,
					useValue: { hasSelectedNode: signal(false) },
				},
				{
					provide: EditorSettingsProjectionService,
					useValue: {
						open: signal(false),
						requestClose: vi.fn(),
						requestOpen: vi.fn(),
					},
				},
				{ provide: LangflowerConfigProjectionService, useValue: {} },
				{ provide: ModelsCatalogProjectionService, useValue: {} },
				{
					provide: ThemeService,
					useValue: {
						theme$: new BehaviorSubject('dark'),
						snapshot: 'dark',
						toggleTheme: vi.fn(),
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(EditorShellComponent);
		fixture.detectChanges();
	});

	it('shows the left palette aside while visible', () => {
		expect(
			fixture.nativeElement.querySelector('lf-palette-sidebar'),
		).not.toBeNull();
		expect(
			fixture.nativeElement.querySelector('[aria-label="Show palette"]'),
		).toBeNull();
	});

	it('hides the aside and shows a floating restore control', () => {
		paletteVisible$.next(false);
		fixture.detectChanges();

		expect(
			fixture.nativeElement.querySelector('lf-palette-sidebar'),
		).toBeNull();
		expect(
			fixture.nativeElement.querySelector(
				'[aria-label="Resize left sidebar"]',
			),
		).toBeNull();

		const show = fixture.nativeElement.querySelector(
			'[aria-label="Show palette"]',
		) as HTMLButtonElement | null;
		expect(show).not.toBeNull();
		show?.click();
		expect(requestShow).toHaveBeenCalledOnce();
	});
});
