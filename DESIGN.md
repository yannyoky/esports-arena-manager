# Design

World: **the finals stage**. The game looks like a LAN-finals arena seen from the crowd: a dark venue, warm amber stage light from above, dot-matrix LED panels, and the two sides lit in blue and red.

## Tokens (src/style.css `:root`)
- Venue `#15121b`, panels `#1f1a27` / `#2a2333`, line `#3a3046`
- LED text `#f6efe2`, muted `#b4a9bd`
- Stage light (primary action) `#ffb547` on ink `#1d1306`
- Sides: blue `#3d8bff`, red `#ff4d5e` (match and draft use side colours, not team colours)
- Type: display **Russo One**, body **Golos Text** (both self-hosted via @fontsource, so the APK works offline)
- Motion: ease-out `cubic-bezier(.2,.8,.2,1)`, UI transitions under 300 ms, press scales to .97; `prefers-reduced-motion` keeps fades only

## Components
- `.marquee`: the LED stage panel (dot grid + amber light) for the screen's main moment
- `.cta`: amber stage-light button; `.chip`: role filters and tags
- Portraits: heroes are drawn on canvas by `src/models.ts` and cached as images
- Icons: `src/icons.ts`, one 2px stroke set; team crests are generated shields

## Match
Map pre-rendered once per screen size (`src/render.ts`); per frame only heroes, effects, torches and water glints. 30 fps cap, paused when hidden.
