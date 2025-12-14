/// Module: parking::market
/// Marketplace with dynamic pricing for parking slots
module blockchain::market {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use std::option::{Self, Option};
    use std::string::{Self, String};

    // ============ Error Codes ============
    const ESlotNotFree: u64 = 0;
    const ENotSlotOwner: u64 = 1;
    const EInvalidDuration: u64 = 2;
    const EInsufficientPayment: u64 = 3;
    const ESlotNotReserved: u64 = 4;
    const ENotReservationDriver: u64 = 5;
    const EReservationNotActive: u64 = 6;
    const EInvalidStatus: u64 = 7;
    const EZoneNotFound: u64 = 8;
    const EInsufficientCollateral: u64 = 9;
    const ESlotHasActiveReservation: u64 = 10;

    // ============ Constants ============
    // Slot status
    const STATUS_FREE: u8 = 0;
    const STATUS_RESERVED: u8 = 1;
    const STATUS_OCCUPIED: u8 = 2;

    // Reservation state
    const RESERVATION_REQUESTED: u8 = 0;
    const RESERVATION_ACTIVE: u8 = 1;
    const RESERVATION_COMPLETED: u8 = 2;
    const RESERVATION_DISPUTED: u8 = 3;
    const RESERVATION_CANCELLED: u8 = 4;

    // Pricing constants (basis points for precision)
    const BASIS_POINTS: u64 = 10_000;
    const MIN_PRICE_MIST: u64 = 1_000_000; // 0.001 SUI minimum
    const MAX_DYNAMIC_COEFF: u64 = 50_000; // 5x max multiplier

    // ============ Structs ============

    /// Global registry for tracking zone demand
    public struct ZoneRegistry has key {
        id: UID,
        /// Maps zone_id -> number of active reservations
        zone_demand: Table<u64, u64>,
        /// Maps zone_id -> total reservations in last period
        zone_history: Table<u64, u64>,
        admin: address,
    }

    /// A parking slot owned by a parking space provider
    public struct ParkingSlot has key, store {
        id: UID,
        owner: address,
        /// Location identifier (hash/ID of zone)
        location_id: u64,
        /// Human-readable location description (slot name)
        location_name: String,
        /// Physical address of the parking slot
        address: String,
        /// GPS coordinates (stored as scaled integers: lat * 1_000_000, lng * 1_000_000)
        latitude: u64,
        longitude: u64,
        base_price_per_hour: u64,
        /// Dynamic coefficient for surge pricing (in basis points, 10000 = 1x)
        dynamic_coeff: u64,
        /// Current status: 0=free, 1=reserved, 2=occupied
        status: u8,
        current_reservation: Option<ID>,
        /// Total revenue earned by this slot
        total_revenue: u64,
        /// Number of completed reservations
        completed_reservations: u64,
        /// Timestamp of slot creation
        created_at: u64,
        /// Collateral pool - owner deposits here to enable reservations
        collateral_pool: Balance<SUI>,
    }

    /// A reservation for a parking slot
    public struct Reservation has key, store {
        id: UID,
        slot_id: ID,
        driver: address,
        slot_owner: address,
        start_time: u64,
        end_time: u64,
        duration_hours: u64,
        /// Price locked at reservation time (in MIST)
        price_locked: u64,
        /// Current state: 0=requested, 1=active, 2=completed, 3=disputed, 4=cancelled
        state: u8,
        escrow_id: Option<ID>,
        zone_id: u64,
    }

    /// Capability for slot owner operations
    public struct SlotOwnerCap has key, store {
        id: UID,
        slot_id: ID,
    }

    // ============ Events ============

    public struct SlotCreated has copy, drop {
        slot_id: ID,
        owner: address,
        location_id: u64,
        base_price_per_hour: u64,
    }

    public struct SlotUpdated has copy, drop {
        slot_id: ID,
        new_base_price: u64,
        new_dynamic_coeff: u64,
    }

    public struct ReservationCreated has copy, drop {
        reservation_id: ID,
        slot_id: ID,
        driver: address,
        owner: address,
        start_time: u64,
        end_time: u64,
        price_locked: u64,
    }

    public struct ReservationStateChanged has copy, drop {
        reservation_id: ID,
        old_state: u8,
        new_state: u8,
    }

