# Duct Tape Odyssey: Game Design Document

Authoritative design with numbers. Data lives in `src/content/` (typed by `src/engine/types.ts`);
tunable constants live in `content.balance`. When this document and the simulator disagree, the
simulator wins and this document is updated.

## 1. Pitch and pillars

You are the last engineer aboard the salvage tug **S.S. Gaffer**, drifting toward the galactic core.
Mine, craft, patch a hull that is permanently one bolt from falling apart, explore seeded star
systems, answer a repeating signal.

1. **Always something to press.** Three near-term goals are always visible. Every action answers with
   haptic + sound + number pop + LED.
2. **Idle is never worthless, active is never mandatory.** Active play is 3-5x idle in short bursts.
3. **Things break, nothing is lost.** Failure costs time or resources, never permanent progress.
4. **Lonely wonder, dry humor.** KIPP is sarcastic, the universe is quiet and large.
5. **No monetization.** No ads, IAP, energy, fake timers or dark patterns.

## 2. Core loop and economy

### 2.1 Decks (13)

Stack order top to bottom: bridge, observatory, quarters, lab, greenhouse, hangar, workshop, fabricator,
refinery, cargo, lift, reactor, mining.

| Deck | Output (base at L1) | Curve | Meaning |
| --- | --- | --- | --- |
| mining | 1 unit/s | exp | Raw units into the hopper, split by the system's resource mix |
| lift | 1.2 unit/s | exp | Throughput hopper -> cargo. `hauler` drones add +10 % each |
| cargo | 400 units | exp | Hold capacity (mass-weighted) |
| reactor | 30 + 14/level | lin | Power supply |
| refinery | batch 1 | exp | T1 recipes: batch size per cycle; slots = 1 + floor(L/25), max 4 |
| fabricator | batch 1 | exp | T2/T3 recipes (modules always batch 1) |
| workshop | batch 1 | exp | Consumables, T4 megaprojects, repair speed +2 %/level |
| lab | 0.2 RP/s | exp | Research points |
| hangar | drones 1 + floor(L/4) | lin | Drone capacity, assigned to hauler/probe/salvager/fixer |
| quarters | crew 1 + floor(L/5) | lin | Crew capacity, morale regen |
| greenhouse | 0.05 organics/s, coffee | exp | Organics and coffee beans |
| observatory | scan x(1 + soft) | soft | Scan speed, salvage rate, event preview |
| bridge | sell x(1 + 0.02 L) | lin | Sell value, offline efficiency +0.2 %/level (cap +20 %) |

- `levelMult(L)`: exp = `L * 2^(milestones <= L)`, lin = `L`, soft = `1 + log2(1 + L)`.
- Milestones (x2 each): 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, then every 100.
- Level cost: `baseCost * costGrowth^(L-1) * mods.deckCost`. Growth 1.07 (mining), 1.075 (lift),
  1.08 (cargo), 1.09-1.12 (support decks). Buy x1 / x10 / x100 / max (geometric sums in `big.ts`).
- Power: `demand = sum(level * def.power) * mods.powerUse`, `supply = reactorOutput * mods.powerOut +
  module power`. `eff = min(1, supply / demand)` multiplies every producing deck. Failure "blackout"
  scales supply by 0.2.
- A deck is unlocked by credits, sometimes items, sometimes a chapter. Unlock order by cost:
  lift (start) -> cargo (start) -> refinery (60 cr) -> reactor (250) -> bridge (900) -> fabricator (4 k)
  -> workshop (12 k) -> hangar (40 k) -> lab (150 k) -> quarters (600 k) -> observatory (2.5 M) ->
  greenhouse (10 M). Mining, lift and cargo start at level 1.

### 2.2 Flow

```
mining --units/s--> hopper (cap = mine rate * 30 s) --lift units/s--> cargo (cap) --> auto-sell / crafting / contracts
```

- Lift converts hopper units into items by the current system's mix (deterministic shares).
- Each item has a keep reserve `state.keep[item]` = fraction of cargo capacity (default: raw 5 %,
  refined 10 %, components 20 %, modules/megas never sold). Anything above the reserve is sold at once
  by the broker uplink for `value * brokerFee(0.6) * sellValue * creditGain * richness`.
- Cargo full of reserves -> lift stalls -> hopper fills -> mining stalls. KIPP nags, a local
  notification may fire.
- Richness: mining value multiplier `richnessPerDepth(1.32)^depth * system.richness(0.8-1.3)`. Moving
  toward the core is the main in-run progression.

### 2.3 Active play

- **Hold-to-mine**: holding the viewport multiplies mining by `activeMult` (4x). Heat rises
  22 %/s, cools 14 %/s. At 100 % the laser locks for 5 s (overheat).
