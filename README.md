# SLI Dev Tools v4.0.0

A Chrome DevTools extension for debugging SLI search integrations. It intercepts SLI search requests, fetches the XML debug profile, and presents the data in a structured panel inside Chrome DevTools.

---

## Installation

### Prerequisites

- Google Chrome (v105+)
- Git

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/sambotting/sli-devtools-v2.git
   ```

2. **Open Chrome Extensions**

   Navigate to `chrome://extensions` in Chrome.

3. **Enable Developer Mode**

   Toggle **Developer mode** on (top-right corner).

4. **Load the extension**

   Click **Load unpacked** and select the cloned `sli-devtools-v2` folder.

5. **Open DevTools**

   On any SLI-powered search page, open Chrome DevTools (`F12`) and select the **SLI** panel.

---

## Functionality

### Automatic Request Detection

The extension automatically detects SLI search requests as they complete (or from HAR history if DevTools was opened after the page loaded). Detection uses:

- **`X-SLI-ResultInfo` response header** — injected by the extension via `declarativeNetRequest`
- **URL pattern fallback** — `sli_p=` parameter, or `ts=ajax` / `ts=rac`

### Profile Pages

Detected requests are split into three profile pages — **Parent**, **Ajax**, and **RAC** — each with six tabs:

| Tab | Content |
|-----|---------|
| **Summary** | Search request details, sources, dynamic template component URL |
| **Status** | Raw status tree from the XML profile |
| **Input** | Input parameters tree |
| **Output** | Output data tree |
| **Results** | Individual search results |
| **Timing** | Per-stage timing breakdown |

### Summary Tab

- **Search Request** — Searcher ID, client name, machine, CGI URL
- **Sources** — Collapsible list of search sources, each showing their last query URLs. Mobile sources are filtered out.
- **Dynamic Templates – Components** — Fetches `tb.json` for the detected environment (local / demo / prod) and resolves the dynamic template component URL for the current template set and collection. Hidden automatically if no component is found.

### Result Info Tab

Displays structured result data and facets from the last SLI response.

### LR Debugger Tab

Dedicated panel for Learning to Rank (LR) debugging.

### Theming

Light and dark themes with a toggle button in the toolbar. The chosen theme persists via `localStorage`.

---

## v4.0.0 — Changes & Fixes

This version is a near-complete rewrite to restore compatibility with **Chrome Manifest V3** and modernise the UI.

### MV2 → MV3 Migration

- Replaced removed `webRequestBlocking` with `declarativeNetRequest` dynamic rules to inject the `x-sli-debug: resultinfo` request header.
- Replaced `chrome.extension.connect` with `chrome.runtime.sendMessage` for cross-origin XHR proxying through the background service worker.
- Removed all inline event handlers from HTML (CSP violation in MV3).

### Request Detection

- Removed hardcoded site-specific logic — detection is now fully generic.
- Fixed false-positive detection of non-SLI requests (e.g. numeric `ts=` timestamps from third-party scripts).
- Added HAR replay on DevTools open so requests made before the panel was opened are not missed.

### Summary Tab

- Fixed duplicate "SEARCH REQUEST" section caused by leftover static HTML.
- Fixed Sources not displaying — corrected XML selector from `sources source` to `status Finder SearchSource`.
- Added per-source collapsible sections with query URLs; sources with no URLs or matching "mobile" are skipped.
- Added async Dynamic Templates – Components lookup via `tb.json` with environment auto-detection (local/demo/prod).
- Removed Speller section.

### UI & Theming

- Rewrote CSS with custom properties supporting dark (default) and light themes.
- Fixed tree view tabs (Status, Input, etc.) that were unreadable due to missing background and alternating row colours.
- Fixed row hover highlight applying to entire parent nodes — hover now only highlights leaf rows.
- Fixed white background bleed in dark mode.
- Theme preference persists across sessions via `localStorage`.
