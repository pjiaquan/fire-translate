## 2024-05-24 - Dynamic Button Accessibility
**Learning:** Dynamically injected buttons in vanilla JS often miss explicit `type="button"` and `aria-label`s, which can cause form submission bugs and make icon-only buttons invisible to screen readers.
**Action:** Always include `type="button"` and appropriate `aria-label`s when constructing HTML strings for buttons in JS files.