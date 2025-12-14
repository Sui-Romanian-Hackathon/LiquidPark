import type { Request, Response } from "express";
import { QueryService, getQueryService } from "../services/QueryService.js";
import {
  TransactionService,
  getTransactionService,
} from "../services/TransactionService.js";
import type { NetworkType } from "../types.js";

export class ParkingController {
  private queryService: QueryService;
  private txService: TransactionService;

  constructor(network?: NetworkType) {
    this.queryService = getQueryService(network);
    this.txService = getTransactionService(network);
  }

  // ===========================================================================
  // PARKING SLOTS
  // ===========================================================================

  /**
   * GET /api/slots or POST /api/slots/query
   * Query parking slots with optional filters.
   * Supports both query params (GET) and body params (POST).
   */
  getSlots = async (req: Request, res: Response): Promise<void> => {
    try {
      // Support both query params (GET) and body params (POST)
      const params = req.method === "POST" ? req.body : req.query;

      const lat = params.lat ? parseFloat(String(params.lat)) : null;
      const lng = params.lng ? parseFloat(String(params.lng)) : null;
      const radius = params.radius ? parseInt(String(params.radius)) : 5000;
      const availableOnly =
        params.available_only !== false && params.available_only !== "false";
      
      // Optional: check availability for specific time interval
      const requestedStartTime = params.requested_start_time 
        ? parseInt(String(params.requested_start_time)) 
        : undefined;
      const requestedEndTime = params.requested_end_time 
        ? parseInt(String(params.requested_end_time)) 
        : undefined;

      let slots;
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        slots = await this.queryService.querySlotsNearLocation(
          lat,
          lng,
          radius,
          availableOnly,
          requestedStartTime,
          requestedEndTime
        );
      } else if (availableOnly) {
        slots = await this.queryService.queryAvailableSlots(
          requestedStartTime,
          requestedEndTime
        );
      } else {
        slots = await this.queryService.queryAllSlots();
      }

      res.json({
        success: true,
        count: slots.length,
        slots,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  };

  /**
   * GET /api/slots/:id
   * Get a specific parking slot.
   */
  getSlot = async (req: Request, res: Response): Promise<void> => {
    try {
      const slot = await this.queryService.getSlot(req.params.id!);
      if (!slot) {
        res.status(404).json({ success: false, error: "Slot not found" });
        return;
      }
      res.json({ success: true, slot });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * GET /api/slots/by-owner/:address
   * Get all parking slots owned by a specific address.
   */
  getUserSlots = async (req: Request, res: Response): Promise<void> => {
    try {
      const address = req.params.address!;
      const slots = await this.queryService.getUserSlots(address);
      res.json({
        success: true,
        count: slots.length,
        slots,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * GET /api/slots/:id/quote
   * Get price quote for a slot.
   */
  getPriceQuote = async (req: Request, res: Response): Promise<void> => {
    try {
      const durationHours = parseInt(req.query.duration as string) || 1;
      const price = await this.queryService.getPriceQuote(
        req.params.id!,
        durationHours
      );

      if (price === null) {
        res
          .status(400)
          .json({ success: false, error: "Could not calculate price" });
        return;
      }

      const deposit = await this.queryService.getRequiredDeposit(price);
      const collateral = await this.queryService.getRequiredCollateral(price);

      res.json({
        success: true,
        slotId: req.params.id!,
        durationHours,
        price: price.toString(),
        deposit: deposit?.toString() || null,
        collateral: collateral?.toString() || null,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/slots
   * Create a new parking slot.
   */
  createSlot = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        locationId,
        locationName,
        address,
        latitude,
        longitude,
        basePricePerHour,
      } = req.body;

      if (
        !locationId ||
        !locationName ||
        !address ||
        latitude === undefined ||
        longitude === undefined ||
        !basePricePerHour
      ) {
        res
          .status(400)
          .json({ success: false, error: "Missing required fields" });
        return;
      }

      const result = await this.txService.createSlot({
        locationId,
        locationName,
        address,
        latitude,
        longitude,
        basePricePerHour: BigInt(basePricePerHour),
      });

      res.json({
        success: true,
        digest: result.digest,
        slotId: result.slotId,
        ownerCapId: result.ownerCapId,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  // ===========================================================================
  // DRIVER PROFILES
  // ===========================================================================

  /**
   * GET /api/drivers/:id
   * Get a driver profile by ID.
   */
  getDriverProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const profile = await this.queryService.getDriverProfile(req.params.id!);
      if (!profile) {
        res
          .status(404)
          .json({ success: false, error: "Driver profile not found" });
        return;
      }
      res.json({ success: true, profile });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * GET /api/drivers/by-address/:address
   * Get a driver profile by wallet address.
   */
  getDriverProfileByAddress = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const profile = await this.queryService.getDriverProfileByAddress(
        req.params.address!
      );
      if (!profile) {
        res
          .status(404)
          .json({ success: false, error: "Driver profile not found" });
        return;
      }
      res.json({ success: true, profile });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/drivers/register
   * Register as a driver.
   */
  registerDriver = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.txService.registerDriver();
      res.json({
        success: true,
        digest: result.digest,
        driverProfileId: result.driverProfileId,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  // ===========================================================================
  // OWNER PROFILES
  // ===========================================================================

  /**
   * GET /api/owners/:id
   * Get an owner profile by ID.
   */
  getOwnerProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const profile = await this.queryService.getOwnerProfile(req.params.id!);
      if (!profile) {
        res
          .status(404)
          .json({ success: false, error: "Owner profile not found" });
        return;
      }
      res.json({ success: true, profile });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * GET /api/owners/by-address/:address
   * Get an owner profile by wallet address.
   */
  getOwnerProfileByAddress = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const profile = await this.queryService.getOwnerProfileByAddress(
        req.params.address!
      );
      if (!profile) {
        res
          .status(404)
          .json({ success: false, error: "Owner profile not found" });
        return;
      }
      res.json({ success: true, profile });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/owners/register
   * Register as an owner.
   */
  registerOwner = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.txService.registerOwner();
      res.json({
        success: true,
        digest: result.digest,
        ownerProfileId: result.ownerProfileId,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  // ===========================================================================
  // RESERVATIONS
  // ===========================================================================

  /**
   * GET /api/reservations/:id
   * Get a reservation by ID.
   */
  getReservation = async (req: Request, res: Response): Promise<void> => {
    try {
      const reservation = await this.queryService.getReservation(
        req.params.id!
      );
      if (!reservation) {
        res
          .status(404)
          .json({ success: false, error: "Reservation not found" });
        return;
      }
      res.json({ success: true, reservation });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * GET /api/reservations/by-user/:address
   * Get all reservations for a specific user (driver or owner).
   */
  getUserReservations = async (req: Request, res: Response): Promise<void> => {
    try {
      const address = req.params.address!;
      const reservations = await this.queryService.getUserReservations(address);
      res.json({
        success: true,
        count: reservations.length,
        reservations,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/reservations
   * Create a new reservation.
   */
  createReservation = async (req: Request, res: Response): Promise<void> => {
    try {
      const { slotId, durationHours, startTime } = req.body;

      if (!slotId || durationHours === undefined) {
        res
          .status(400)
          .json({ success: false, error: "slotId and durationHours required" });
        return;
      }

      const result = await this.txService.createReservation(
        slotId,
        durationHours,
        startTime ? BigInt(startTime) : undefined
      );

      res.json({
        success: true,
        digest: result.digest,
        reservationId: result.reservationId,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  // ===========================================================================
  // ESCROW
  // ===========================================================================

  /**
   * GET /api/escrows/:id
   * Get an escrow by ID.
   */
  getEscrow = async (req: Request, res: Response): Promise<void> => {
    try {
      const escrow = await this.queryService.getEscrow(req.params.id!);
      if (!escrow) {
        res.status(404).json({ success: false, error: "Escrow not found" });
        return;
      }
      res.json({ success: true, escrow });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/escrows/lock
   * Lock funds in escrow.
   */
  lockFunds = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        reservationId,
        slotId,
        paymentCoinId,
        depositCoinId,
        ownerCollateralCoinId,
      } = req.body;

      if (
        !reservationId ||
        !slotId ||
        !paymentCoinId ||
        !depositCoinId ||
        !ownerCollateralCoinId
      ) {
        res
          .status(400)
          .json({ success: false, error: "Missing required fields" });
        return;
      }

      const result = await this.txService.lockFunds({
        reservationId,
        slotId,
        paymentCoinId,
        depositCoinId,
        ownerCollateralCoinId,
      });

      res.json({
        success: true,
        digest: result.digest,
        escrowId: result.escrowId,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/escrows/:id/mark-used
   * Mark parking as used.
   */
  markUsed = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.txService.markUsed(req.params.id!);
      res.json({ success: true, digest: result.digest });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/escrows/:id/settle
   * Settle the escrow.
   */
  settle = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reservationId, slotId, driverProfileId, ownerProfileId } =
        req.body;

      if (!reservationId || !slotId || !driverProfileId || !ownerProfileId) {
        res
          .status(400)
          .json({ success: false, error: "Missing required fields" });
        return;
      }

      const result = await this.txService.settle({
        escrowId: req.params.id!,
        reservationId,
        slotId,
        driverProfileId,
        ownerProfileId,
      });

      res.json({ success: true, digest: result.digest });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/escrows/:id/dispute
   * Open a dispute.
   */
  openDispute = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reservationId, reason } = req.body;

      if (!reservationId || reason === undefined) {
        res
          .status(400)
          .json({ success: false, error: "reservationId and reason required" });
        return;
      }

      const result = await this.txService.openDispute(
        req.params.id!,
        reservationId,
        reason
      );
      res.json({ success: true, digest: result.digest });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  // ===========================================================================
  // CHECK-IN / CHECK-OUT
  // ===========================================================================

  /**
   * POST /api/reservations/:id/check-in
   * Driver checks in (marks parking as used).
   */
  checkIn = async (req: Request, res: Response): Promise<void> => {
    try {
      const reservationId = req.params.id!;
      
      // Get escrow ID from reservation
      const escrow = await this.queryService.getEscrowByReservationId(reservationId);
      if (!escrow) {
        res.status(404).json({ 
          success: false, 
          error: "Escrow not found for this reservation" 
        });
        return;
      }

      const result = await this.txService.markUsed(escrow.id);
      res.json({ success: true, digest: result.digest });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  /**
   * POST /api/reservations/:id/check-out
   * Driver checks out (settles escrow and completes reservation).
   */
  checkOut = async (req: Request, res: Response): Promise<void> => {
    try {
      const reservationId = req.params.id!;
      
      // Get reservation to get slot ID
      const reservation = await this.queryService.getReservation(reservationId);
      if (!reservation) {
        res.status(404).json({ 
          success: false, 
          error: "Reservation not found" 
        });
        return;
      }

      // Get escrow
      const escrow = await this.queryService.getEscrowByReservationId(reservationId);
      if (!escrow) {
        res.status(404).json({ 
          success: false, 
          error: "Escrow not found for this reservation" 
        });
        return;
      }

      // Get driver and owner profiles
      const driverProfile = await this.queryService.getDriverProfileByAddress(escrow.driver);
      const ownerProfile = await this.queryService.getOwnerProfileByAddress(escrow.owner);

      if (!driverProfile || !ownerProfile) {
        res.status(400).json({ 
          success: false, 
          error: "Driver or owner profile not found. Please register first." 
        });
        return;
      }

      const result = await this.txService.settle({
        escrowId: escrow.id,
        reservationId,
        slotId: reservation.slotId,
        driverProfileId: driverProfile.id,
        ownerProfileId: ownerProfile.id,
      });

      res.json({ success: true, digest: result.digest });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * GET /api/info
   * Get deployment and wallet info.
   */
  getInfo = async (_req: Request, res: Response): Promise<void> => {
    try {
      const deployment = this.queryService.getDeployment();
      res.json({
        success: true,
        network: this.queryService.getNetwork(),
        packageId: deployment.packageId,
        walletAddress: this.txService.getSignerAddress(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  };
}

// Factory function
export function createParkingController(
  network?: NetworkType
): ParkingController {
  return new ParkingController(network);
}
