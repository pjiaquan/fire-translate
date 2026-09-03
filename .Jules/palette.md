## 2024-09-03 - Button Type and Accessibility Enhancement
**Learning:** Found several dynamically injected icon-only buttons (`.history-delete-btn`, `.btn-remove-exclusion`, `.bubble-copy-btn`, `.bubble-close`) missing `aria-label` and `type="button"`, as well as static buttons missing `type="button"` in `popup.html`.
**Action:** Always verify `type="button"` and `aria-label` presence for dynamically generated buttons in JS, not just static HTML elements.
