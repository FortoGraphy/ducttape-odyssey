# Icon contract

Icons are 16x16 pixel grids authored in code (`scripts/assets/`), exported as 96x96 PNG (x6 nearest)
to `assets/icons/<name>.png`, and listed in the generated `src/ui/icons.generated.ts`:

```ts
export const icons = { ship: require("../../assets/icons/ship.png"), ... } as const;
export type IconName = keyof typeof icons;
```

The UI kit's `Icon` component takes `name: string`, looks it up in `icons` and falls back to the
`missing` icon, so screens can be written before every icon exists. Icons are drawn in a neutral
light tone plus at most two accent colors from the palette, with a transparent background, so they
read on both the light panel and dark wells (the kit may place them on a dark chip).

## Required names

- Tabs: `tab_ship tab_craft tab_grid tab_nav tab_crew tab_meta tab_log tab_settings`
- Decks: `deck_bridge deck_observatory deck_quarters deck_lab deck_greenhouse deck_hangar deck_workshop deck_fabricator deck_refinery deck_cargo deck_lift deck_reactor deck_mining`
- Currencies and meters: `coin rp stamp rivet spark fuel power heat cargo morale hull integrity clock`
- Actions: `buy max lock unlock play pause repair scan jump sell craft queue auto install remove upgrade recycle rename claim hire assign undock dock_station beacon tow export import save bug`
- Arrows and marks: `up down left right plus minus close back check warning info star skull heart question missing`
- Things: `tape wrench bolt gear bot drone crew card flask book trophy quest calendar bell sound music haptic lang battery motion theme`
- World: `planet station anomaly signal belt star_redDwarf star_yellow star_blueGiant star_whiteDwarf star_neutron star_binary star_blackHole star_protostar`
- Hazards: `hz_heat hz_cold hz_radiation hz_toxic hz_debris hz_storm`
- Failures: `fail_tumble fail_breach fail_blackout fail_noFuel fail_engine fail_radiation fail_boarding fail_anomaly`
- Mini-games: `mg_weld mg_wire mg_rhythm mg_valves mg_calibrate mg_tape mg_defense mg_dock mg_hack`
- Module families: `fam_laser fam_engine fam_shield fam_scanner fam_reactor fam_cargo fam_repair fam_life`
- Quality pips: `q0 q1 q2 q3 q4`
- Factions: `fac_lamplighters fac_rustborn fac_ledger`
- Characters: `kipp`
- Event types: `ev_meteor ev_pirates ev_merchant ev_derelict ev_anomaly ev_flare ev_fauna ev_distress ev_fault ev_stowaway ev_kipp ev_contact ev_story`
- Research branches: `br_extraction br_logistics br_fabrication br_maintenance br_navigation br_science br_crew`
- Items: one icon per item, name = item id (`scrap`, `alloy`, `mod_laser_mk1`, ...). Generated from the
  item list (category, tier, family, tags) so that new items get an icon automatically.

Content may use any name above for `icon` fields. Research nodes, prestige upgrades, cards, shop
items and achievements reuse these names (no dedicated art per node).