- **Scanner pulse**: 20 s cooldown, reveals 1-3 salvage blobs at once and advances the current scan.
- **Salvage**: blobs spawn every 18-40 s (max 5 on screen, 45 s lifetime). Tap = 15-40 s of income, or
  items, sometimes a card/blueprint. Salvager drones auto-collect one blob every 30 s each at 50 %.
- **Overdrive**: every collected blob, purchase, craft completion and pulse adds combo. At 100 the
  player can trigger Overdrive: all production x3 for 20 s, wear x2.
- Target: an attentive player earns 3-5x idle.

## 3. Items and crafting

- Tiers: T0 raw (16) -> T1 refined (24) -> T2 components (36) -> T3 modules (8 families x 5 marks = 40,
  plus specials) -> T4 megastructures (10). Plus consumables (12), artifacts (16), specials. Target
  >= 150 items, >= 120 recipes.
- T0: scrap metal, ice, silicates, carbon, hydrogen, conductite, lumite crystals, voidglass, trace
  antimatter, organics, sulfur, ferrite, helium-3, salt brine, xenon traces, strange dust.
- Recipes: 2-5 inputs (T1 may have 1), by-products with a chance (slag, waste heat cells, off-cuts),
  `time` seconds per batch. Value add per tier ~x2.2 so crafting beats selling raw.
- Batch = station output (exp curve) * `craftBatch`; speed = `craftSpeed`. Module recipes are always
  batch 1 and roll a **quality**: Scrappy 15 %, Standard 50 %, Fine 25 %, Superb 8 %, Pristine 2 %,
  shifted by `qualityLuck`. Quality multiplies module stats (0.75 / 1 / 1.25 / 1.6 / 2.1) and divides
  wear (0.8 / 1 / 1.2 / 1.5 / 2).
- Queues per station, parallel slots as above. "Make it again" = job with `left = -1`. Auto-queue
  (research) re-adds listed recipes when inputs exist.
- Blueprints: recipes with `unlock.blueprint` are found in derelicts, expeditions and events; others
  come from research, chapters or deck levels.

## 4. Tech grid, wear, repair

- Grid starts 3x3 with 4 open cells; shop upgrades and hull classes open more (max 6x6).
- Module bonus = `spec.effects * qualityMult * (1 + 0.1 * lvl) * integrityFactor * (1 + 0.15 *
  adjacent same-family)`. Module level costs `value * 40 * 1.6^lvl` credits (endless sink).
- Integrity: 100..0. Above 50 % full effect; 50..20 % scales linearly down to 40 %; below 20 % the
  module is offline. Wear per active hour = `spec.wear (3-7 %) * wearRate * hazardFactor * activity
  / qualityWear`; activity 1 idle, 1.5 holding, 2 overdrive. Offline wear x0.35 and never below 25 %.
- Hull 0..100 (`hullMax` scales effective HP). Events damage it; at 0 a hull breach starts.
- Repair path: (1) manual mini-game: score s restores `40 + 60 s` % and a perfect run adds a 10 min
  +10 % buff; (2) consumables: duct tape +15 % (cap 60 %), spare parts +40 % (cap 90 %), nano-gel
  100 %; (3) repair bots (research): `1.5 %/min * botLevel * repairSpeed` on the priority list;
  (4) autonomous maintenance (late research): KIPP queues jobs and crafts consumables. 4 % of bot
  jobs glitch and wait for a tap (auto-clear after 30 min).
- Any mini-game can be auto-resolved at score 0.5 for bot time or consumables.

## 5. Mini-games (9 x 3 tiers)

weld (trace seam, manage heat), wire (connect pairs), rhythm (16-step pad), valves (balance
pressure), calibrate (rotary resonance; also the gyro for tumbling), tape (swipe wraps over leaks),
defense (tap meteors), dock (thrust and align), hack (sliding/logic). 30-90 s, one thumb, result
score 0..1.

## 6. Galaxy and navigation

- Galaxy g is a lane graph: depth 0..D (D = 40 + 6 g), 3-5 systems per depth, 1-3 links forward.
  Content is a pure function of (seed, g, depth, lane).
- Jump: needs fuel (`fuelPerJump = 6 * fuelUse`, tank 30), hyperdrive charge 45 s, cooldown 60 s.
  Backtracking to visited systems costs half. Out of fuel in a system without the means to make more
  -> `noFuel` failure (solar-sail crawl exit).
- Systems: star type, 3-8 planets, 0-2 belts, hazards, station (every 3-5 depths), anomaly (8 %).
- Planets: biome, atmosphere, hazards, weather, 2-3 resources, optional special resource, fauna/flora.
- Actions: orbital scan (60 s / scanSpeed; adds codex entries), mining probes (probe drones add the
  planet's special resource at 4 % of mining rate each), expeditions (crew away 5-60 min, risk vs
  loot: blueprints, artifacts, logs, cards), outposts (cost components; passive yield for the rest of
  the galaxy run).
