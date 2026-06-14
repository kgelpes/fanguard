---
name: FanGuard
description: One-tap "insure your night" blowout cover at ticket checkout
colors:
  ink: "oklch(0.145 0 0)"
  paper: "oklch(1 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  surface-muted: "oklch(0.97 0 0)"
  muted-ink: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.025em"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  full: "9999px"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  card: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
    height: "2.5rem"
---

# Design System: FanGuard

## 1. Overview

**Creative North Star: "The Calm Receipt"**

FanGuard is a receipt you actually trust. A fan who just spent $250 on tickets has 10
seconds and zero patience for jargon; the interface answers one question — *am I protected,
and for how much?* — the way a good receipt does: plain, legible, nothing to decode. The
warmth in "warm · human · fan-energy" is carried by **clarity and plain language**, not by
ornament. Quiet confidence reads as on-your-side; visual noise reads as a sales pitch.

The system is intentionally restrained: a near-monochrome ink-on-paper base where the **money
is the only thing that shouts**. Dollar amounts are the largest, heaviest, most contrast-rich
elements on every screen; everything else (labels, helper text, chrome) recedes behind them.
Density is low — one decision per screen, generous breathing room, a single primary action.
This restraint is the point, not a placeholder: a calm receipt has no business being colorful.

What it explicitly rejects (from `PRODUCT.md`): the **gambling / sportsbook** look (neon,
live odds, parlay hype), the **crypto / web3 degen** look (charts, gas, wallet-address-as-hero,
dark-neon), the **generic SaaS dashboard** (sterile templated cards-everywhere, gray-on-gray,
the big-metric hero), and **heavy insurance / legalese** (dense forms, fine print, cold
institutional blue). The current palette is a clean neutral foundation; the one piece of
identity still owed is a **single warm accent** to carry the brand's humanity — see the Color
Debt Rule below.

**Key Characteristics:**
- Ink-on-paper restraint; money is the only loud element.
- Dollars only — never a percentage or an odd, ever (a `PRODUCT.md` hard line).
- One screen, one decision, one primary action.
- Plain language over jargon; "your wallet" and "$", never `0xDd…F8D2` or "USDC contract".
- Warmth comes from copy + a single accent, not from decoration.

## 2. Colors

A near-monochrome ink-on-paper palette: every surface and text token is a true neutral
(OKLCH chroma 0), and the only saturated color in the system today is the error red. Color is
information, never decoration.

### Primary
- **Ink** (`oklch(0.205 0 0)`, near-black): the primary-action color. Primary buttons, the
  most important amount, and the darkest text all sit here. In a monochrome system the
  "primary" is simply maximum contrast — FanGuard's call-to-action is black ink on paper.
- **Paper** (`oklch(1 0 0)`, pure white): the page and card background, and the text that sits
  on Ink (`primary-foreground` `oklch(0.985 0 0)`).

### Neutral
- **Body Ink** (`oklch(0.145 0 0)`): default foreground for headings and body copy.
- **Muted Ink** (`oklch(0.556 0 0)`): helper text, captions, secondary labels. Verify ≥4.5:1
  before using on anything but Paper — on `surface-muted` it is borderline; bump toward Body
  Ink if in doubt.
- **Surface Muted** (`oklch(0.97 0 0)`): the faint fill behind secondary/ghost controls and
  inset blocks.
- **Hairline** (`oklch(0.922 0 0)`): the current border/divider color (see the No-Border Rule
  — this is being retired in favor of tonal steps).
- **Focus Ring** (`oklch(0.708 0 0)`): keyboard focus indication.

### Tertiary (semantic state — not yet tokenized)
- **Error Red** (`oklch(0.577 0.245 27.325)`): the only saturated token. Failed payments,
  invalid input. Never decorative.
- **Success / Warning** are currently raw Tailwind utilities in components (`emerald-600` for
  "you're covered", `amber` for the test-mode banner), not tokens. Promote them to named
  semantic tokens when the accent lands.

### Named Rules
**The Receipt Rule.** The surface is ink-on-paper. Color appears only to *mean* something — a
payout (success), a failure (error) — never to fill space or add flavor. If a color isn't
carrying meaning, it's wrong.

**The Color Debt Rule.** The system owes exactly one thing: a single warm brand accent
(`PRODUCT.md`: *warm · human · fan-energy*) for the primary "protect"/"covered" moment. Until
it lands, primary actions ride on Ink. Resolve it deliberately (run `colorize`) — do **not**
sprinkle multiple new colors; the Receipt Rule still governs.

## 3. Typography

**Display / Body / Label Font:** the system sans stack (`ui-sans-serif, system-ui,
sans-serif, …`). One family, multiple weights — no display pairing.

**Character:** unfussy and native. A system sans renders crisply at small sizes on the phones
this is built for, and disappears into the task — exactly right for a receipt. Personality
comes from weight and the dollar-figure scale, not from a typeface.

