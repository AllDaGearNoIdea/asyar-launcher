/**
 * Shared selection state for list views — auto-selects the first item when
 * results exist, clamps when the list shrinks below the current index, drops
 * to -1 when empty, and wraps on arrow-key moves.
 *
 * Pass `items` as a reactive getter (not an array) so `selectedIndex` and
 * `selectedItem` re-derive whenever the source list changes. Clamping is
 * lazy — it happens inside the getters, so the primitive works equally well
 * inside a component (`<script>`) or at module scope (state classes) without
 * needing an `$effect.root` wrapper.
 *
 * Used by ActionListPopup, snippet/store/clipboard view state classes, and
 * any future flat or sectioned list. Sectioned views render groups from the
 * same flat list this primitive tracks.
 */

/**
 * Shift an index up or down through a list of `length`, optionally wrapping
 * past the edges. Use this directly when your store tracks selection by id
 * (or some other stable handle) rather than by index — that way the wrap
 * arithmetic isn't open-coded in every domain class.
 */
export function shiftIndex(
  current: number,
  length: number,
  direction: 'up' | 'down',
  wrap = true,
): number {
  if (length === 0) return -1;
  const start = current < 0 ? 0 : current;
  if (direction === 'down') {
    const next = start + 1;
    return wrap ? next % length : Math.min(next, length - 1);
  }
  const next = start - 1;
  return wrap ? (next + length) % length : Math.max(next, 0);
}

export interface ListSelection<T> {
  readonly selectedIndex: number;
  readonly selectedItem: T | null;
  setIndex(index: number): void;
  moveSelection(direction: 'up' | 'down'): void;
}

export interface ListSelectionOptions<T> {
  /** Reactive getter for the current items. */
  items: () => readonly T[];
  /** Wrap arrow-key navigation past the edges. Defaults to true. */
  wrap?: boolean;
}

export function useListSelection<T>({
  items,
  wrap = true,
}: ListSelectionOptions<T>): ListSelection<T> {
  let raw = $state(0);

  // Single source of truth for the clamped index. Reads `items()` so this
  // re-evaluates whenever the source list changes — empty → -1, out-of-range
  // → 0, otherwise the user's pick is preserved across benign reshuffles.
  const clamped = $derived.by(() => {
    const len = items().length;
    if (len === 0) return -1;
    if (raw < 0 || raw >= len) return 0;
    return raw;
  });

  return {
    get selectedIndex() {
      return clamped;
    },
    get selectedItem() {
      const list = items();
      return clamped >= 0 && clamped < list.length ? list[clamped] : null;
    },
    setIndex(next: number) {
      const len = items().length;
      if (len === 0) {
        raw = -1;
        return;
      }
      if (next < 0 || next >= len) return;
      raw = next;
    },
    moveSelection(direction: 'up' | 'down') {
      const len = items().length;
      if (len === 0) return;
      raw = shiftIndex(clamped, len, direction, wrap);
    },
  };
}
