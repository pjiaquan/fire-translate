## 2024-05-18 - [Title]
**Vulnerability:** Found unescaped user input `errorMsg` or `troubleshooting` used in `testDetailMsg.innerHTML`.
**Learning:** XSS vulnerability through manipulating innerHTML with untrusted data.
**Prevention:** Use `textContent` instead of `innerHTML` or escape any HTML data before inserting using `innerHTML`.
## 2024-05-18 - [Fix Stored XSS in History Card Rendering]
**Vulnerability:** The history UI (`popup.js` `renderHistory`) generated HTML via `innerHTML` but failed to escape dynamically resolved `srcLangText` and `targetLangText` variables which may come from tampered history storage, exposing a Stored Cross-Site Scripting (XSS) vulnerability.
**Learning:** Always explicitly wrap dynamically interpolated variables in `escapeHTML()` when assembling DOM nodes with `innerHTML`, even if the underlying object attributes (like `item.srcLang`) seem constrained or "safe" during nominal operation.
**Prevention:** Systematically vet every template literal used with `innerHTML` to ensure all injected `${...}` variables are protected by an HTML escaper utility or use `textContent` where applicable.