### Hierarchy
- **Headline** (600, 1.5rem / `text-2xl`, line-height 2rem): the page title ("FanGuard
  checkout"). One per screen.
- **Title** (600, 1.25rem / `text-xl`): section headings ("Protect your $250 night").
- **Amount** (600, 1.125–1.25rem, `tabular-nums`): dollar figures. The visual hero — heavier
  and higher-contrast than its neighbors regardless of nominal size.
- **Body** (400, 0.875rem / `text-sm`, line-height 1.25rem): the default. Cap prose at 65–75ch.
- **Label** (500, 0.75rem / `text-xs`, letter-spacing 0.025em, often uppercase): field labels
  and eyebrows ("YOUR TICKET PRICE"). Restrict to form labels; do not scatter as decoration.

### Named Rules
**The Dollars-Are-The-Headline Rule.** Money always uses `tabular-nums` and always out-weighs
the copy around it. A premium or payout is the loudest thing in its card. Percentages and odds
are forbidden on fan-facing screens — spell the trigger in plain English ("if Saudi Arabia
wins big") instead.

## 4. Elevation

**Direction: tonal layering, no borders.** Depth is conveyed by stacked surface *tints* —
Paper for the page, a half-step-darker surface for raised cards, another step for insets — not
by lines or drop shadows. This suits the receipt metaphor (paper laid on paper) and the warm,
soft feel the brand wants.

**Current reality (the gap to close):** today the UI is flat and leans on a 1px **Hairline**
border to separate every card, plus a faint `shadow-xs` on buttons. Critically, `paper` and
the card background are the *same* white (`oklch(1 0 0)`), so there is no tonal separation to
lean on yet. Realizing this section means introducing 2–3 stepped surface tokens (e.g.
`surface-0` / `surface-1` / `surface-2` at descending lightness, ideally with a whisper of the
brand accent's hue) and removing card borders as they're replaced.

### Named Rules
**The No-Border Rule.** Don't reach for a border to separate two surfaces — step the tint
instead. A border is a last resort (e.g. an input's editable affordance), never the default
way to define a card.

**The Flat-By-Default Rule.** Surfaces are flat at rest. Any shadow is a *response to state*
(hover, press, a lifted popover), never ambient decoration — and never paired with a border on
the same element.

## 5. Components

Component feel: **tactile & confident** — controls look pressable and friendly, with real
hover/press feedback, never sterile.

### Buttons
- **Shape:** gently rounded (8px / `rounded-md`). Pills (`rounded-full`) are reserved for
  tags/badges and the branded Blink button.
- **Primary:** Ink background, Paper text, `0.5rem 1rem` padding, height 2.25rem (`h-9`).
  Hover darkens to 90% Ink.
- **Hover / Focus / Press:** `focus-visible` shows a 3px Focus-Ring halo. To deliver "tactile",
  add a subtle press: `:active { transform: scale(0.98) }` (with a reduced-motion fallback).
- **Outline / Secondary / Ghost:** Outline = Paper with a hairline + Surface-Muted hover;
  Secondary = Surface-Muted fill; Ghost = transparent, Surface-Muted on hover. (As tonal
  layering lands, Outline's border gives way to a tint step.)

### Cards / Containers
- **Corner Style:** 14px (`rounded-xl`). **Hard ceiling: 16px.** Never 24/32px+ on a card.
- **Background:** Paper today; migrating to a half-step surface tint (see Elevation).
- **Separation:** currently a 1px Hairline border — being retired per the No-Border Rule.
- **Internal Padding:** 1.25rem (`p-5`). Never nest a card inside a card.

### Inputs / Fields
- **Style:** Paper background, 1px `input` stroke, 8px (`rounded-md`), `0.75rem` horizontal
  padding, height 2.5rem (`h-10`). The `$` prefix sits inside the field, muted.
- **Focus:** a 2px Focus-Ring on the wrapper (`focus-within:ring-2`). Border is the one
  legitimate place lines stay.

### Navigation / Progress
- **Flow Stepper:** the three-step tracker (Cover priced → Premium paid → Cover secured). Active
  step is Ink-filled, done steps go emerald with a ✓, the connector fills as you advance. It is
  the spine of the checkout — keep it dollars-free, plain-language, and jargon-free (no "hedge").
- **Wallet identity:** the Dynamic widget. Per `PRODUCT.md` principle "crypto is invisible",
  show "your wallet" and a short handle, never a raw address as hero content.

### Signature: the Blink deposit button
The one strongly-branded element in the system — Blink's own black pill ("Deposit stablecoins
/ In a Blink" with USDC/USDT marks). It is intentionally off-system (it's a third-party brand
mark) and that's allowed *here only*. Don't imitate its loud, fully-rounded, dual-coin styling
anywhere else.

## 6. Do's and Don'ts

### Do:
- **Do** make the dollar amount the loudest element in any card — `tabular-nums`, heaviest
  weight, highest contrast.
- **Do** speak plainly: "your wallet", "$5", "if Saudi Arabia wins big". Money, not mechanics.
- **Do** give every interactive control all its states — default, hover, `focus-visible` (3px
  ring), active/press, disabled, loading, error. Don't ship half of them.
- **Do** convey depth with tonal surface steps; reserve borders for input affordances.
- **Do** keep cards at ≤16px radius and ≤1.25rem padding; one decision per screen.
- **Do** provide a `prefers-reduced-motion` alternative (crossfade or instant) for every
  transition, including the press-scale.
- **Do** resolve the single warm accent deliberately (`colorize`) before adding any other color.

### Don't:
- **Don't** show a percentage, a probability, or betting odds to the fan — ever. Spell the
  trigger in plain English.
- **Don't** drift toward the **gambling / sportsbook** look: no neon, no live-odds tickers, no
  parlay-slip hype, no green-on-black "you could win" framing.
- **Don't** drift toward **crypto / web3 degen**: no price charts, no gas/network jargon, no
  truncated wallet address as hero content, no dark-mode-neon.
- **Don't** ship the **generic SaaS dashboard**: no sterile templated cards-everywhere, no
  gray-on-gray, no big-metric hero template, no AI-looking component grids.
- **Don't** read as **heavy insurance / legalese**: no dense forms, fine print, disclaimers as
  decoration, or cold institutional blue.
- **Don't** use a `border-left`/`border-right` > 1px as a colored accent stripe.
- **Don't** use gradient text (`background-clip: text`) — emphasize with weight and size.
- **Don't** pair a 1px border with a wide soft drop shadow on the same card or button (the
  ghost-card tell). Pick one; default to neither.
- **Don't** round cards past 16px or nest a card inside a card.
