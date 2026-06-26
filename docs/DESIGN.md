# WhoCards design specification

Use this document for every user-facing web, mobile, email, store, and print change. Preserve the
same brand across surfaces, but implement components locally as required by
[`ADR-0003`](./adr/0003-no-shared-ui-layer.md). Shared values belong in `@whocards/tokens`.

## Product character

WhoCards is a quiet invitation into a meaningful conversation: warm, curious, direct, and human.
The interface should feel intimate rather than corporate, playful rather than gamified, and bold
without becoming loud. The Question is always the focus; decoration supports it.

The visual signature is a luminous yellow-to-violet accent against a deep aubergine night sky,
with rounded Card-like forms and large, closely set display type. Spend visual emphasis on one
primary action or one Question per view.

## Foundations

### Colour

Use semantic roles backed by `packages/tokens/src/colors.ts`; never introduce a near-duplicate.

| Role             | Token                          |     Value | Use                                         |
| ---------------- | ------------------------------ | --------: | ------------------------------------------- |
| Canvas           | `background`                   | `#0d051f` | Default page/screen background              |
| Deep canvas      | `darkest`                      | `#08001a` | Navigation and maximum-depth areas          |
| Surface          | `dark`                         | `#262432` | Cards, panels, email body                   |
| Primary accent   | `yellow-400` / `primary-light` | `#f9d75f` | Primary action, focus, key label            |
| Secondary accent | `primary-dark`                 | `#c058d2` | Selection, secondary emphasis, gradient end |
| Primary text     | `white`                        | `#f5f5f5` | Main text on dark surfaces                  |
| Muted text       | `gray-dark`                    | `#9698af` | Supporting copy and metadata                |
| Light rule       | `gray-lighter`                 | `#dcdee9` | Light-surface rules and muted email text    |
| Error            | `red`                          | `#ee1e23` | Error text and invalid borders only         |

The brand gradient runs yellow to violet. Reserve it for display text or a single focal treatment;
never use it as routine panel decoration. On light surfaces use `darker` text and verify contrast.

### Type

- Display: **Aptly**, bold. Use for page titles, section titles, and Question-led statements.
- Body/UI: **Golos Text**. Use for prose, labels, buttons, navigation, and metadata.
- Chinese, Hebrew, and Japanese Questions: use the matching Noto face where bundled; otherwise use
  the documented system fallback. Set the correct `lang` and direction.
- Email: use the Arial/Helvetica stack from `apps/emails/src/brand.ts`; custom fonts are not reliable.

Use sentence case. Display headings may be large and tightly tracked, but body copy should remain
comfortable: roughly 16–18 px with 1.5–1.65 line-height. Avoid all caps except short email eyebrows.
Do not use uppercase for ordinary controls.

### Shape, spacing, and depth

- Use the existing spacing scale. Prefer 4, 8, 12, 16, 20, 24, 32, 48, and 64 px intervals.
- Controls and fields use 12–16 px radii. Cards/panels use 20–24 px. Primary mobile and email CTAs
  are pill-shaped. Do not mix several radius styles in one component group.
- Prefer borders and tonal separation to shadows. Use a soft shadow only when layers genuinely
  overlap, such as device mockups or modal sheets.
- Keep content within the established web container (`max-w-7xl`); readable prose and forms should
  be much narrower. Mobile screens use at least 20 px side padding, normally 32 px for focal views.

## Composition

Each view needs a clear hierarchy: context, focal message or Question, supporting copy, then the
primary action. One action is visually primary. Secondary actions use an outline or quiet text link.
Do not place two filled yellow actions beside each other.

Build mobile-first. Stack content and actions on narrow screens; introduce columns only when both
columns remain useful and balanced. Respect safe areas, notches, browser chrome, long translations,
keyboard opening, and landscape. Do not encode meaning through colour or position alone.

Cards are the product metaphor, not a generic container. Use a Card treatment for Questions,
examples, or content that is conceptually drawn from a Deck—not for every section.

## Components and interaction

### Actions

- Primary: yellow background, dark text, explicit verb (`Play`, `Send message`, `Get the app`).
- Secondary: transparent surface with a visible border; white on dark backgrounds or violet where
  appropriate on light backgrounds.
- Destructive actions: red only when an action is actually destructive.
- Minimum touch target: 44 × 44 px. Show hover, pressed, disabled, loading, and keyboard-focus states.
- Keep the same verb through action and confirmation: `Send message` → `Message sent`.

### Forms

Place visible labels above fields; placeholders are examples, never labels. Required status must be
explicit and consistent. Preserve entered values after failure. Put a specific error beside its
field and a short summary above the form when useful. Never rely on red alone.

Disable duplicate submission and show progress without changing layout. Success replaces or clearly
supersedes the form and offers the logical next action. Empty and error states explain what happened
and what the person can do next. Avoid generic `Something went wrong` copy.

### Navigation, overlays, and feedback

Keep navigation subordinate to the current Question or page task. Modal titles and close controls
must remain inside safe areas. Use native sheets and controls on mobile when they improve platform
expectations; preserve WhoCards colour and type around them. Give icon-only controls an accessible
name and visible focus state.