    public struct PriceQuoted has copy, drop {
        slot_id: ID,
        duration_hours: u64,
        demand_factor: u64,
        final_price: u64,
    }

    // ============ Init Function ============

    fun init(ctx: &mut TxContext) {
        let registry = ZoneRegistry {
            id: object::new(ctx),
            zone_demand: table::new(ctx),
            zone_history: table::new(ctx),
            admin: tx_context::sender(ctx),
        };
        transfer::share_object(registry);
    }

    // ============ Slot Management Functions ============

    /// Create a new parking slot
    public entry fun create_slot(
        registry: &mut ZoneRegistry,
        location_id: u64,
        location_name: vector<u8>,
        address: vector<u8>,
        latitude: u64,
        longitude: u64,
        base_price_per_hour: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let owner = tx_context::sender(ctx);
        let slot_uid = object::new(ctx);
        let slot_id = object::uid_to_inner(&slot_uid);

        // Initialize zone demand if not exists
        if (!table::contains(&registry.zone_demand, location_id)) {
            table::add(&mut registry.zone_demand, location_id, 0);
            table::add(&mut registry.zone_history, location_id, 0);
        };

        let slot = ParkingSlot {
            id: slot_uid,
            owner,
            location_id,
            location_name: string::utf8(location_name),
            address: string::utf8(address),
            latitude,
            longitude,
            base_price_per_hour,
            dynamic_coeff: BASIS_POINTS, // Start at 1x
            status: STATUS_FREE,
            current_reservation: option::none(),
            total_revenue: 0,
            completed_reservations: 0,
            created_at: clock::timestamp_ms(clock),
            collateral_pool: balance::zero(),
        };

        // Create owner capability
        let owner_cap = SlotOwnerCap {
            id: object::new(ctx),
            slot_id,
        };

        event::emit(SlotCreated {
            slot_id,
            owner,
            location_id,
            base_price_per_hour,
        });

        transfer::share_object(slot);
        transfer::transfer(owner_cap, owner);
    }

    /// Update slot pricing parameters (owner only)
    public entry fun update_slot_pricing(
        slot: &mut ParkingSlot,
        _owner_cap: &SlotOwnerCap,
        new_base_price: u64,
        new_dynamic_coeff: u64,
        ctx: &mut TxContext
    ) {
        assert!(slot.owner == tx_context::sender(ctx), ENotSlotOwner);
        assert!(new_dynamic_coeff <= MAX_DYNAMIC_COEFF, EInvalidStatus);

        slot.base_price_per_hour = new_base_price;
        slot.dynamic_coeff = new_dynamic_coeff;

        event::emit(SlotUpdated {
            slot_id: object::uid_to_inner(&slot.id),
            new_base_price,
            new_dynamic_coeff,
        });
    }

    // ============ Pricing Functions ============

    /// Calculate dynamic price for a slot
    /// price = base_price_per_hour * duration * dynamic_coeff * demand_factor / BASIS_POINTS^2
    public fun quote_price(
        slot: &ParkingSlot,
        registry: &ZoneRegistry,
        duration_hours: u64,
    ): u64 {
        assert!(duration_hours > 0, EInvalidDuration);

        let demand_factor = calculate_demand_factor(registry, slot.location_id);
        
        // Calculate price with proper scaling
        let base_total = slot.base_price_per_hour * duration_hours;
        let with_dynamic = (base_total * slot.dynamic_coeff) / BASIS_POINTS;
        let final_price = (with_dynamic * demand_factor) / BASIS_POINTS;

        // Ensure minimum price
        if (final_price < MIN_PRICE_MIST) {
            MIN_PRICE_MIST
        } else {
            final_price
        }
    }

    /// Calculate demand factor based on zone activity
    /// Returns value in basis points (10000 = 1x, 15000 = 1.5x, etc.)
    public fun calculate_demand_factor(registry: &ZoneRegistry, zone_id: u64): u64 {
        if (!table::contains(&registry.zone_demand, zone_id)) {
            return BASIS_POINTS // Default 1x if zone not tracked
        };

        let active_reservations = *table::borrow(&registry.zone_demand, zone_id);
        
        // Simple demand curve:
        // 0-2 reservations: 1x
        // 3-5 reservations: 1.25x
        // 6-10 reservations: 1.5x
        // 10+ reservations: 2x
        if (active_reservations <= 2) {
            BASIS_POINTS // 1x
        } else if (active_reservations <= 5) {
            12_500 // 1.25x
        } else if (active_reservations <= 10) {
            15_000 // 1.5x
        } else {
            20_000 // 2x
        }
    }

