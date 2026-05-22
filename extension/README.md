# this person — extractor extension

A minimal Chrome (MV3) extension that sends the **visible text of the current
tab** to the `this person` extraction chamber's import route. It is one of the
extraction methods of the artwork; the web app works fully without it.

## What it does

When you click the toolbar button, it injects `content-extract.js` into the
active tab, reads `document.body.innerText` (the visible text), and opens
`/labs/this-person/import#payload=…` with that text encoded in the URL
fragment. The chamber decodes the fragment client-side, shows you the extracted
text and parsed fragments, and appends nothing until you confirm.

## What it does not do

- It runs **only** when you click it — never in the background, never on
  arbitrary pages.
- It requests only `activeTab` and `scripting` — no broad host permissions.
- It reads visible text only. It does **not** read cookies, `localStorage`,
  passwords, form values, or network data, and it does not automate login.
- The payload travels in the URL **fragment**, which browsers never send to a
  server. Nothing reaches the worker until you preview and confirm.

## Install (unpacked)

This is a no-build extension — plain JavaScript, load it directly:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the **this person — extractor** action to the toolbar.

## Configure

`popup.js` has one constant, `IMPORT_BASE`. It defaults to
`https://cbassuarez.com/labs/this-person/import`. For local development point it
at your dev URL, e.g. `http://localhost:5173/labs/this-person/import`, and
reload the extension.

## Use

1. Open an ad-preference or profile page (Google My Ad Center, Meta Ad
   Preferences, an Amazon advertising-preferences page, …).
2. Click the **this person — extractor** toolbar button.
3. Click **extract this tab**. The import route opens in a new tab with the
   visible text already loaded; review it, generate the portrait, and append.
