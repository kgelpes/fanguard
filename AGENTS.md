# AGENTS

## Design Context

Before designing or editing any UI, read **`PRODUCT.md`** (strategy) and **`DESIGN.md`**
(visual system) at the repo root. They are the source of truth for how FanGuard should look
and feel.

- **Register:** product (design serves the task — checkout flow, embedded wallet, forms).
- **Personality:** warm · human · fan-energy. Talk to the fan in the stands, not a
  policyholder or a bettor.
- **North Star:** *"The Calm Receipt"* — money made obvious; quiet, trustworthy, nothing to
  decode. Restraint is the point.
- **Hard lines:** dollars only, never percentages or odds; crypto stays invisible ("your
  wallet" and "$", never raw addresses); one decision per screen.
- **Not:** a sportsbook, crypto/web3 degen, a sterile SaaS dashboard, or cold insurance
  legalese.
- **Known debt:** the palette is currently all-neutral grayscale — a single warm accent and
  tonal surface layering are the committed next steps (see DESIGN.md's Color Debt + No-Border
  rules).

Tooling: this repo uses the **impeccable** design skill. `.impeccable/design.json` is the
machine-readable sidecar for DESIGN.md; `.impeccable/live/config.json` configures live mode.
