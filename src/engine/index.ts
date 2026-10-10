// Engine entry point. Order matters: core produces, world reacts, meta observes.
import { coreSystems } from "./core";
import { createGame } from "./kernel";
import { metaSystems } from "./meta";
import type { ContentDB, Game, GameState, SystemDef } from "./types";
import { worldSystems } from "./world";

export const SYSTEMS: SystemDef[] = [...coreSystems, ...worldSystems, ...metaSystems];

export function newGame(content: ContentDB, seed: number, wallMs: number): Game {
  return createGame(content, SYSTEMS, undefined, { seed, wallMs });
}

/** Wraps an already migrated and validated state (see core/save.ts). */
export function resumeGame(content: ContentDB, state: GameState): Game {
  return createGame(content, SYSTEMS, state);
}

export * from "./types";
export * as B from "./big";
export { applyOffline, checkCondition, createStepper, runPrestige, step, tick, TICK, SCHEMA_VERSION } from "./kernel";
