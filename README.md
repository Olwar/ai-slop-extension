# AI Writing Signs

Browser extension (Chrome + Firefox) that highlights telltale signs of AI-generated writing on any web page, based on [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).

- Strong signals get a darker yellow, weak ones a lighter yellow.
- Hover a mark to see the reason ("“No X, no Y” chains · 3 items").
- Chains ("no sign-ups, no downloads, no hassle") get a count badge.
- Toolbar badge shows the number of marks on the page.

## Turn it off

- Click the toolbar icon and flip **Highlight AI signs** (global), or **Enable on this site** (per host).
- Keyboard: `Alt+Shift+A` toggles globally.
- **Show weak signals** hides the noisier rules (common words, em dashes, rule of three).

Highlights are removed live; no reload needed.

## Build

```sh
./build.sh
```

Produces `dist/chrome/`, `dist/firefox/` and zips for both.

## Install

**Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome`.

**Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/firefox/manifest.json`.
For a permanent install, sign `dist/ai-writing-signs-firefox.zip` via addons.mozilla.org (unlisted) or use Firefox Developer Edition with `xpinstall.signatures.required = false`.

## Add or tune rules

Edit `src/rules.js`. Each rule has an `id`, `cat`, `label`, `weight` (`strong`/`weak`) and a regex. Chain rules add `chain: true` and a `count` regex used for the badge number.
