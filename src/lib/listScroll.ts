/**
 * Scroll a row into view inside a list container, Raycast-style:
 * - At the very first/last index, scroll the container fully to its edge
 *   so padding or section headers above the first row stay visible.
 * - Otherwise, keep one row of "peek" before and after the selected row
 *   so the next/previous item is always partially in view.
 *
 * Used by the main results list, SplitListDetail, and ActionListPopup so
 * all list views share one scroll behaviour.
 */
export function scrollSelectedIntoView(listContainer: HTMLElement, selectedIndex: number): void {
  if (selectedIndex < 0) return;
  const selectedElement = listContainer.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
  if (!selectedElement) return;

  const isFirst = selectedIndex === 0;
  const lastIndex = Math.max(
    ...Array.from(listContainer.querySelectorAll<HTMLElement>('[data-index]'))
      .map((el) => Number(el.getAttribute('data-index')) || 0),
  );
  const isLast = selectedIndex === lastIndex;

  let scroller: HTMLElement | null = selectedElement;
  while (scroller && getComputedStyle(scroller).overflowY !== 'auto' && getComputedStyle(scroller).overflowY !== 'scroll') {
    scroller = scroller.parentElement;
  }
  if (!scroller) {
    selectedElement.scrollIntoView({ block: 'nearest' });
    return;
  }

  if (isFirst) {
    scroller.scrollTop = 0;
    return;
  }
  if (isLast) {
    scroller.scrollTop = scroller.scrollHeight;
    return;
  }

  const EDGE_GAP = 8;
  const rowRect = selectedElement.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const offsetTop = rowRect.top - scrollerRect.top + scroller.scrollTop;
  const rowBottom = offsetTop + rowRect.height;

  // Keep a small visual gap above/below the selected row when it's near the
  // viewport edge — no peek of the next item, just breathing room.
  const minScroll = rowBottom + EDGE_GAP - scroller.clientHeight;
  const maxScroll = offsetTop - EDGE_GAP;

  if (scroller.scrollTop > maxScroll) {
    scroller.scrollTop = maxScroll;
  } else if (scroller.scrollTop < minScroll) {
    scroller.scrollTop = minScroll;
  }
}
