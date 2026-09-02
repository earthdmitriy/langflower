export type FeedPinGesture = 'unpin' | 'maybe-repin' | 'ignore';

const FEED_TOUCH_SLACK_PX = 8;

export const pinGestureFromWheelDelta = (deltaY: number): FeedPinGesture => {
	if (deltaY < 0) {
		return 'unpin';
	}

	if (deltaY > 0) {
		return 'maybe-repin';
	}

	return 'ignore';
};

export const pinGestureFromTouchDelta = (deltaY: number): FeedPinGesture => {
	if (deltaY > FEED_TOUCH_SLACK_PX) {
		return 'unpin';
	}

	if (deltaY < -FEED_TOUCH_SLACK_PX) {
		return 'maybe-repin';
	}

	return 'ignore';
};

export const pinGestureFromScrollKey = (key: string): FeedPinGesture => {
	if (key === 'ArrowUp' || key === 'PageUp' || key === 'Home') {
		return 'unpin';
	}

	if (key === 'ArrowDown' || key === 'PageDown' || key === 'End') {
		return 'maybe-repin';
	}

	return 'ignore';
};
