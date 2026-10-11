// Tunable constants (docs/GDD.md). The first block fills every named key of the Balance
// interface; the second block adds the GDD numbers that have no named key yet, so the engine areas
// never hard-code them. When the simulator disagrees with a value here, change it here.
import type { Balance } from "@/engine/types";

export const balance: Balance = {
  // ----- named keys of the Balance interface -----
  startCredits: 10,
  milestones: [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
  brokerFee: 0.6,
  hopperSeconds: 30,
  richnessPerDepth: 1.32,
  galaxyDepth: 40,
  galaxyDepthGrowth: 6,
  qualityMult: [0.75, 1, 1.25, 1.6, 2.1],
  qualityWear: [0.8, 1, 1.2, 1.5, 2],
  adjacencyBonus: 0.15,
  degradeAt: 50,
  offlineAt: 20,
  offlineBaseEff: 0.35,
  offlineBaseCap: 8 * 3600,
  offlineWearFactor: 0.35,
  offlineIntegrityFloor: 25,
  activeMult: 4,
  heatPerSec: 22,
  coolPerSec: 14,
  overheatLock: 5,
  overdriveMult: 3,
  overdriveSecs: 20,
  salvageEvery: [25, 50],
  salvageMax: 5,
  eventEvery: [240, 540],
  eventMaxPerHour: 8,
  fuelPerJump: 6,
  fuelCap: 30,
  jumpChargeSecs: 240,
  jumpCooldownSecs: 120,
  warpStampBase: 14.3,
  warpStampExp: 0.45,
  moduleUpgradeGrowth: 1.6,

  // ----- economy and decks (GDD 2) -----
  reactorBasePower: 30, // supply before any reactor level; the deck adds base * level
  refinerySlotEvery: 25,
  craftSlotsMax: 4,
  workshopRepairPerLevel: 0.02,
  hangarDronesEvery: 4,
  quartersCrewEvery: 3,
  haulerLiftBonus: 0.1,
  bridgeSellPerLevel: 0.02,
  bridgeOfflinePerLevel: 0.002,
  bridgeOfflineCap: 0.2,
  greenhouseCoffeeShare: 0.5, // share of greenhouse output delivered as coffee beans
  keepRaw: 0.05,
  keepRefined: 0.1,
  keepComponent: 0.2,
  richnessRange: [0.8, 1.3],
  blackoutSupply: 0.2,
  observatorySalvage: 0.1, // salvage rate added per unit of observatory output

  // ----- active play (GDD 2.3) -----
  pulseCooldown: 25,
  pulseReveal: [1, 2],
  salvageTtl: 45,
  salvageIncomeSecs: [7, 14],
  droneSalvageEvery: 30,
  droneSalvageEff: 0.5,
  comboMax: 100,
  comboSalvage: 6,
  comboPulse: 4,
  comboPurchase: 0.5,
  comboCraft: 0.25,
  overdriveWear: 2,

  // ----- modules, wear, repair (GDD 3-4) -----
  qualityChance: [0.15, 0.5, 0.25, 0.08, 0.02],
  moduleUpgradeBase: 40, // level cost = value * base * growth^lvl
  moduleLevelBonus: 0.1,
  degradedFloor: 0.4, // output factor at `offlineAt` integrity
  wearActivity: [1, 1.5, 2], // idle, holding, overdrive
  gridStartOpen: 4,
  repairMinigameBase: 40,
  repairMinigameScore: 60,
  perfectBuff: 0.1,
  perfectBuffSecs: 600,
  autoResolveScore: 0.5,
  botRepairPerMin: 1.5,
  botGlitchChance: 0.04,
  botGlitchSecs: 1800,
  fuelTankPerLevel: 10, // shop upgrade `fuel_tank`
  startHull: 72, // hull of a brand-new game: something to weld in the first minutes

  // ----- navigation and world (GDD 6-7) -----
  backtrackFuelFactor: 0.5,
  scanSecs: 60,
  probeYield: 0.04,
  expeditionSecs: [300, 3600],
  anomalyChance: 0.08,
  stationEvery: [3, 5],
  towMinSecs: 180,
  towMaxSecs: 10800,
  towDepthDivisor: 20,
  towCostSecs: 600,
  breachCargoLoss: 0.2,
  marketPrice: [0.6, 1.6],
  marketRefreshSecs: 3600,

  // ----- crew (GDD 8) -----
  managerBase: 0.5,
  managerPerLevel: 0.08,
  managerMoraleFactor: [0.5, 1.1], // at morale 0 and 100
  crewMaxLevel: 20,
  coffeePerCrewMin: 1,
  moraleNoCoffeePerHour: -6,
  cardSlots: 2,
  hireCostSecs: 300, // seconds of income for the first hire; each crew member aboard adds half of it

  // ----- meta (GDD 9-10) -----
  researchKeep: 0.25,
  mutatorSlots: 2,
  offlineCapMax: 24 * 3600,
  offlineEventCount: [1, 3],
  questsPerDay: 3,
};
