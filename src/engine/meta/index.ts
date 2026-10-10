// Meta engine area: research, three prestige layers, story and KIPP, codex, achievements, quests,
// cosmetics, feature unlock rules and the notification plan.
import type { SystemDef } from "../types";
import { achievementsSystem } from "./achievements";
import { codexSystem } from "./codex";
import { cosmeticsSystem } from "./cosmetics";
import { featuresSystem } from "./features";
import { kippSystem } from "./kipp";
import { prestigeSystem } from "./prestige";
import { questsSystem } from "./quests";
import { researchSystem } from "./research";
import { storySystem } from "./story";

/**
 * Order matters. KIPP and the codex register their api first so everything after can talk and
 * discover; features run before quests so a feature unlocked this second issues its quests in the
 * same second; achievements go last and see the stats the others just wrote.
 */
export const metaSystems: SystemDef[] = [
  kippSystem,
  codexSystem,
  researchSystem,
  prestigeSystem,
  cosmeticsSystem,
  storySystem,
  featuresSystem,
  questsSystem,
  achievementsSystem,
];

export { achievementProgress, checkAchievements, hasAchievement } from "./achievements";
export { CODEX_CATEGORIES, CODEX_NAME_MAX, codexCategory, codexSummary, discover, renameCodex, sanitizeName } from "./codex";
export type { CodexCategory, CodexCategorySummary } from "./codex";
export { buyCosmetic, equipCosmetic, grantCosmetic, ownsCosmetic, syncCosmetics } from "./cosmetics";
export { FEATURE_RULES, checkFeatures, contentGrants } from "./features";
export type { FeatureRule } from "./features";
export { KIPP_RECENT, formatLine, kippLine, say } from "./kipp";
export { NOTIFY_MAX, NOTIFY_MIN_GAP, NOTIFY_MIN_LEAD, cargoFullEta, planNotifications, repairEta } from "./notify";
export type { PlannedNotification } from "./notify";
export {
  baseHull,
  buyUpgrade,
  canReboot,
  canRebuild,
  canWarp,
  grantStamps,
  hasShipyard,
  hullFrameItem,
  hullOpenCells,
  mutatorReward,
  reboot,
  rebuild,
  rebuildBlock,
  rivetsOnRebuild,
  rivetsTotal,
  sparksOnReboot,
  stampsOnWarp,
  upgradeBlock,
  upgradeCost,
  upgradeLevel,
  validMutators,
  warp,
} from "./prestige";
export {
  DAILY_COUNT,
  DAY_MS,
  claimQuest,
  claimWeekly,
  dailyQuests,
  dayIndex,
  msToNextDaily,
  pickDaily,
  pickWeekly,
  questDone,
  questProgress,
  questTarget,
  refreshQuests,
  setWeeklyMutator,
  streakBonus,
  weekIndex,
  weeklyQuest,
} from "./quests";
export type { QuestView } from "./quests";
export { addResearchPoints, buyResearch, canResearch, researchBlock, researchCost, researchLevel } from "./research";
export type { ResearchCost } from "./research";
export {
  BACKLOG_TEMPLATES,
  ENDING_IDS,
  ackBeat,
  addLog,
  backlogTicket,
  canChooseEnding,
  chapterDef,
  chooseEnding,
  currentBeat,
  finalChapter,
  objectives,
  ticketReward,
} from "./story";
export type { BacklogTicket, BeatView, ObjectiveView } from "./story";
