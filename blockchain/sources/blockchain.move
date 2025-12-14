/// Module: blockchain
/// Main entry point and facade for the Parking Market Agent
/// This module re-exports and provides convenience functions for interacting with
/// the parking marketplace system.
///
/// Architecture:
/// - market.move: Marketplace with dynamic pricing for parking slots
/// - escrow.move: Escrow system with slashing & dispute state machine  
/// - reputation.move: On-chain reputation for drivers and slot owners
///
/// Programmable Transaction Block (PTB) Workflow:
/// 1. Driver searches for parking (off-chain AI agent)
/// 2. AI constructs PTB with: quote_price -> request_reservation -> lock_funds
/// 3. User signs single transaction
/// 4. After parking: mark_used -> settle (or open_dispute if issues)
module blockchain::parking_agent {
    use sui::clock::Clock;
    use blockchain::market::{Self, ParkingSlot, Reservation, ZoneRegistry};
    use blockchain::escrow::{Self, EscrowConfig, Escrow};
    use blockchain::reputation::UserProfile;

    // ============ Getter Functions for AI Agent ============

    /// Get the estimated total cost for parking
    /// Returns (base_price, final_price_with_demand, required_deposit, required_collateral)
    public fun get_parking_estimate(
        slot: &ParkingSlot,
        registry: &ZoneRegistry,
        duration_hours: u64,
    ): (u64, u64, u64, u64) {
        let base_price = market::get_slot_base_price(slot) * duration_hours;
        let final_price = market::quote_price(slot, registry, duration_hours);
        let required_deposit = escrow::get_required_deposit(final_price);
        let required_collateral = escrow::get_required_collateral(final_price);
        
        (base_price, final_price, required_deposit, required_collateral)
    }

    /// Get slot availability status
    public fun is_slot_available(slot: &ParkingSlot): bool {
        market::get_slot_status(slot) == market::status_free()
    }

    /// Get current demand factor for a zone
    public fun get_zone_demand(registry: &ZoneRegistry, zone_id: u64): u64 {
        market::calculate_demand_factor(registry, zone_id)
    }

    /// Complete the parking session: mark used and settle
    /// Called when driver is done parking and wants to release funds
    public entry fun complete_parking(
        escrow: &mut Escrow,
        escrow_config: &mut EscrowConfig,
        reservation: &mut Reservation,
        slot: &mut ParkingSlot,
        zone_registry: &mut ZoneRegistry,
        driver_profile: &mut UserProfile,
        owner_profile: &mut UserProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Mark as used
        escrow::mark_used(escrow, clock, ctx);
        
        // Settle immediately after marking used
        escrow::settle(
            escrow,
            escrow_config,
            reservation,
            slot,
            zone_registry,
            driver_profile,
            owner_profile,
            clock,
            ctx
        );
    }

    // ============ Constants Accessors ============
    
    /// Status codes for parking slots
    public fun slot_status_free(): u8 { market::status_free() }
    public fun slot_status_reserved(): u8 { market::status_reserved() }
    public fun slot_status_occupied(): u8 { market::status_occupied() }

    /// Reservation states
    public fun reservation_requested(): u8 { market::reservation_requested() }
    public fun reservation_active(): u8 { market::reservation_active() }
    public fun reservation_completed(): u8 { market::reservation_completed() }
    public fun reservation_disputed(): u8 { market::reservation_disputed() }
    public fun reservation_cancelled(): u8 { market::reservation_cancelled() }

    /// Escrow states
    public fun escrow_locked(): u8 { escrow::state_locked() }
    public fun escrow_used(): u8 { escrow::state_used() }
    public fun escrow_settled(): u8 { escrow::state_settled() }
    public fun escrow_dispute(): u8 { escrow::state_dispute() }
    public fun escrow_slashed(): u8 { escrow::state_slashed() }
}
