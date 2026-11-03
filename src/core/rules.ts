/**
 * Versioned verification + mission rules. Every threshold is a starting
 * configuration to be calibrated with field logs, not a platform guarantee.
 */
export const RULES = {
  version: '1.0.0',
  windowMs: 20_000,

  // Location filtering
  maxFixAccuracyM: 35,
  jumpSpeedMps: 15,
  /** A single link faster than this is a relocation, never motion. */
  teleportSpeedMps: 45,
  routeCorridorM: 40,
  progressSlackM: 30,
  lateMs: 2_000,

  // Classification
  stationaryDistM: 10,
  stationarySpeedMps: 0.35,
  vehicleFastMps: 7,
  vehicleFastMaxCadence: 1.0,
  vehicleMidMps: 2.8,
  vehicleMidMaxCadence: 0.7,
  vehicleSlowMps: 1.0,
  vehicleSlowMaxCadence: 0.25,
  runMinCadence: 2.5,
  runMinSpeedMps: 2.2,
  walkCadence: [0.8, 2.5] as const,
  walkSpeedMps: [0.35, 2.5] as const,
  walkStrideM: [0.25, 1.4] as const,
  minFixesPerWindow: 2,
  maxGapShareInWindow: 0.5,

  // Vehicle confirmation
  vehicleConsecutiveWindows: 2,
  vehicleCertainMps: 12,
  vehicleCertainMinFixes: 3,

  // Gaps & pause
  gapThresholdMs: 15_000,
  maxGapMs: 5 * 60_000,
  maxPauseMs: 10 * 60_000,
  pauseRelocateM: 50,

  // Reward eligibility
  minWalkShare: 0.7,
  minRouteProgress: 0.9,
  maxUnknownShare: 0.3,
  arrivalFixes: 2,
  arrivalMaxAccuracyM: 25,
  startMaxDistM: 80,
  startMaxAccuracyM: 30,
  waypointRadiusM: 25,

  // Missions
  missionWalkSpeedMps: 1.2,
  encounterMinutes: 2,
  durationTolerance: [0.6, 1.4] as const,
  recentDays: 3,
  maxOptions: 3,
  maxClaimsPerDay: 3,

  // Housekeeping
  clockRollbackToleranceMs: 5 * 60_000,
  rawRetentionDays: 30,
} as const;

export type Rules = typeof RULES;
