// @vitest-environment jsdom

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { LfAttachmentThumbComponent } from '../components/lf-attachment-thumb.component';

const png = () => new File(['x'], 'shot.png', { type: 'image/png' });

describe('lf-attachment-thumb', () => {
	let fixture: ComponentFixture<LfAttachmentThumbComponent>;
	const created: string[] = [];
	const revoked: string[] = [];

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
		created.length = 0;
		revoked.length = 0;
		let counter = 0;
		URL.createObjectURL = vi.fn(() => {
			counter += 1;
			const url = `blob:test-${counter}`;
			created.push(url);
			return url;
		});
		URL.revokeObjectURL = vi.fn((url: string) => {
			revoked.push(url);
		});
		await TestBed.resetTestingModule()
			.configureTestingModule({ imports: [LfAttachmentThumbComponent] })
			.compileComponents();
		fixture = TestBed.createComponent(LfAttachmentThumbComponent);
	});

	afterEach(() => {
		fixture.destroy();
		document.body.innerHTML = '';
	});

	it('shows an image thumbnail and revokes its URL on destroy', () => {
		fixture.componentRef.setInput('file', png());
		fixture.detectChanges();

		const img = fixture.nativeElement.querySelector('img');
		expect(img?.getAttribute('src')).toBe(created[0]);

		fixture.destroy();
		expect(revoked).toEqual([created[0]]);
	});

	it('shows a label, not an image, for a pdf', () => {
		fixture.componentRef.setInput(
			'file',
			new File(['x'], 'a.pdf', { type: 'application/pdf' }),
		);
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('img')).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('PDF');
		expect(created).toEqual([]);
	});

	it('opens the preview dialog on click and closes on Escape', () => {
		fixture.componentRef.setInput('file', png());
		fixture.detectChanges();

		fixture.nativeElement.querySelector('button').click();
		fixture.detectChanges();
		const dialog = document.querySelector('lf-attachment-preview-dialog');
		expect(dialog?.querySelector('[role="dialog"]')).not.toBeNull();
		expect(dialog?.textContent).toContain('shot.png');

		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		fixture.detectChanges();
		expect(
			document.querySelector('lf-attachment-preview-dialog'),
		).toBeNull();
	});
});
