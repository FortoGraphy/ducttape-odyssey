// Integration smoke: full system list + real content, every preset, ticks, offline, save round trip.
import { content } from "@/content";
import { newGame, resumeGame } from "@/engine";
import * as B from "@/engine/big";
import { deserialize, formatBig, nearGoals, serialize } from "@/engine/core";
import { applyOffline, tick } from "@/engine/kernel";
import { applyPreset, PRESETS } from "@/store/presets";

function findBad(v: unknown, path: string, out: string[]): void {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) out.push(path);
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) findBad((v as Record<string, unknown>)[k], `${path}.${k}`, out);
  }
}

let failed = false;
for (const preset of PRESETS) {
  const g = newGame(content, 4242, 1_700_000_000_000);
  applyPreset(g, preset);
  const t0 = Date.now();
  for (let i = 0; i < 6000; i++) tick(g);
  const ms = Date.now() - t0;
  const report = applyOffline(g, 6 * 3600);
  const text = serialize(g.state);
  const back = deserialize(text);
  const g2 = back.ok && back.state ? resumeGame(content, back.state) : null;
  if (g2) for (let i = 0; i < 100; i++) tick(g2);
  const bad: string[] = [];
  findBad(g.state, "state", bad);
  const sys = g.api.currentSystem();
  console.log(
    `${preset.padEnd(8)} 6000 ticks ${String(ms).padStart(4)} ms | credits ${formatBig(g.state.credits).padStart(9)} income ${formatBig(g.rates.income)}/s mine ${formatBig(g.rates.mine)}/s` +
      ` | power ${g.rates.power.eff.toFixed(2)} | sys ${sys.name} (${sys.planets.length} planets) | offline +${formatBig(report.credits)} (${report.events.length} ev)` +
      ` | save ${(text.length / 1024).toFixed(1)} kB ${g2 ? "ok" : "FAIL"} | goals ${nearGoals(g).length} | ch ${g.state.story.chapter} | bad ${bad.length}`,
  );
  if (bad.length || !g2 || !B.gt(g.state.credits, B.ZERO)) {
    failed = true;
    if (bad.length) console.log("  non-finite:", bad.slice(0, 8).join(", "));
  }
}
if (failed) process.exit(1);
console.log("smoke OK");
