## 2024-11-20 - Global Focus Visible Accessibility
**Learning:** The application heavily used `outline: none` for inputs and textareas, but buttons and links had no `focus-visible` styling at all.
**Action:** Added global `focus-visible` rule in `popup.css` for `button`, `a`, `[role="button"]`, and `input[type="checkbox"]` using the existing `--accent-color-1` to ensure consistent keyboard navigation focus rings without introducing arbitrary new colors.
