## 2026-08-28 - Focus Visible with Outline None
**Learning:** The popup UI relies heavily on global `outline: none` properties for buttons and inputs, breaking default browser focus outlines for keyboard users.
**Action:** Add a global `button:focus-visible` style utilizing `outline` and `outline-offset` to restore keyboard accessibility without affecting mouse users.
