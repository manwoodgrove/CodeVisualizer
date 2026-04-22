## 2024-05-18 - Missing Focus Indicators & ARIA Labels
**Learning:** Relying purely on placeholder text without `aria-label` or explicit labels causes screen readers to skip vital context in inputs. In addition, resetting default focus outlines without providing a visual `:focus-visible` alternative makes keyboard navigation impossible.
**Action:** Always add `aria-label` when labels are missing visually (or on icon-only buttons), and ensure all interactive elements have a clear `:focus-visible` state.
