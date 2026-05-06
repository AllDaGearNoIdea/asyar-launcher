<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    left,
    right,
  }: {
    left?: Snippet;
    right?: Snippet;
  } = $props();
</script>

<footer class="action-footer">
  <div class="action-footer-left">
    {#if left}
      {@render left()}
    {/if}
  </div>
  <div class="action-footer-right">
    {#if right}
      {@render right()}
    {/if}
  </div>
</footer>

<style>
  /* Transparent: the launcher panel already provides vibrancy. Stacking
     another translucent fill (and a redundant backdrop-filter) here doubled
     the alpha and made the footer look noticeably more opaque than the
     launcher behind it. */
  .action-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 16px;
    border-top: 1px solid var(--divider-soft);
    background-color: transparent;
    flex-shrink: 0;
    z-index: 10;
    /* The footer sits over translucent vibrancy; bump base text contrast so
       captions don't dissolve into the desktop showing through. */
    color: var(--text-secondary);
  }

  /* Captions in this footer (e.g. timestamp, char count) used to default
     to --text-tertiary, which reads fine on an opaque surface but vanishes
     against vibrancy. Override scoped to the footer. */
  :global(.action-footer .text-caption) {
    color: var(--text-secondary);
  }
  /* Tailwind opacity utility used inline (`opacity-70`) compounds against
     translucent backgrounds. Reset within the footer. */
  :global(.action-footer .opacity-70) { opacity: 1; }

  .action-footer-left,
  .action-footer-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  :global(.action-footer kbd) {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    padding: 2px 5px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-color);
  }
</style>
