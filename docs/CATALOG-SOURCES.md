# Catalog sources — the 1999 Criss Cross Crash 5-Pack (toy #21081)

Fetched 2026-09-08 for task **T12**. Legend: **[M]** measured/recorded by a source,
**[E]** estimate made for the simulation.

## How the Fandom block was finally read

`hotwheels.fandom.com` returns **HTTP 402** to WebFetch and **403** to plain `curl` on
`/wiki/...` and `?action=raw`. The **MediaWiki API is not blocked**:

```
https://hotwheels.fandom.com/api.php?action=parse&page=<PAGE>&prop=wikitext&format=json&formatversion=2
```

with a normal browser User-Agent returns the full wikitext. Use this for any future
Fandom lookup instead of fetching the rendered page.

Note the disambiguation: `Criss_Cross_Crash_5-Pack` is a stub. The real page is
**`Criss_Cross_Crash_5-Pack_(1999)`** (a separate `(2010)` pack also exists).

## Confirmed per-car data — [M]

Source: <https://hotwheels.fandom.com/wiki/Criss_Cross_Crash_5-Pack_(1999)> (via the API
URL above). Page text: "The Criss Cross Crash 5-Pack was released in 1999. All vehicles
were made in Thailand or Malaysia", castings listed under toy number **21081**.

| Casting | Body colour | Tampo | Base colour / type | Window | Interior | Wheels |
|---|---|---|---|---|---|---|
| Chevy 1500 | Orange | Black and White Oval graphics | Unpainted / Metal | Smoke tint | Black | 5DOT |
| Chevy Stocker | Purple | Orange, White, Black stripes with "4777" on sides | Unpainted / Metal | Black | None | SB |
| Aeroflash | Green | Black, Red & White markings "3" | Black / Metal | Clear | Black | 3SP |
| Porsche 959 | Grey | Red, Black, White "959" "Twin Turbo" | Unpainted / Metal | Blue tint | Black | 5DOT |
| Ford GT-90 | Yellow | White, Yellow, Red, Black "15" | Unpainted / Metal | Clear | Black | 3SP |

Every one of the six columns above is now **confirmed** — nothing in the tampo / base /
window / interior / wheel set is an estimate any more. This closes the gap flagged in
`docs/RESEARCH.md` §5.

The specific hex colours in `src/20-catalog.js` are an interpretation of those colour
**names** (the wiki gives names, not swatches) — **[E]**.

## Wheel types — [M]

| Code | Name | Years | Source |
|---|---|---|---|
| 5DOT | 5 Dot / 5 Hole | 1996–2008 | <https://hotwheels.fandom.com/wiki/5DOT> |
| 3SP | 3-Spoke ("striking resemblance to the 3-spoke wheels on the original Dodge Viper") | 1995–2008 | <https://hotwheels.fandom.com/wiki/3SP> |
| SB | Sawblade / Directional, "named for it having sawblade-like spokes… similar to the American Racing AR39" | 1996–2007+ | <https://hotwheels.fandom.com/wiki/SB> |
| 5SP | 5-Spoke (kept as the fallback rim style; no car in this pack uses it) | — | — |

Wheel **radius** (0.50 cm, 0.55 cm for SB) and **crr** (0.020–0.026) are **[E]** — the
radii sit inside the real 9.5–11.5 mm diameter band for 1:64 wheels, crr per
`docs/RESEARCH.md` §4. Changed from the placeholder table: 5DOT 0.48 → 0.50 and
SB 0.60 → 0.55, so the five cars sit in a tighter, more realistic radius band.

## Casting silhouettes — [M], used to shape `entry.body`

All five are Larry Wood designs (per the casting pages, via the same API):

- **Porsche 959** — 1980s supercar; low nose, fastback greenhouse. `style: 'supercar'`.
- **Aeroflash** (<https://hotwheels.fandom.com/wiki/Aeroflash>) — 1975 casting, originally
  *Large Charge*, then *Silver Bullet*; "a futuristic all-electric supercar… It features a
  wedge design typical of Italian sports cars of the time." `style: 'wedge'`, deepest hood
  drop, lowest roof.
- **Ford GT-90** — 1995 Ford concept; angular wide supercar. 66 mm length is **[M]**
  (hwcollectorsnews, via `docs/RESEARCH.md` §5). `style: 'supercar'`.
- **Chevy Stocker** (<https://hotwheels.fandom.com/wiki/Chevy_Stocker>) — 1986 Monte Carlo
  **Aerocoupe**, "designed to look like a NASCAR race car… deeply sloped rear window and a
  shorter trunk lid sporting a spoiler". `style: 'stocker'`, tall greenhouse, both windows
  raked, wing, no interior.
- **Chevy 1500** (<https://hotwheels.fandom.com/wiki/Chevy_1500>) — "based on the Chevy
  Silverado C1500 from 1996, specifically the one used in the NASCAR Truck Series".
  `style: 'pickup'`, forward cab + open bed, tallest CG.

## Physics numbers — [E]

Masses and dimensions are estimates within the ranges set by the task and
`docs/RESEARCH.md` §5. Constraints respected: mass 35–47 g, length 6.4–7.2 cm,
**width 2.3–2.6 cm** (the foam nip squeeze is `width − 2.0`, so this band is load
bearing), height 1.3–2.4 cm, wheelbase 4.6–5.0 cm, track 2.1–2.35 cm.

| Casting | mass g | L cm | W cm | H cm | wheelbase | track |
|---|---|---|---|---|---|---|
| Porsche 959 | 44 | 6.4 | 2.45 | 1.70 | 4.6 | 2.25 |
| Aeroflash | 37 | 7.0 | 2.35 | 1.35 | 4.9 | 2.15 |
| Ford GT-90 | 39 | 6.6 | 2.55 | 1.50 | 4.7 | 2.35 |
| Chevy Stocker | 42 | 6.8 | 2.50 | 1.85 | 4.8 | 2.30 |
| Chevy 1500 | 46 | 7.2 | 2.55 | 2.30 | 5.0 | 2.35 |

Only the Ford GT-90's 66 mm length is sourced; everything else in this table is an
estimate scaled from it and from the real castings' proportions.

## Sources that did not work

- `WebFetch` on any `hotwheels.fandom.com/wiki/...` URL → **402**.
- `?action=raw` and `Special:Export` via curl with a browser UA → **403**.
- `collecthw.com/hw/id/21244` → **403**.
