// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import type { HitlInputConfig } from '@langflower/node-sdk';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeHoverService } from '../../../services/node-hover.service';
import { LfHitlTextareaComponent } from '../components/lf-hitl-textarea.component';
import { ComposerService } from '../composer.service';

const config = { kind: 'textarea', title: 'Message' } as HitlInputConfig;

const pngItem = () => ({
	kind: 'file',
	getAsFile: () => new File(['x'], 'image.png', { type: 'image/png' }),
});

describe('lf-hitl-textarea paste and drop', () => {
	let fixture: ComponentFixture<LfHitlTextareaComponent>;
	const addAttachments = vi.fn();
	const uploading = vi.fn(() => false);

	beforeAll(() => {
		try {
			TestBed.initTestEnvironment(
				BrowserTestingModule,
				platformBrowserTesting(),
			);
		} catch {
			/* already initialized */
		}
	});

	beforeEach(async () => {
		addAttachments.mockClear();
		uploading.mockReturnValue(false);
		URL.createObjectURL = vi.fn(() => 'blob:test');
		URL.revokeObjectURL = vi.fn();
		await TestBed.resetTestingModule()
			.configureTestingModule({
				imports: [LfHitlTextareaComponent],
				providers: [
					{
						provide: ComposerService,
						useValue: {
							composerText: () => '',
							setComposerText: vi.fn(),
							attachmentsFor: () => [],
							addAttachments,
							uploading,
						},
					},
					{
						provide: NodeHoverService,
						useValue: { set: vi.fn(), clear: vi.fn() },
					},
				],
			})
			.compileComponents();
		fixture = TestBed.createComponent(LfHitlTextareaComponent);
		fixture.componentRef.setInput('nodeId', 'chat');
		fixture.componentRef.setInput('portId', 'message');
		fixture.componentRef.setInput('config', config);
		fixture.componentRef.setInput('acceptsFiles', true);
		fixture.detectChanges();
	});

	const fire = (type: string, key: string, payload: object): Event => {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, key, { value: payload });
		fixture.nativeElement.querySelector('textarea').dispatchEvent(event);
		return event;
	};

	it('attaches a pasted screenshot and skips the text paste', () => {
		const event = fire('paste', 'clipboardData', { items: [pngItem()] });

		expect(event.defaultPrevented).toBe(true);
		expect(addAttachments).toHaveBeenCalledTimes(1);
		const files = addAttachments.mock.calls[0]?.[2] as File[];
		expect(files[0]?.name).toMatch(/^pasted-\d{6}-1\.png$/);
	});

	it('leaves a text-only paste alone', () => {
		const event = fire('paste', 'clipboardData', {
			items: [{ kind: 'string', getAsFile: () => null }],
			files: [],
		});

		expect(event.defaultPrevented).toBe(false);
		expect(addAttachments).not.toHaveBeenCalled();
	});

	it('attaches dropped files and shows the drop ring while dragging', () => {
		const files = [new File(['x'], 'photo.png', { type: 'image/png' })];
		const dataTransfer = { types: ['Files'], files };

		fire('dragover', 'dataTransfer', dataTransfer);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.ring-2')).not.toBeNull();

		const event = fire('drop', 'dataTransfer', dataTransfer);
		fixture.detectChanges();
		expect(event.defaultPrevented).toBe(true);
		expect(addAttachments).toHaveBeenCalledWith('chat', 'message', files);
		expect(fixture.nativeElement.querySelector('.ring-2')).toBeNull();
	});

	it('ignores paste and drop when attachments are off or an upload runs', () => {
		fixture.componentRef.setInput('acceptsFiles', false);
		fixture.detectChanges();
		fire('paste', 'clipboardData', { items: [pngItem()] });
		fire('drop', 'dataTransfer', {
			types: ['Files'],
			files: [pngItem().getAsFile()],
		});
		expect(addAttachments).not.toHaveBeenCalled();

		fixture.componentRef.setInput('acceptsFiles', true);
		uploading.mockReturnValue(true);
		fire('paste', 'clipboardData', { items: [pngItem()] });
		expect(addAttachments).not.toHaveBeenCalled();
	});
});
