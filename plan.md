1. *Create `utils.js`*
   - Define `cleanTranslateText` function in `utils.js` and export it.
2. *Modify `manifest.json`*
   - Add `utils.js` to `content_scripts` array before `content.js`.
   - Cannot directly use `importScripts` in service workers unless we specify it in the file. Wait, in manifest v3 service worker, we can just `importScripts('utils.js')` in `background.js`. Wait, better yet, `importScripts` or use ES modules. Let's see if background is an ES module. `manifest.json` says `"service_worker": "background.js"`. It does not specify `"type": "module"`. So we can use `importScripts('utils.js')` in `background.js`.
   - `popup.html` should include `<script src="utils.js"></script>` before `<script src="popup.js"></script>`.
   - `tests.js` needs to load `utils.js` as well.