- Codex: planets, fauna, flora, systems, artifacts; player can rename; set rewards per 10 entries.

## 7. Events and failure states

- >= 80 events, weighted by conditions, cooldowns, chains. One event every 4-9 minutes of foreground
  play, max 8/hour, never during a mini-game or another event.
- Failure states: tumble, breach, blackout, noFuel, engine, radiation, boarding, anomaly. Each has
  2-4 exits and always the tow: beacon -> ETA `towBase * (1 + depth / 20) * towSpeed`, between 3 min
  and 3 h, paid in credits (up to 10 min of income) or reputation. Breach vents 20 % of cargo.
- Offline can start no failure; a failing ship is parked in safe mode instead.

## 8. Crew, cards, stations

- Crew: seeded portrait + name, 2 traits, level 1-20 (xp from managing). Manager bonus: deck output
  `+50 % + 8 %/level`, scaled by morale (50 % at morale 0, 110 % at 100). Coffee: each crew member
  drinks 1 bean/min; no coffee -> morale -6/h.
- Cards: 3 per deck (39), rarities, duplicates level up; 2 slots per deck.
- Stations: market (seeded prices 0.6-1.6x, changes every game hour), contracts, upgrade shop, repair
  dock, crew for hire. Factions: Lamplighters Guild (traders), Rustborn Collective (scavengers),
  The Quiet Ledger (auditors). Reputation -100..100.

## 9. Progression, prestige, meta

- **Research** (lab, in-run, kept across warps at 25 %): 7 branches, >= 45 nodes.
- **Layer 1, Warp Jump**: available at the core (or with a wormhole gate megastructure). Stamps =
  `floor(10^((log10(lifetime) - 9) * 0.45))`. Resets decks, credits, inventory, modules, location;
  keeps stamps tree, codex, cards (levels), achievements, cosmetics. New mechanic: **mutators**
  (pick 0-2 for the next galaxy: harder but more stamps).
- **Layer 2, Rebuild the Ship**: needs a shipyard megastructure. Rivets from stamps earned. Unlocks
  **hull classes** (grid shape, traits) and **blueprint inheritance**.
- **Layer 3, Reboot the Cosmos**: sparks; **constants** tree changes universal rules (tick of time,
  event density, galaxy depth).
- Achievements >= 100 (stat thresholds), daily quests (3/day, gentle streak with no penalty beyond
  resetting the counter), weekly seeded challenge (ISO week seed, works offline), cosmetics.
- Story: 12 chapters triggered by progression; ending choice; then "The Backlog" (endless).

### Pacing targets (asserted by `npm run sim`)

first purchase < 10 s; first meaningful decision < 30 s; second deck < 2 min; first mini-game and
first event < 10 min; first jump and planet < 45 min; first crafted module < 1 h; first warp 2-4 h;
later warps every 1-3 days of casual play.

## 10. Offline ("Idle Cruise")

- Efficiency 35 % (`offlineBaseEff`), research/bridge raise to 50 %; cap 8 h, research up to 24 h.
- Closed form, piecewise: segments end when cargo fills, a module crosses 50 %/20 %, or the cap is
  reached. Rates are recomputed per segment (at most a few dozen segments).
- 1-3 offline events auto-resolved by policy (cautious/balanced/risky picks choices by `risk`).
- Ship's Log return screen: gathered, worn, events, plus a reason to come back.
- Offline return value stays below ~3x a focused active session of equal credited length.

## 11. Stats (counters in `state.stats`)

`purchases, deckLevels, milestones, creditsLog10 (max), salvage, pulses, overdrives, overheats,
crafts, craftsT1..T4, modulesBuilt, modulesPristine, modulesInstalled, repairsManual, repairsBot,
repairsPerfect, tapeUsed, minigames, minigamesPerfect, minigame_<id>, jumps, depthMax, systemsVisited,
planetsScanned, expeditions, expeditionsLost, outposts, codex, renames, events, eventsGood, eventsBad,
event_<type>, failures, failure_<kind>, tows, crew, cards, contracts, trades, researchLevels, warps,
rebuilds, reboots, logs, chapters, questsDaily, questsWeekly, streakMax, offlineReturns,
offlineLongest, playedHours, kippLines, debugOpened, coffee, blueprints`.

## 12. Tone and text

- KIPP: dry, passive-aggressive about the expired warranty, secretly fond of the engineer.
- Czech text is written natively. Plurals use i18next `_one/_few/_many/_other`.
- No names, terms or assets from other games or hardware brands.