    /// Get a price quote and emit event
    public entry fun get_price_quote(
        slot: &ParkingSlot,
        registry: &ZoneRegistry,
        duration_hours: u64,
    ) {
        let demand_factor = calculate_demand_factor(registry, slot.location_id);
        let final_price = quote_price(slot, registry, duration_hours);

        event::emit(PriceQuoted {
            slot_id: object::uid_to_inner(&slot.id),
            duration_hours,
            demand_factor,
            final_price,
        });
    }

    // ============ Reservation Functions ============

    /// Request a reservation for a parking slot
    /// Returns the reservation object and required payment info
    /// Note: This should be called together with escrow::lock_funds in a PTB
    /// Note: Full availability check should be done in backend before calling this
    /// Backend should query all active reservations for this slot and verify no conflicts
    public fun request_reservation(
        slot: &mut ParkingSlot,
        registry: &mut ZoneRegistry,
        duration_hours: u64,
        start_time: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): Reservation {
        // Note: We allow RESERVED status here because a slot can have multiple reservations
        // at different times. The backend should verify no time conflicts before calling this.
        // The status field in ParkingSlot represents the CURRENT state (right now), not future availability.
        assert!(slot.status == STATUS_FREE || slot.status == STATUS_RESERVED, ESlotNotFree);
        assert!(duration_hours > 0, EInvalidDuration);
        assert!(start_time >= clock::timestamp_ms(clock), EInvalidDuration);

        let driver = tx_context::sender(ctx);
        let price_locked = quote_price(slot, registry, duration_hours);
        let end_time = start_time + (duration_hours * 3_600_000); // Convert hours to ms

        let reservation_uid = object::new(ctx);
        let reservation_id = object::uid_to_inner(&reservation_uid);

        // Note: We don't update slot.status here because status should be calculated dynamically
        // based on active reservations and current timestamp. The backend should handle this.
        // We only set current_reservation if slot is currently free (no active reservation right now)
        let current_time = clock::timestamp_ms(clock);
        if (slot.status == STATUS_FREE) {
            // Check if this reservation starts now or in the future
            if (start_time <= current_time && end_time > current_time) {
                // This reservation is active right now, update status
                slot.status = STATUS_RESERVED;
                slot.current_reservation = option::some(reservation_id);
            } else {
                // Future reservation, don't change current status
                // current_reservation remains none or points to current active reservation
            };
        } else {
            // Slot is already reserved/occupied, but this reservation is for a different time
            // Don't update current_reservation - it should point to the reservation active RIGHT NOW
            // Backend will calculate availability dynamically based on all reservations
        };

        // Update zone demand
        let zone_id = slot.location_id;
        if (table::contains(&registry.zone_demand, zone_id)) {
            let demand = table::borrow_mut(&mut registry.zone_demand, zone_id);
            *demand = *demand + 1;
        };

        let reservation = Reservation {
            id: reservation_uid,
            slot_id: object::uid_to_inner(&slot.id),
            driver,
            slot_owner: slot.owner,
            start_time,
            end_time,
            duration_hours,
            price_locked,
            state: RESERVATION_REQUESTED,
            escrow_id: option::none(),
            zone_id,
        };

        event::emit(ReservationCreated {
            reservation_id,
            slot_id: object::uid_to_inner(&slot.id),
            driver,
            owner: slot.owner,
            start_time,
            end_time,
            price_locked,
        });

        reservation
    }

    /// Entry function for creating reservation (wraps request_reservation)
    public entry fun create_reservation(
        slot: &mut ParkingSlot,
        registry: &mut ZoneRegistry,
        duration_hours: u64,
        start_time: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let reservation = request_reservation(
            slot,
            registry,
            duration_hours,
            start_time,
            clock,
            ctx
        );
        transfer::share_object(reservation);
    }

    /// Link escrow to reservation
    public fun link_escrow(reservation: &mut Reservation, escrow_id: ID) {
        reservation.escrow_id = option::some(escrow_id);
    }

