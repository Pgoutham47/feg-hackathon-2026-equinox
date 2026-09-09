# Compliance Note — EU Baseline & Responsible Gambling

**Empire of Gold** — instant-loading casino lobby (prefetch & caching prototype)

| | |
|---|---|
| **Team** | Equinox |
| **Challenge** | 03 — Game Load Time: 6-8 Seconds to Near-Instant |
| **Brand context** | Croatian brand (PSK) |
| **Event** | FEG Innovation Hackathon 2026 |
| **Date** | 9 September 2026 |
| **Prepared against** | FEG Innovation Hackathon 2026 — EU & Croatia Regulatory Compliance Guide (4 September 2026) |

**What it is.** A casino lobby whose service worker warms the shared game bundle
in the background, so a game opens from disk instead of the network. Every game
boots the same certified bundle, which is served byte-identical and never
modified. The prototype has no back end, no payments and no real data.

---

## EU regulatory baseline

### GDPR — Reg. (EU) 2016/679

**How this build addresses it.** No real personal data and no back end. The demo
account — display name, play-money balance, favourites, recently played — is
written only to the player's own browser and is never transmitted. Device signals
used for caching (image tier, audio codec support, Save-Data) are read locally
and never sent.

**Required before production.** DPIA if real profiling is introduced; retention,
breach and player-rights processes once accounts are server-side.

### ePrivacy — Dir. 2002/58/EC, Art. 5(3)

The most relevant instrument here. The product writes to terminal equipment: up
to ~56 MB in Cache Storage plus localStorage. Caching assets to run the lobby the
player opened is technical storage; pre-caching a game not yet requested is an
optimisation, and is treated as needing notice and control rather than assumed
exempt. Save-Data and 2G are honoured absolutely — the prefetch does not run. No
cookies, no trackers, no third-party requests.

**Required before production.** Storage notice and an opt-out for the large
pre-cache; a documented consent assessment for the non-essential phase.

### AMLD / AMLR, KYC — 2015/849 · 2024/1624

Deliberately absent. Sign-in accepts a display name only. "Deposit" increments a
counter — no payment method, no funds, no identity, no verification service.

**Required before production.** Full KYC before play, ongoing monitoring,
source-of-funds and enhanced due diligence.

### eIDAS 2.0 — Reg. 910/2014 · 2024/1183

Not implemented in the prototype.

**Required before production.** Age proof as an attribute claim via the EUDI
Wallet pattern ("over 18") rather than full ID disclosure.

### EU AI Act — Reg. (EU) 2024/1689

No AI or ML in the product. "Recommended for you" is a fixed editorial list, not
a model. The behavioural analysis behind the caching threshold ran offline on the
provided sample dataset and decides only how many bytes to pre-fetch — it never
scores a player and never changes what any player is shown.

**Required before production.** Re-assess if recommendations become model-driven:
transparency, and no exploitation of vulnerabilities.

### Accessibility — EAA 2019/882 · WCAG 2.1 AA

Measured rather than assumed. Every text/background pair in the palette clears AA
at normal size — lowest 5.87:1 against a 4.5:1 requirement. All 15 handlers sit
on native buttons or links, none on a non-interactive element. Icon-only controls
carry aria-labels; toggles expose `aria-pressed` / `aria-expanded`; form fields
have bound labels; dialogs are native `<dialog>`, so focus trapping and Escape
come from the platform. Decorative game art is `alt=""` with the title in
adjacent text.

**Required before production.** Screen-reader pass, visible focus styling, and a
reduced-motion path for the promo rotation and jackpot ticker.

---

## Responsible gambling & player protection

- **No dark patterns.** Nothing auto-continues, nothing manufactures urgency or
  scarcity, no disguised advertising, no interstitial pressure to keep playing.
  Promotional panels are static, clearly labelled as promotions, and identical
  for every visitor.
- **No inducements to vulnerable or self-excluded customers.** Bonus content is
  untargeted because there is no targeting: the build has no segmentation, no
  player profile and no marketing engine.
- **Engagement devices are disclosed.** The rotating promo banner and the
  counting jackpot ticker are presentational and non-personalised here. In
  production both must be suppressed for accounts flagged at-risk or
  self-excluded.
- **18+ is stated but not enforced.** The interface carries an 18+ notice; there
  is no age gate and no register check. This is recorded as a gap, not presented
  as a control.

---

## Croatia (PSK) national layer

The Act on Games of Chance and its Regulation on Measures for Socially
Responsible Organisation of Games of Chance are binding, not soft law: identity
and age verification, and a check against the register of excluded players, are
required before play is allowed. This prototype implements neither. The
production design is a server-side register check on the game route, enforced
before the bundle is served — not a checkbox in the interface. Data protection is
supervised by AZOP under the Croatian GDPR implementation act.

---

## Data used

No real player data, no identity documents, no live production feeds or APIs. The
behavioural analysis that set the caching threshold used the provided sample
event-log dataset with hashed player identifiers, processed locally; none of it
ships in the product and none of it is reproduced in the interface. Game artwork
was supplied by the operator for titles it carries.

See [dependencies.md](./dependencies.md) for the full third-party and data
provenance disclosure.

---

## Known gaps — deliberate, prototype scope

1. No age gate and no self-exclusion register check.
2. No KYC or AML onboarding.
3. Storage notice and opt-out for the large pre-cache not yet presented.
4. No server-side account; nothing persists beyond the player's own browser.

---

## Where these controls live in the code

| Claim | Where |
|---|---|
| Save-Data and 2G suppress the prefetch entirely | [`src/components/prefetch.tsx`](../src/components/prefetch.tsx) |
| Device signals read locally, never transmitted | [`src/lib/tier.ts`](../src/lib/tier.ts), [`src/lib/audio.ts`](../src/lib/audio.ts) |
| Account state confined to the player's own browser | [`src/lib/account.tsx`](../src/lib/account.tsx), [`src/lib/recent.ts`](../src/lib/recent.ts) |
| "Recommended for you" as a fixed editorial list | `DEMO_RECOMMENDED` in [`src/lib/copies.ts`](../src/lib/copies.ts) |
| Native `<dialog>` for focus trapping and Escape | [`src/components/dashboard/sign-in-dialog.tsx`](../src/components/dashboard/sign-in-dialog.tsx) |
| 18+ notice | [`src/components/dashboard/dashboard.tsx`](../src/components/dashboard/dashboard.tsx) |
| Cache Storage bounds and the throughput gates | [`public/sw.js`](../public/sw.js), [`public/catalogue.json`](../public/catalogue.json) |
| No `process.env` secrets anywhere | [`.env.example`](../.env.example) |

---

*Awareness summary for a hackathon prototype. **Not legal advice** — a compliance
and legal review is required before any part of this moves beyond the hackathon.*
