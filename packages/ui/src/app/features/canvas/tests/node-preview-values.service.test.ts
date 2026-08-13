// @vitest-environment jsdom

import { TestBed } from '@angular/core/testing';
import {
	BrowserTestingModule,
	platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { NodePreviewValuesService } from '../services/node-preview-values.service';

const createRaw = () =>
	({
		'executionFeed.snapshot': new Subject<any>(),
		'runner.port': new Subject<any>(),
		'runner.started': new Subject<any>(),
		'runner.startNode.started': new Subject<any>(),
		'workflow.current.snapshot': new Subject<any>(),
	}) as const;

describe('NodePreviewValuesService', () => {
	let raw: ReturnType<typeof createRaw>;
	let service: NodePreviewValuesService;

	beforeAll(() => {
		TestBed.initTestEnvironment(
			BrowserTestingModule,
			platformBrowserTesting(),
		);
	});

	beforeEach(() => {
		TestBed.resetTestingModule();
		raw = createRaw();
		TestBed.configureTestingModule({
			providers: [
				NodePreviewValuesService,
				{
					provide: LangflowerBridgeService,
					useValue: { raw, cached: raw },
				},
			],
		});
		service = TestBed.inject(NodePreviewValuesService);
	});

	it('hydrates from executionFeed.snapshot and appends live input-received', () => {
		raw['executionFeed.snapshot'].next({
			runId: 'run-1',
			workflowId: 'wf',
			status: 'running',
			events: [['in', 'n1', 'text', 'value', 'from-snap', 0, [], null]],
		});

		expect(service.valueFor('n1', 'text')).toBe('from-snap');

		raw['runner.port'].next([
			'in',
			'n1',
			'text',
			'value',
			'live',
			0,
			[],
			null,
		]);

		expect(service.valueFor('n1', 'text')).toBe('live');
	});

	it('clears on null feed snapshot', () => {
		raw['runner.port'].next([
			'in',
			'n1',
			'text',
			'value',
			'kept',
			0,
			[],
			null,
		]);
		expect(service.valueFor('n1', 'text')).toBe('kept');

		raw['executionFeed.snapshot'].next(null);
		expect(service.valueFor('n1', 'text')).toBeUndefined();
	});

	it('clears on new runId and on workflow switch', () => {
		raw['runner.started'].next('run-1');
		raw['runner.port'].next([
			'in',
			'n1',
			'text',
			'value',
			'a',
			0,
			[],
			null,
		]);
		expect(service.valueFor('n1', 'text')).toBe('a');

		raw['runner.started'].next('run-2');
		expect(service.valueFor('n1', 'text')).toBeUndefined();

		raw['runner.port'].next([
			'in',
			'n1',
			'text',
			'value',
			'b',
			0,
			[],
			null,
		]);
		raw['workflow.current.snapshot'].next({
			activeWorkflow: {
				workflowId: 'wf-a',
				metadata: {
					name: 'wf-a',
					createdAt: '2026-07-23T00:00:00.000Z',
					updatedAt: '2026-07-23T00:00:00.000Z',
				},
				graph: {
					nodes: [],
					edges: [],
					viewport: { x: 0, y: 0, scale: 1 },
				},
			},
			currentStatus: { status: 'pristine' },
		});
		raw['workflow.current.snapshot'].next({
			activeWorkflow: {
				workflowId: 'wf-b',
				metadata: {
					name: 'wf-b',
					createdAt: '2026-07-23T00:00:00.000Z',
					updatedAt: '2026-07-23T00:00:00.000Z',
				},
				graph: {
					nodes: [],
					edges: [],
					viewport: { x: 0, y: 0, scale: 1 },
				},
			},
			currentStatus: { status: 'pristine' },
		});
		expect(service.valueFor('n1', 'text')).toBeUndefined();
	});
});