    /// Activate a reservation (called after escrow is locked)
    public fun activate_reservation(reservation: &mut Reservation) {
        assert!(reservation.state == RESERVATION_REQUESTED, EReservationNotActive);
        
        let old_state = reservation.state;
        reservation.state = RESERVATION_ACTIVE;

        event::emit(ReservationStateChanged {
            reservation_id: object::uid_to_inner(&reservation.id),
            old_state,
            new_state: RESERVATION_ACTIVE,
        });
    }

    /// Mark reservation as completed
    public fun complete_reservation(
        reservation: &mut Reservation,
        slot: &mut ParkingSlot,
        registry: &mut ZoneRegistry,
    ) {
        assert!(reservation.state == RESERVATION_ACTIVE, EReservationNotActive);

        let old_state = reservation.state;
        reservation.state = RESERVATION_COMPLETED;

        // Update slot
        slot.status = STATUS_FREE;
        slot.current_reservation = option::none();
        slot.completed_reservations = slot.completed_reservations + 1;
        slot.total_revenue = slot.total_revenue + reservation.price_locked;

        // Update zone demand
        let zone_id = reservation.zone_id;
        if (table::contains(&registry.zone_demand, zone_id)) {
            let demand = table::borrow_mut(&mut registry.zone_demand, zone_id);
            if (*demand > 0) {
                *demand = *demand - 1;
            };
        };

        event::emit(ReservationStateChanged {
            reservation_id: object::uid_to_inner(&reservation.id),
            old_state,
            new_state: RESERVATION_COMPLETED,
        });
    }

    /// Mark reservation as disputed
    public fun dispute_reservation(reservation: &mut Reservation) {
        assert!(
            reservation.state == RESERVATION_ACTIVE || 
            reservation.state == RESERVATION_REQUESTED,
            EReservationNotActive
        );

        let old_state = reservation.state;
        reservation.state = RESERVATION_DISPUTED;

        event::emit(ReservationStateChanged {
            reservation_id: object::uid_to_inner(&reservation.id),
            old_state,
            new_state: RESERVATION_DISPUTED,
        });
    }

    /// Cancel a reservation (only if still in REQUESTED state)
    public fun cancel_reservation(
        reservation: &mut Reservation,
        slot: &mut ParkingSlot,
        registry: &mut ZoneRegistry,
        ctx: &TxContext
    ) {
        assert!(reservation.state == RESERVATION_REQUESTED, EReservationNotActive);
        assert!(reservation.driver == tx_context::sender(ctx), ENotReservationDriver);

        let old_state = reservation.state;
        reservation.state = RESERVATION_CANCELLED;

        // Update slot
        slot.status = STATUS_FREE;
        slot.current_reservation = option::none();

        // Update zone demand
        let zone_id = reservation.zone_id;
        if (table::contains(&registry.zone_demand, zone_id)) {
            let demand = table::borrow_mut(&mut registry.zone_demand, zone_id);
            if (*demand > 0) {
                *demand = *demand - 1;
            };
        };

        event::emit(ReservationStateChanged {
            reservation_id: object::uid_to_inner(&reservation.id),
            old_state,
            new_state: RESERVATION_CANCELLED,
        });
    }

    // ============ Collateral Management ============

    /// Owner deposits collateral into their slot (enables reservations)
    public entry fun deposit_collateral(
        slot: &mut ParkingSlot,
        _owner_cap: &SlotOwnerCap,
        collateral: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        let collateral_balance = coin::into_balance(collateral);
        balance::join(&mut slot.collateral_pool, collateral_balance);
    }

    /// Owner withdraws collateral from their slot (only if no active reservation)
    public entry fun withdraw_collateral(
        slot: &mut ParkingSlot,
        _owner_cap: &SlotOwnerCap,
        amount: u64,
        ctx: &mut TxContext
    ) {
        // Cannot withdraw if slot has active reservation
        assert!(slot.status == STATUS_FREE, ESlotHasActiveReservation);
        assert!(balance::value(&slot.collateral_pool) >= amount, EInsufficientCollateral);
        
        let withdrawn = coin::from_balance(balance::split(&mut slot.collateral_pool, amount), ctx);
        transfer::public_transfer(withdrawn, slot.owner);
    }

    /// Get current collateral balance in slot
    public fun get_slot_collateral_balance(slot: &ParkingSlot): u64 {
        balance::value(&slot.collateral_pool)
    }

