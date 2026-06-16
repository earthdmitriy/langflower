import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	startWsServerPoke,
	type WsProbeSocket,
	type WsProbeSocketConstructor,
} from '../utils/ws-server-poke.js';

type FakeSocket = WsProbeSocket & {
	url: string;
	triggerOpen: () => void;
	triggerError: () => void;
	triggerClose: () => void;
};

const createFakeWebSocket = (): {
	readonly WebSocketImpl: WsProbeSocketConstructor;
	readonly sockets: FakeSocket[];
} => {
	const sockets: FakeSocket[] = [];

	const WebSocketImpl = function FakeWebSocket(
		this: FakeSocket,
		url: string,
	) {
		const self = this;
		self.url = url;
		self.onopen = null;
		self.onerror = null;
		self.onclose = null;
		self.close = vi.fn();
		self.triggerOpen = () => {
			self.onopen?.(new Event('open'));
		};
		self.triggerError = () => {
			self.onerror?.(new Event('error'));
		};
		self.triggerClose = () => {
			self.onclose?.(new CloseEvent('close'));
		};
		sockets.push(self);
	} as unknown as WsProbeSocketConstructor;

	return { WebSocketImpl, sockets };
};

describe('startWsServerPoke', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('probes immediately and again on each interval', () => {
		vi.useFakeTimers();
		const { WebSocketImpl, sockets } = createFakeWebSocket();
		const onReachable = vi.fn();

		const handle = startWsServerPoke({
			url: 'ws://example.test/ws',
			intervalMs: 2000,
			onReachable,
			WebSocketImpl,
		});

		expect(sockets).toHaveLength(1);
		expect(sockets[0]?.url).toBe('ws://example.test/ws');

		sockets[0]?.triggerError();
		vi.advanceTimersByTime(2000);
		expect(sockets).toHaveLength(2);

		handle.stop();
	});

	it('fires onReachable once when a probe opens', () => {
		vi.useFakeTimers();
		const { WebSocketImpl, sockets } = createFakeWebSocket();
		const onReachable = vi.fn();

		startWsServerPoke({
			url: 'ws://example.test/ws',
			intervalMs: 2000,
			onReachable,
			WebSocketImpl,
		});

		sockets[0]?.triggerOpen();
		sockets[0]?.triggerOpen();
		vi.advanceTimersByTime(10_000);

		expect(onReachable).toHaveBeenCalledTimes(1);
		expect(sockets).toHaveLength(1);
	});

	it('keeps polling after failed probes', () => {
		vi.useFakeTimers();
		const { WebSocketImpl, sockets } = createFakeWebSocket();
		const onReachable = vi.fn();

		const handle = startWsServerPoke({
			url: 'ws://example.test/ws',
			intervalMs: 1000,
			onReachable,
			WebSocketImpl,
		});

		sockets[0]?.triggerError();
		vi.advanceTimersByTime(1000);
		sockets[1]?.triggerClose();
		vi.advanceTimersByTime(1000);
		sockets[2]?.triggerOpen();

		expect(onReachable).toHaveBeenCalledTimes(1);
		expect(sockets).toHaveLength(3);

		handle.stop();
	});

	it('stop clears the timer and closes an in-flight probe', () => {
		vi.useFakeTimers();
		const { WebSocketImpl, sockets } = createFakeWebSocket();
		const onReachable = vi.fn();

		const handle = startWsServerPoke({
			url: 'ws://example.test/ws',
			intervalMs: 2000,
			onReachable,
			WebSocketImpl,
		});

		expect(sockets).toHaveLength(1);
		handle.stop();
		handle.stop();

		expect(sockets[0]?.close).toHaveBeenCalled();
		vi.advanceTimersByTime(10_000);
		expect(sockets).toHaveLength(1);
		expect(onReachable).not.toHaveBeenCalled();
	});

	it('does not open a second probe while one is still in flight', () => {
		vi.useFakeTimers();
		const { WebSocketImpl, sockets } = createFakeWebSocket();

		const handle = startWsServerPoke({
			url: 'ws://example.test/ws',
			intervalMs: 500,
			onReachable: vi.fn(),
			WebSocketImpl,
		});

		vi.advanceTimersByTime(2000);
		expect(sockets).toHaveLength(1);

		handle.stop();
	});
});
