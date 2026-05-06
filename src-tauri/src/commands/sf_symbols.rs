//! SF Symbols mask renderer.
//!
//! On macOS this delegates to `platform::macos::sf_symbols::render_sf_symbol_mask`,
//! which calls into AppKit (`NSImage(systemSymbolName:)` → tinted white →
//! PNG bytes) and returns the PNG base64 plus the symbol's natural CSS
//! size (so the consumer can size its mask box correctly — SF Symbols
//! aren't all square). The Icon component uses the result as a CSS
//! `mask-image`, so a single cached PNG per (symbol, size, weight)
//! covers every theme + destructive variant.
//!
//! On non-macOS the command is registered but always errors. The frontend
//! Icon component checks the platform first and never invokes it off macOS,
//! so the stub is dead code at runtime — it exists only because Tauri's
//! `generate_handler!` macro requires every command name to be known at
//! compile time.

#[cfg(target_os = "macos")]
pub use crate::platform::macos::sf_symbols::SymbolMask;

#[cfg(not(target_os = "macos"))]
#[derive(serde::Serialize)]
pub struct SymbolMask {
    pub png_b64: String,
    pub width: f64,
    pub height: f64,
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn render_sf_symbol_mask(
    name: String,
    size: f64,
    weight: Option<String>,
) -> Result<SymbolMask, String> {
    crate::platform::macos::sf_symbols::render_sf_symbol_mask(name, size, weight)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn render_sf_symbol_mask(
    _name: String,
    _size: f64,
    _weight: Option<String>,
) -> Result<SymbolMask, String> {
    Err("SF Symbols only available on macOS".into())
}
