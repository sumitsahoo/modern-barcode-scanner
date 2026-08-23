# Scanner interface design audit

## Outcome

The scanner interface was visually reviewed end to end on 2026-08-20. Idle, camera-starting, active-camera, successful-result, and recoverable-error states remain legible and contained across desktop, tablet, portrait-mobile, narrow-landscape, and short-landscape layouts, including enlarged browser text and component-sized embeds.

The deeper Hallmark stress pass found a critical 200% error-panel reflow defect plus actionable component-sizing, overlay-collision, contrast, hostile-content, ultra-short-dialog, and regression-coverage gaps. After remediation, an independent repeat audit reached **0 critical · 0 major · 0 minor**. A later 320 × 360 paint-level regression at 200% text found one remaining major edge case: the decoded result value can flex below a full line-height even though every dialog action remains reachable. The current verdict is therefore **0 critical · 1 major · 0 minor** until that content viewport is corrected.

![Modern Barcode Scanner scanner-ready desktop idle state](./assets/scanner-idle.jpg)

## Design system

- Genre: modern-minimal
- Macrostructure: Workbench
- Theme: Cobalt
- Tone: precise, calm, technical
- Type: Space Grotesk display, Inter body, JetBrains Mono labels
- Icon language: custom 24 × 24 SVG grid, 1.75 px optical stroke, round caps and joins
- Brand consistency: the canonical scan-frame logo is reused for both the brand mark and scanner standby state
- Viewfinder language: four continuous rounded corner brackets with dark/light safety rails, four calibration ticks, a one-pixel scan beam, and a restrained off-region scrim
- Motion: transform/opacity only, with reduced-motion fallbacks and a stationary forced-colors scan cue

The screenshot above is captured from the deterministic `?demo-state=idle` route at 1440 × 900. It was compared with a fresh capture after the 2026-08-20 CSS changes and remains an accurate UI reference, not a simulated browser or device frame.

## Layout matrix

Each viewport below was reviewed in all five deterministic states: idle, starting, active, result, and error.

| Layout                  | Viewport    | Result                                                                                          |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| Short portrait mobile   | 320 × 480   | Viewfinder and Stop action retain clear separation; all controls stay contained                 |
| Compact portrait mobile | 320 × 568   | No clipped surfaces; controls retain 44 px minimum targets                                      |
| Mobile                  | 375 × 667   | Compact brand treatment and stacked dialog actions remain legible                               |
| Wide mobile             | 414 × 896   | Full brand label returns without crowding the theme control                                     |
| Tablet                  | 768 × 1024  | Viewfinder, dialog, error panel, and actions remain comfortably spaced                          |
| Short landscape         | 844 × 390   | Opaque hint and every camera overlay remain clear of the viewfinder and scan beam               |
| Compact desktop         | 1280 × 800  | Hierarchy and asymmetric workbench composition remain balanced                                  |
| Reference desktop       | 1440 × 900  | Matches the maintained README screenshot; no overflow or collision                              |
| Large desktop           | 1920 × 1080 | Scanner content remains deliberate rather than over-expanded; overlays keep their visual weight |

All 45 base state/layout combinations had zero document-level horizontal and vertical overflow. Visible text actions remained on one line, and every interactive control measured at least 44 × 44 CSS pixels. Additional adversarial review covered 568 × 320 and 320 × 360, device-pixel ratios 1/2/3, 125/150/200% text sizing, 250/320/480 px embedded hosts, black and white accents over dark and bright feeds, dark mode, reduced motion, forced colors, and long unbroken errors. Those automated geometry checks pass, but the later 320 × 360/200% paint review showed the result value at 33.9 px high against a 39.7 px line-height, so one complete output line cannot be displayed at once. Browser console review found no warnings or errors.

## Remediation details

- Component container queries now size the viewfinder from its host instead of the outer viewport; media-query fallbacks remain for older engines.
- Mobile and landscape overlays reserve collision-free frame space through 200% text sizing. Redundant decorative marks or hints yield only when enlarged text needs that space.
- Header, theme, camera, and action geometry retains fixed accessible control dimensions while labels continue to scale. The 568 × 320, 320 × 360, and 320 × 480 stress layouts remain separated.
- Error copy wraps hostile identifiers and scrolls within a bounded recovery sheet. Ultra-short result dialogs reduce decorative space while keeping Copy, Scan again, and Close visible; the decoded-value viewport still needs a full-line minimum at 320 × 360/200% text.
- Every corner uses an outer dark rail, a light inner rail, and the selected accent. The scan beam uses the same dual-tone principle, so black-on-dark and white-on-bright themes remain visible.
- Rendered PNG pixels—not only computed mask declarations—are asserted for all eight bracket arms in Chromium and WebKit. The original clipped-corner failure now has a direct regression check.
- Forced-colors mode gives the standby mark, brackets, hint, controls, and stationary scan cue explicit system-color treatment. Reduced-motion mode removes animation without removing state or contrast.

## State findings

| State    | Visual checks                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Idle     | Brand, ready mark, instructional hierarchy, accent picker, and primary action remain distinct                                           |
| Starting | Progress state is communicated through label, camera symbol, and restrained motion                                                      |
| Active   | Viewfinder is dominant; rounded accent arcs stay continuous; hint, brand, theme, stop, camera switch, and torch controls do not overlap |
| Result   | Dialog and actions remain contained, but the decoded-value viewport clips below one full line at 320 × 360 and 200% text                |
| Error    | Bounded alert copy wraps hostile strings; retry and close stay reachable at 200% without exposing raw decoder codes                     |

## Automated coverage

The visual review is backed by browser assertions in `tests/browser/visual-layout.spec.ts`:

- the full five-state matrix at 320 × 480, 320 × 568, 375 × 667, 414 × 896, 768 × 1024, 844 × 390, 1280 × 800, 1440 × 900, and 1920 × 1080;
- zero horizontal or vertical overflow and full-viewport containment;
- 44 px control targets and single-line button labels;
- non-overlapping active-camera overlays through 200% text at 320 × 360, 320 × 480, 375 × 667, 568 × 320, 844 × 390, and 1440 × 900;
- component-relative viewfinder geometry inside 250, 320, and 480 px desktop hosts;
- rendered accent pixels in every horizontal and vertical corner arm, plus dual-tone visibility with black and white accents;
- 320 × 360 result actions, hostile unbroken error copy, compact dialog sizing, and keyboard-focus containment; decoded-value line containment is not yet asserted;
- combined dark/reduced-motion behavior, high-contrast standby treatment, and explicit Chromium forced-colors cues, with capability-specific assertions skipped in WebKit.

The final 2026-08-20 verification completed 18 unit/integration files with 176/176 tests passing in both default and serialized modes. The selected browser projects scheduled 33 tests: 31 Chromium, WebKit, inline-worker, and Chromium fake-camera checks passed, with two WebKit forced-colors assertions skipped as expected because that emulation is Chromium-specific.

The configured Firefox project remains in the repository and CI matrix. On this local macOS host, the bundled Firefox runtime stalled before application code executed; the attempt produced no application assertion failure. Chromium and WebKit completed the corresponding visual and worker checks, and Chromium completed the fake-camera flow.

## Reproducing the review

Start the demo:

```bash
npm run dev
```

Open the camera-free component matrix:

```text
http://localhost:8080/?visual-audit
```

Open a complete deterministic state by replacing `<state>` with `idle`, `starting`, `active`, `result`, or `error`:

```text
http://localhost:8080/?demo-state=<state>
```

Run the automated gates:

```bash
npm run check
npm test
npx playwright test --project=chromium --project=webkit --project=chromium-camera
```
