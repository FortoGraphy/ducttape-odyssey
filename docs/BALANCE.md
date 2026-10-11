# Balance changes (sim-qa)

The numbers below were tuned with `npm run sim` (two headless players on the real engine, see
`scripts/sim/`). Where they differ from `docs/GDD.md`, the simulator wins and the GDD still lists the
first draft. Every change is a number in `src/content/economy/`; nothing was renamed.

## Why the first draft could not stay

Played end to end with the GDD numbers, an attentive player unlocked all 13 decks in about 8 minutes,
reached the galactic core in 47 minutes and earned 6 600 stamps on the first warp (the whole stamp
tree). Three causes:

- Deck levels were far too cheap for what they produce (doublings at 10, 25, 50 against a 1.07 cost
  growth), while the unlock costs (60 .. 10 M credits) assumed a much flatter economy than
  `richnessPerDepth 1.32` produces over 40 jumps (x66 000).
- Nothing paced the trip to the core except the jump timers (45 s + 60 s), which research and the
  first engine module halve.
- Active play stacked multiplicatively: hold x4, salvage worth 15-40 s of income every few seconds,
  overdrive almost permanently on. Measured: 8-19x idle instead of 3-5x.

## Decks (`decks.ts`): base cost / cost growth / unlock credits

| Deck | Old | New | Why |
| --- | --- | --- | --- |
| mining | 4 / 1.07 / start | 4 / 1.10 / start | Slower level explosion; first purchase still at 1 s |
| lift | base output 1.2, 6 / 1.075 | base output 3, 5 / 1.095 | Throughput is min(mine, lift). With a lift that costs more and carries less than the laser digs, the ship was always lift-bound and hold-to-mine added x1.0. A roomier, slightly cheaper lift gives holding the laser its value back |
| cargo | 8 / 1.08 | 8 / 1.11 | Keeps pace with mining |
| refinery | 40 / 1.09 / 60 | 150 / 1.11 / 250 | Second deck at 20-60 s (target < 2 min) |
| reactor | 120 / 1.09 / 250 | 500 / 1.11 / 1 200 | About 1 to 1.5 min, when power first runs short |
| bridge | 500 / 1.10 / 900 | 20 k / 1.12 / 50 k | About 2.5 min |
| fabricator | 2 k / 1.10 / 4 k | 250 k / 1.12 / 600 k | About 6 min; first module at 7-11 min |
| workshop | 6 k / 1.10 / 12 k | 1.5 M / 1.12 / 4 M | About 8-10 min |
| hangar | 20 k / 1.12 / 40 k | 4 M / 1.14 / 10 M | About 13-17 min |
| lab | 60 k / 1.10 / 150 k | 12 M / 1.12 / 30 M | About 22 min; research then fills the rest of the run |
| quarters | 250 k / 1.12 / 600 k | 120 M / 1.14 / 300 M | About 40 min, just before chapter 6 hands out crew |
| observatory | 1 M / 1.11 / 2.5 M | 8 B / 1.13 / 20 B | About 65-75 min |
| greenhouse | 4 M / 1.10 / 10 M | 400 B / 1.12 / 1 T | About 100 min |

Unlock order, item requirements, curves and power draw are unchanged.

## Constants (`balance.ts`)

