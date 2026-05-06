<script lang="ts">
  import { icons } from '../../lib/icons';
  import { sfSymbolFor, sfSymbolMask, type SymbolMask } from '../../lib/sfSymbols';

  let {
    name,
    size = 20,
    class: className = '',
    strokeWidth = 1.5,
  }: {
    name: string;
    size?: number;
    class?: string;
    strokeWidth?: number;
  } = $props();

  // Whether this icon has an SF Symbol mapping (macOS-only path).
  let sfSymbol = $derived(sfSymbolFor(name));

  // The resolved mask, populated asynchronously after Rust renders.
  // Until it resolves we fall through to the SVG path so the icon never
  // "flashes blank" on first paint.
  let mask = $state<SymbolMask | null>(null);

  $effect(() => {
    if (!sfSymbol) {
      mask = null;
      return;
    }
    let cancelled = false;
    sfSymbolMask(name, size).then(m => {
      if (!cancelled) mask = m;
    });
    return () => { cancelled = true; };
  });

  // Width of the mask box at the requested point height. SF Symbols vary
  // in aspect ratio (sparkles is ~1.4× wide, settings is ~1.0×); we
  // preserve that so glyphs read correctly. Heights match `size` exactly.
  let maskWidth = $derived(
    mask ? Math.round((mask.width / mask.height) * size) : size
  );
</script>

{#if mask}
  <span
    class={`sf-mask ${className}`}
    style="
      --sf-mask: url('{mask.url}');
      width: {maskWidth}px;
      height: {size}px;
    "
    aria-hidden="true"
  ></span>
{:else if icons[name]}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={strokeWidth}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={className}
  >
    {@html icons[name]}
  </svg>
{:else}
  <!-- Fallback: render nothing for unknown icon names -->
  <span class="inline-block" style="width: {size}px; height: {size}px;"></span>
{/if}

<style>
  /* The SF Symbol PNG carries only the alpha channel we care about; the
     visible colour is supplied by the surrounding row via background-color
     (which inherits from currentColor where the parent sets it).

     Width/height are inlined at consumer point size, with width adjusted
     for the symbol's natural aspect ratio so wider glyphs (e.g. sparkles)
     don't squish. mask-size: 100% 100% stretches the PNG to fill — fine,
     because the box already matches the symbol's aspect ratio. */
  .sf-mask {
    display: inline-block;
    background-color: currentColor;
    -webkit-mask-image: var(--sf-mask);
    mask-image: var(--sf-mask);
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
  }
</style>
