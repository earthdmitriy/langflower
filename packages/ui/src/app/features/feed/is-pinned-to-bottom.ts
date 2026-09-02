const FEED_PIN_THRESHOLD_PX = 24;

export const isPinnedToTop = (
	scrollTop: number,
	thresholdPx: number = FEED_PIN_THRESHOLD_PX,
): boolean => scrollTop <= thresholdPx;

export const isPinnedToBottom = (
	scrollHeight: number,
	scrollTop: number,
	clientHeight: number,
	thresholdPx: number = FEED_PIN_THRESHOLD_PX,
): boolean => scrollHeight - scrollTop - clientHeight <= thresholdPx;
