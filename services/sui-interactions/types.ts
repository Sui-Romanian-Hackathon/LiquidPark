// ============================================================================
// CONSTANTS
// ============================================================================

export const CLOCK_ID = "0x6";

// ============================================================================
// TYPES
// ============================================================================

export type NetworkType = "mainnet" | "testnet" | "devnet";

export interface DeploymentInfo {
  packageId: string;
  reputationRegistryId: string;
  zoneRegistryId: string;
  escrowConfigId: string;
}

// ============================================================================
// REPUTATION TYPES
// ============================================================================

export interface DriverProfile {
  id: string;
  driver: string;
  name?: string; // User display name
  score: number;
  successfulParkings: number;
  disputesFiled: number;
  disputesWon: number;
  disputesLost: number;
  noShows: number;
  lateArrivals: number;
  totalSpent: number;
  lastActivity: number;
  createdAt: number;
  ratingCount: number;
  ratingSum: number;
}

export interface OwnerProfile {
  id: string;
  owner: string;
  name?: string; // User display name
  score: number;
  successfulRentals: number;
  disputesReceived: number;
  disputesWon: number;
  disputesLost: number;
  availabilityViolations: number;
  totalEarned: number;
  lastActivity: number;
  createdAt: number;
  ratingCount: number;
  ratingSum: number;
}

// ============================================================================
// MARKET TYPES
// ============================================================================

export interface ParkingSlot {
  id: string;
  owner: string;
  locationId: number;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  basePricePerHour: number;
  dynamicCoeff: number;
  status: number; // 0=free, 1=reserved, 2=occupied
  currentReservation: string | null;
  totalRevenue: number;
  completedReservations: number;
  createdAt: number;
}

export interface Reservation {
  id: string;
  slotId: string;
  driver: string;
  owner: string;
  startTime: number;
  endTime: number;
  durationHours: number;
  priceLocked: number;
  state: number; // 0=requested, 1=active, 2=completed, 3=disputed, 4=cancelled
  escrowId: string | null;
  zoneId: number;
}

// ============================================================================
// ESCROW TYPES
// ============================================================================

export interface Escrow {
  id: string;
  reservationId: string;
  driver: string;
  owner: string;
  driverDeposit: number;
  payment: number;
  ownerCollateral: number;
  state: number; // 0=locked, 1=used, 2=settled, 3=dispute, 4=slashed
  deadlineEpoch: number;
  disputeFlag: boolean;
  arbiter: string;
  weightDriverRep: number;
  weightOwnerRep: number;
  disputeInitiator: number; // 0=none, 1=driver, 2=owner
  disputeReason: number;
}

// ============================================================================
// CONSTANTS FOR STATUS CODES
// ============================================================================

export const SlotStatus = {
  FREE: 0,
  RESERVED: 1,
  OCCUPIED: 2,
} as const;

export const ReservationState = {
  REQUESTED: 0,
  ACTIVE: 1,
  COMPLETED: 2,
  DISPUTED: 3,
  CANCELLED: 4,
} as const;

export const EscrowState = {
  LOCKED: 0,
  USED: 1,
  SETTLED: 2,
  DISPUTE: 3,
  SLASHED: 4,
} as const;

export const ArbiterDecision = {
  FAVOR_DRIVER: 0,
  FAVOR_OWNER: 1,
  SPLIT: 2,
} as const;
