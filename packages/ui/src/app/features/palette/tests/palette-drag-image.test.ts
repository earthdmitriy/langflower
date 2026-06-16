// @vitest-environment jsdom

import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { attachPaletteDragImage } from '../utils/palette-drag-image.js';

const sampleNode = {
	type: 'common-string',
	displayName: 'String',
	category: 'Primitives',
	description: '',
	source: 'common',
	inputsConfigs: [],
	outputsConfigs: [],
	uiSchema: [],
	stopsRun: false,
	emitOncePerActivation: false,
	chatEntry: false,
	bypassPorts: {},
	icon: undefined,
} as unknown as PaletteNodeDefinition;

describe('attachPaletteDragImage', () => {
	beforeAll(() => {
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(() => {
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({});
	});

	it('shrinks the drag host to content width (not viewport block width)', () => {
		const injector = TestBed.inject(EnvironmentInjector);
		const appRef = TestBed.inject(ApplicationRef);

		const setDragImage = vi.fn();
		const event = {
			dataTransfer: {
				setDragImage,
				setData: vi.fn(),
				effectAllowed: 'copy',
			},
		} as unknown as DragEvent;

		const session = attachPaletteDragImage(
			injector,
			appRef,
			sampleNode,
			event,
		);

		expect(session).not.toBeNull();
		expect(setDragImage).toHaveBeenCalledOnce();

		const host = setDragImage.mock.calls[0]?.[0] as HTMLElement;
		expect(host.style.display).toBe('inline-block');
		expect(host.style.width).toBe('max-content');

		session?.destroy();
	});
});