Motion should explain continuity: splash-to-home handoff, Card movement, sheet entry, or control
feedback. Prefer one composed transition over scattered animation. Keep interaction transitions
around 200–300 ms, use physical spring motion only for direct manipulation, and fully respect
reduced-motion preferences. Mobile taps may use subtle scale and light haptics; never make feedback
depend on haptics.

## Surface rules

### Website

Default to the deep background, Aptly headings, Golos body, restrained background artwork, and the
shared `Button`, `Input`, and related local primitives. Reuse existing components before adding a
new variant. Every interactive state must work with keyboard alone. Keep the footer and navigation
visually quieter than page content.

### Mobile

The Question occupies the available space and chrome stays minimal. Use safe-area containers,
orientation-aware layout, offline-safe states, native sharing, and platform-appropriate sheets.
Question text may scale to fill its box, but must retain breathing room and never clip. Test the
smallest supported phone, a notched Android device, iPhone, and landscape.

### Email

Build with `EmailShell`, `BrandCard`, `BrandButton`, and `emailBrand`. Keep the body at or below
600 px, use inline email-safe CSS, a dark outer canvas, one clear CTA, and a useful plain-text
version. Aim for 17 px body text and 25–27 px line-height. Include preview text, descriptive links,
and a visible fallback URL. Never communicate essential information through an image alone. Verify
mobile and desktop rendering, dark mode, long URLs, and images-off behaviour.

### Store and print assets

Use real product screens and real Questions. Store screenshots need one promise per frame, minimal
caption copy, and safe margins for store cropping. Print output prioritizes exact physical geometry
and legibility over web decoration; never scale calibration-sensitive output to fit.

## Mobile v1 launch alignment

For the first mobile release, this specification is subordinate to `docs/RELEASE.md` and
`docs/growth/04-app-launch-plan.md`. Agents must preserve these product and launch constraints:

- The v1 journey is landing → the single WhoCards Deck → Global Game. Do not imply that Library
  browsing, accounts, purchases, Custom Decks, Personal Game, or Facilitation already exist.
- `/app` is gated by `APP_VISIBLE` (`PUBLIC_APP_WAITLIST_ENABLED` OR `PUBLIC_APP_LAUNCHED`) and is
  hidden by default — both flags off redirects it home. Opening the waitlist
  (`PUBLIC_APP_WAITLIST_ENABLED=true`) collects a one-time public-download notification; launch mode
  (`PUBLIC_APP_LAUNCHED=true`) leads with both store badges, ordered for the visitor's device. Never
  show placeholder store links or claim availability early.
- App-notification and newsletter consent are separate. Newsletter consent is optional, unchecked,
  and described plainly; confirmation copy must reflect exactly what the person selected.
- iOS and Android are one launch promise. Do not visually privilege one platform except by
  device-aware badge ordering. Public binaries complete a 24-hour quiet soak before `/app` flips,
  launch CTAs activate, or the launch Broadcast is sent.
- Optimize every acquisition surface for the next meaningful step: `/app` → signup or store click;
  install → first play. Keep store, email, homepage, and in-product CTA wording consistent.
- The native review request may appear only after the documented happy-moment eligibility gate.
  Never add a custom pre-prompt, review gating, or copy claiming that a rating was submitted.
- Analytics UI and copy must not expose raw email or imply cross-app tracking. Support and privacy
  links remain easy to find independently of review sentiment.
- Store creative must truthfully show the release candidate: landing, English Question, language
  picker, Hebrew RTL Question, and sharing. Produce iOS and Android sets plus the Play feature
  graphic at the dimensions in `docs/mobile/store-listing.md`.
- Release-candidate design QA follows the same critical journey as the device smoke test: cold
  launch and splash handoff, first play, swipe, language switch and RTL, persisted language, share,
  background/reopen, offline/reconnect, and deep-link/back.

## Voice

Write from the player’s side of the screen in plain, active language. Use the domain vocabulary in
`CONTEXT.md`: **Question**, **Card**, **Deck**, **Library**, and **Game** are distinct concepts.
Prefer specific, calm guidance over slogans. Do not use technical implementation terms, exaggerated
claims, apology-heavy errors, or clever labels that obscure an action.

Questions and invitations can be warm. Controls and operational messages must be literal. Keep
paragraphs short and remove any sentence that does not help someone understand, decide, or act.

## Definition of done

Before shipping user-facing work:

- Use existing tokens and local primitives; add shared values to `@whocards/tokens` first.
- Check visual hierarchy at narrow mobile, wide mobile/landscape, tablet, and desktop widths.
- Check keyboard, screen-reader names, focus visibility, contrast, reduced motion, and 200% zoom.
- Check loading, empty, success, validation, network failure, disabled, and long-content states.
- Check safe areas and touch targets on mobile; check major clients and plain text for email.
- Use real copy and representative Questions; verify English plus at least one long translation and
  one RTL or CJK example where the surface is multilingual.
- Capture a screenshot/render and compare it with an established adjacent surface before approval.

If a design intentionally breaks this specification, document the user benefit and the new rule it
establishes. One-off visual exceptions without a product reason should not ship.