    /// Extract collateral from slot for escrow (package-level, called by escrow module)
    public(package) fun extract_collateral_for_escrow(
        slot: &mut ParkingSlot,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<SUI> {
        assert!(balance::value(&slot.collateral_pool) >= amount, EInsufficientCollateral);
        coin::from_balance(balance::split(&mut slot.collateral_pool, amount), ctx)
    }

    /// Return collateral to slot after escrow settles (package-level)
    public(package) fun return_collateral_to_slot(
        slot: &mut ParkingSlot,
        collateral: Coin<SUI>
    ) {
        balance::join(&mut slot.collateral_pool, coin::into_balance(collateral));
    }

    // ============ Getter Functions ============

    public fun get_slot_id(slot: &ParkingSlot): ID {
        object::uid_to_inner(&slot.id)
    }

    public fun get_slot_owner(slot: &ParkingSlot): address {
        slot.owner
    }

    public fun get_slot_status(slot: &ParkingSlot): u8 {
        slot.status
    }

    public fun get_slot_location_id(slot: &ParkingSlot): u64 {
        slot.location_id
    }

    public fun get_slot_base_price(slot: &ParkingSlot): u64 {
        slot.base_price_per_hour
    }

    public fun get_reservation_id(reservation: &Reservation): ID {
        object::uid_to_inner(&reservation.id)
    }

    public fun get_reservation_driver(reservation: &Reservation): address {
        reservation.driver
    }

    public fun get_reservation_owner(reservation: &Reservation): address {
        reservation.slot_owner
    }

    public fun get_reservation_price(reservation: &Reservation): u64 {
        reservation.price_locked
    }

    public fun get_reservation_state(reservation: &Reservation): u8 {
        reservation.state
    }

    public fun get_reservation_slot_id(reservation: &Reservation): ID {
        reservation.slot_id
    }

    public fun get_reservation_times(reservation: &Reservation): (u64, u64) {
        (reservation.start_time, reservation.end_time)
    }

    // ============ Availability Helper Functions ============

    /// Check if two time intervals overlap
    /// Returns true if intervals overlap, false otherwise
    /// Two intervals overlap if: start1 < end2 && start2 < end1
    public fun intervals_overlap(
        start1: u64,
        end1: u64,
        start2: u64,
        end2: u64
    ): bool {
        start1 < end2 && start2 < end1
    }

    /// Check if a reservation conflicts with a time interval
    /// Returns true if reservation overlaps with the given interval
    /// Only checks active reservations (not completed, cancelled, or disputed)
    public fun reservation_conflicts_with_interval(
        reservation: &Reservation,
        requested_start: u64,
        requested_end: u64
    ): bool {
        // Only check active reservations (not completed, cancelled, or disputed)
        if (reservation.state == RESERVATION_COMPLETED || 
            reservation.state == RESERVATION_CANCELLED || 
            reservation.state == RESERVATION_DISPUTED) {
            return false
        };
        
        intervals_overlap(
            reservation.start_time,
            reservation.end_time,
            requested_start,
            requested_end
        )
    }

    /// Check if a reservation is active at a given timestamp
    /// Returns true if reservation is active (REQUESTED or ACTIVE) and overlaps with timestamp
    public fun is_reservation_active_at_time(
        reservation: &Reservation,
        timestamp: u64
    ): bool {
        // Check if reservation is in an active state
        if (reservation.state != RESERVATION_REQUESTED && reservation.state != RESERVATION_ACTIVE) {
            return false
        };
        
        // Check if timestamp is within reservation time window
        timestamp >= reservation.start_time && timestamp < reservation.end_time
    }

    // ============ Status Constants Getters ============

    public fun status_free(): u8 { STATUS_FREE }
    public fun status_reserved(): u8 { STATUS_RESERVED }
    public fun status_occupied(): u8 { STATUS_OCCUPIED }

    public fun reservation_requested(): u8 { RESERVATION_REQUESTED }
    public fun reservation_active(): u8 { RESERVATION_ACTIVE }
    public fun reservation_completed(): u8 { RESERVATION_COMPLETED }
    public fun reservation_disputed(): u8 { RESERVATION_DISPUTED }
    public fun reservation_cancelled(): u8 { RESERVATION_CANCELLED }

    // ============ Test Functions ============

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
