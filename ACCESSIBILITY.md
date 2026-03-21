# Accessibility checklist

This project aims to be accessible. Use this checklist as a starting point for audits and fixes.

- [ ] Run automated checks (axe, pa11y) on critical pages (`/media`, `/settings`, `/admin/log-health`).
- [ ] Ensure all interactive controls have keyboard focus styles and logical tab order.
- [ ] Add `aria-label` or visible labels for icon-only buttons.
- [ ] Verify color contrast meets WCAG AA for text and UI components in both light/dark themes.
- [ ] Ensure form fields have associated labels and proper `aria-invalid` states on errors.
- [ ] Add `role="alert"` to status messages where appropriate.
- [ ] Test with screen readers (NVDA/VoiceOver) for primary flows.

If you want, I can run quick automated checks on built static pages (if a test harness is available).