| Key | Old | New | Why |
| --- | --- | --- | --- |
| `jumpChargeSecs` | 45 | 240 | The trip to the core is the pacer of the first run. Charge speed is what the engine module, `nv_charts`, the `st_jump` stamp upgrade, the pilot trait and several cards improve, so the weight sits there: about 4 min per jump at first, about 2 min late in the run. First jump still at about 5 min (target < 45 min); first warp at 2 h 45 m .. 3 h 01 m over 8 seeds (target 2-4 h) |
| `jumpCooldownSecs` | 60 | 120 | Same; the cooldown is the part research `nv_cooldown` and the nav computer shorten |
| `warpStampBase` | 9 | 14.3 | Lifetime credits at the first core are about 1e17, not 1e10: the first warp now pays 30-45 stamps (idle player: about 60) instead of thousands |
| `salvageEvery` | [18, 40] | [25, 50] | Active/idle ratio |
| `salvageIncomeSecs` | [15, 40] | [7, 14] | Active/idle ratio: blobs arrive every few seconds once pulses are used |
| `pulseCooldown` | 20 | 25 | Active/idle ratio |
| `pulseReveal` | [1, 3] | [1, 2] | Active/idle ratio |
| `comboSalvage` | 12 (code default) | 6 | Overdrive was up a third of the time |
| `comboPulse` | 8 (code default) | 4 | Same |
| `comboPurchase` | 2 (code default) | 0.5 | Same; buying x1 quickly filled the bar alone |
| `comboCraft` | 4 (code default) | 0.25 | Same; a repeat job finishing every 3 s gave 80 combo a minute |
| `observatorySalvage` | 0.25 (code default) | 0.1 | The observatory alone tripled the salvage rate by mid-run |
| `startHull` | 100 (new key) | 72 | With a perfect hull nothing could be repaired, so chapter 3's "finish one repair" and the "first mini-game < 10 min" target depended on a random event. The tug now leaves the dock dented: first mini-game at about 1 min |
| `hireCostSecs` | 600 (code default) | 300 | A first hire cost 10 min of income at a station the ship leaves after 4-6 min; the story's crew chapters slipped to the second galaxy |
| `quartersCrewEvery` | 5 | 3 | Quarters level 1-4 gave no bunk beyond the one the tug already has. Now 2 bunks at level 3, 3 at 6, 4 at 9 |

`activeMult` (4), heat (22 / 14), `overdriveMult` (3), `fuelPerJump` (6), `fuelCap` (30),
`richnessPerDepth` (1.32), offline efficiency and cap, event timing and every recipe, research, shop,
module and stamp-upgrade number are unchanged.

## What the simulator measures now (8 seeds, active-bot; idle-bot checks in 2 min every 4 h)

| Target | Wanted | Measured |
| --- | --- | --- |
| first purchase | < 10 s | 1 s |
| first decision point | < 30 s | 4-8 s |
| second deck | < 2 min | 20-60 s |
| first mini-game | < 10 min | about 1 min |
| first event | < 10 min | 4 min |
| first jump / first planet | < 45 min | about 5 min / about 1.5 min |
| first module crafted | < 1 h | 7-11 min |
| first warp, active | 2-4 h | 2 h 45 m .. 3 h 01 m |
| first warp, idle check-ins | about 2 weeks | 7 d 04 h .. 8 d 00 h |
| later warps, 3 x 30 min a day | every 1-3 days | median 2 d |
| active / idle, focused 10 min, first hour | 3-5x | mean 3.1 .. 4.6 |
| 8 h offline return | > 0, < 3x active | 0.02 .. 0.12x active, 0.15 .. 0.9x idle |
| longest gap between purchases, first 2 h | < 10 min | about 1.5 min |

## Known soft spots

- The first jump, planet and module arrive much earlier than their targets require. Chapter 3 opens
  navigation as soon as mining, lift and cargo are level 10 (about one minute); only the chapter
  trigger in `src/content/story` can move that.
- The active/idle ratio depends on where the lift stands against its next doubling: single ten-minute
  samples in the first hour range from 1.9 to 5.1 around the mean. After two hours, with the
  active-play research (`ex_trigger`, `ex_heat`, `ex_overdrive`, `sc_salvage`, `sc_appraisal`) bought,
  it is 5-12x. That is the content's intent for those nodes but it is outside the 3-5x band.
- Stamps grow about x3.5 per warp (33, 87, 320, 944, 3.6 k, 16 k ...). The stamp tree is exhausted after
  about six warps; the rebuild layer needs a shipyard megastructure that neither bot builds, so layer 2
  and 3 pacing is not simulated.
- Research: the whole tree is bought within the first run from about 1 h 30 m on (GDD: in-run, 25 % kept).
