// SF Symbols bridge for the Icon component.
//
// On macOS, the launcher renders selected icons as SF Symbols by asking
// Rust to draw the symbol as a white-on-transparent PNG; the frontend
// then uses the PNG as a CSS `mask-image` so colour comes from
// `currentColor`/`background-color`. One cached PNG covers every theme
// and destructive variant.
//
// On non-macOS platforms this module is inert: the resolver always
// returns null so the Icon component falls back to its Lucide SVG path.

import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

const IS_MACOS = (() => {
  try { return platform() === 'macos'; } catch { return false; }
})();

// Map our internal icon names (which mirror Lucide) to SF Symbol names.
// Only entries listed here get the SF Symbol treatment — anything else
// renders as the existing Lucide SVG.
const SF_BY_NAME: Record<string, string> = {
  // Set sourced from SF Symbols 5+, all available on macOS 14+.
  keyboard:           'keyboard',
  pencil:             'pencil',
  trash:              'trash',
  refresh:            'arrow.clockwise',
  scissors:           'scissors',
  plus:               'plus',
  tag:                'tag',
  sparkles:           'sparkles',
  history:            'clock.arrow.trianglehead.counterclockwise.rotate.90',
  'arrow-up-circle':  'arrow.up.circle.fill',
  download:           'square.and.arrow.down',
  settings:           'gear',
  copy:               'doc.on.doc',
  link:               'link',
  power:              'power',
  star:               'star',
  pin:                'pin',
  user:               'person.crop.circle',
  info:               'info.circle',
  globe:              'globe',
  clipboard:          'clipboard',
  layers:             'square.stack.3d.up',
  filter:             'line.3.horizontal.decrease.circle',
  image:              'photo',
  type:               'textformat',
  'file-text':        'doc.text',
  eye:                'eye',
  store:              'bag.fill',
  puzzle:             'puzzlepiece.extension.fill',
  'cloud-upload':     'icloud.and.arrow.up',
  palette:            'paintpalette',
  'ai-chat':          'sparkles',
  snippets:           'chevron.left.forwardslash.chevron.right',
  calculator:         'function',
  // dev-tools, calc-* and a few others have no clean SF mapping; leave
  // them as Lucide.
};

/** What the JS side gets back from the Rust command. */
interface SymbolMaskRaw {
  png_b64: string;
  width: number;
  height: number;
}

/** What callers in this module get back. */
export interface SymbolMask {
  url: string;
  /** Natural width of the symbol at the requested point size (CSS px). */
  width: number;
  /** Natural height of the symbol at the requested point size (CSS px). */
  height: number;
}

// Cache of resolved masks per (name, size). Weight is fixed at "regular"
// for now — broaden the key if we expose weight to callers.
const MASK_CACHE = new Map<string, Promise<SymbolMask | null>>();

function cacheKey(symbol: string, size: number): string {
  return `${symbol}|${Math.round(size)}`;
}

/** Resolve a Lucide-name to an SF Symbol identifier, or null if unmapped. */
export function sfSymbolFor(name: string): string | null {
  if (!IS_MACOS) return null;
  return SF_BY_NAME[name] ?? null;
}

/**
 * Returns a `SymbolMask` ({ url, width, height }) for the given symbol
 * at the given size, or null on non-macOS / unmapped name / render
 * failure. Coalesces concurrent requests so the Rust side renders each
 * symbol at most once per size.
 */
export async function sfSymbolMask(name: string, size: number): Promise<SymbolMask | null> {
  const symbol = sfSymbolFor(name);
  if (!symbol) return null;

  const key = cacheKey(symbol, size);
  const existing = MASK_CACHE.get(key);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const raw = await invoke<SymbolMaskRaw>('render_sf_symbol_mask', {
        name: symbol,
        size,
        weight: 'regular',
      });
      return {
        url: `data:image/png;base64,${raw.png_b64}`,
        width: raw.width,
        height: raw.height,
      };
    } catch {
      return null;
    }
  })();

  MASK_CACHE.set(key, pending);
  return pending;
}
