export const isVerticalScrollbarHit = (
	clientX: number,
	viewportRight: number,
	scrollbarWidth: number,
): boolean => scrollbarWidth > 0 && clientX >= viewportRight - scrollbarWidth;
