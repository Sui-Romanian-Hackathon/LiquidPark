/// Module: parking::escrow
/// Escrow system with slashing & dispute state machine
module blockchain::escrow {
    use sui::object::{Self, UID, ID};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::clock::{Self, Clock};
    use blockchain::market::{Self, ParkingSlot, Reservation, ZoneRegistry};
    use blockchain::reputation::{Self, ReputationRegistry, UserProfile};

    // ============ Error Codes ============
    const ENotDriver: u64 = 0;
    const ENotOwner: u64 = 1;
    const ENotArbiter: u64 = 2;
    const EInvalidState: u64 = 3;
    const EInsufficientPayment: u64 = 4;
    const EInsufficientDeposit: u64 = 5;
    const EInsufficientCollateral: u64 = 6;
    const EDeadlineNotReached: u64 = 7;
    const EDeadlinePassed: u64 = 8;
    const EAlreadyDisputed: u64 = 9;
    const ENotParty: u64 = 10;
    const EInvalidDecision: u64 = 11;

    // ============ Constants ============
    // Escrow states
    const STATE_LOCKED: u8 = 0;
    const STATE_USED: u8 = 1;
    const STATE_SETTLED: u8 = 2;
    const STATE_DISPUTE: u8 = 3;
    const STATE_SLASHED: u8 = 4;

    // Deposit ratios (basis points)
    const DRIVER_DEPOSIT_RATIO: u64 = 1_000; // 10% of payment as deposit
    const OWNER_COLLATERAL_RATIO: u64 = 2_000; // 20% of payment as collateral
    const SLASH_RATIO: u64 = 5_000; // 50% slashed on violation
    const BASIS_POINTS: u64 = 10_000;

    // Time constants
    const DISPUTE_WINDOW_MS: u64 = 86_400_000; // 24 hours after end time
    const SETTLE_GRACE_PERIOD_MS: u64 = 3_600_000; // 1 hour grace period

    // Arbiter decision codes
    const DECISION_FAVOR_DRIVER: u8 = 0;
    const DECISION_FAVOR_OWNER: u8 = 1;
    const DECISION_SPLIT: u8 = 2;

    // ============ Structs ============

    public struct EscrowConfig has key {
        id: UID,
        default_arbiter: address,
        treasury: address,
        protocol_fee_bps: u64,
        protocol_fees: Balance<SUI>,
        admin: address,
    }

    public struct Escrow has key, store {
        id: UID,
        reservation_id: ID,
        driver: address,
        slot_owner: address,
        driver_deposit: Balance<SUI>,
        payment: Balance<SUI>,
        owner_collateral: Balance<SUI>,
        state: u8,
        deadline_epoch: u64,
        dispute_flag: bool,
        arbiter: address,
        weight_driver_rep: u64,
        weight_owner_rep: u64,
        dispute_initiator: u8,
        dispute_reason: u8,
    }

    public struct EscrowReceipt has key, store {
        id: UID,
        escrow_id: ID,
        reservation_id: ID,
        amount_locked: u64,
        deposit_locked: u64,
    }

    // ============ Events ============

    public struct EscrowCreated has copy, drop {
        escrow_id: ID,
        reservation_id: ID,
        driver: address,
        owner: address,
        payment_amount: u64,
        driver_deposit: u64,
        owner_collateral: u64,
        deadline_epoch: u64,
    }

    public struct EscrowStateChanged has copy, drop {
        escrow_id: ID,
        old_state: u8,
        new_state: u8,
    }

    public struct FundsLocked has copy, drop {
        escrow_id: ID,
        total_locked: u64,
    }

    public struct UsageMarked has copy, drop {
        escrow_id: ID,
        marked_by: address,
        timestamp: u64,
    }

    public struct EscrowSettled has copy, drop {
        escrow_id: ID,
        owner_payout: u64,
        driver_refund: u64,
        protocol_fee: u64,
    }

    public struct DisputeOpened has copy, drop {
        escrow_id: ID,
        opened_by: address,
        reason: u8,
        timestamp: u64,
    }

    public struct DisputeResolved has copy, drop {
        escrow_id: ID,
        decision: u8,
        driver_receives: u64,
        owner_receives: u64,
        slashed_amount: u64,
    }

    // ============ Init Function ============

    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let config = EscrowConfig {
            id: object::new(ctx),
            default_arbiter: sender, // Initially admin is arbiter
            treasury: sender,
            protocol_fee_bps: 250, // 2.5% protocol fee
            protocol_fees: balance::zero(),
            admin: sender,
        };
        transfer::share_object(config);
    }

    // ============ Core Escrow Functions ============

    /// Lock funds for a reservation (called by driver)
    /// This function should be called in a PTB along with market::request_reservation
    public fun lock_funds(
        config: &EscrowConfig,
        reservation: &mut Reservation,
        slot: &mut ParkingSlot,
        rep_registry: &ReputationRegistry,
        payment_coin: Coin<SUI>,
        deposit_coin: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): (Escrow, EscrowReceipt) {
        let driver = tx_context::sender(ctx);
        let owner = market::get_slot_owner(slot);
        let price = market::get_reservation_price(reservation);
        
        // Validate payment amount
        let payment_value = coin::value(&payment_coin);
        assert!(payment_value >= price, EInsufficientPayment);

        // Validate driver deposit (10% of payment)
        let required_deposit = (price * DRIVER_DEPOSIT_RATIO) / BASIS_POINTS;
        let deposit_value = coin::value(&deposit_coin);
        assert!(deposit_value >= required_deposit, EInsufficientDeposit);

        // Calculate owner collateral required (20% of payment)
        let required_collateral = (price * OWNER_COLLATERAL_RATIO) / BASIS_POINTS;
        
        // Extract collateral from slot's collateral pool (pre-deposited by owner)
        let owner_collateral_coin = market::extract_collateral_for_escrow(slot, required_collateral, ctx);
        let collateral_value = coin::value(&owner_collateral_coin);

        // Get reputation weights
        let driver_rep = reputation::get_user_score(rep_registry, driver);
        let owner_rep = reputation::get_user_score(rep_registry, owner);

        // Calculate deadline (reservation end + dispute window)
        let (_, end_time) = market::get_reservation_times(reservation);
        let deadline = end_time + DISPUTE_WINDOW_MS;

        let escrow_uid = object::new(ctx);
        let escrow_id = object::uid_to_inner(&escrow_uid);
        let reservation_id = market::get_reservation_id(reservation);

        let escrow = Escrow {
            id: escrow_uid,
            reservation_id,
            driver,
            slot_owner: owner,
            driver_deposit: coin::into_balance(deposit_coin),
            payment: coin::into_balance(payment_coin),
            owner_collateral: coin::into_balance(owner_collateral_coin),
            state: STATE_LOCKED,
            deadline_epoch: deadline,
            dispute_flag: false,
            arbiter: config.default_arbiter,
            weight_driver_rep: driver_rep,
            weight_owner_rep: owner_rep,
            dispute_initiator: 0,
            dispute_reason: 0,
        };

        // Link escrow to reservation
        market::link_escrow(reservation, escrow_id);
        market::activate_reservation(reservation);

        let receipt = EscrowReceipt {
            id: object::new(ctx),
            escrow_id,
            reservation_id,
            amount_locked: payment_value,
            deposit_locked: deposit_value,
        };

        event::emit(EscrowCreated {
            escrow_id,
            reservation_id,
            driver,
            owner,
            payment_amount: payment_value,
            driver_deposit: deposit_value,
            owner_collateral: collateral_value,
            deadline_epoch: deadline,
        });

        event::emit(FundsLocked {
            escrow_id,
            total_locked: payment_value + deposit_value + collateral_value,
        });

        (escrow, receipt)
    }

    /// Entry function to lock funds (for direct calls)
    public entry fun lock_funds_entry(
        config: &EscrowConfig,
        reservation: &mut Reservation,
        slot: &mut ParkingSlot,
        rep_registry: &ReputationRegistry,
        payment_coin: Coin<SUI>,
        deposit_coin: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let (escrow, receipt) = lock_funds(
            config,
            reservation,
            slot,
            rep_registry,
            payment_coin,
            deposit_coin,
            clock,
            ctx
        );
        let driver = tx_context::sender(ctx);
        transfer::share_object(escrow);
        transfer::transfer(receipt, driver);
    }

    /// Mark parking slot as used (driver confirms they parked)
    public entry fun mark_used(
        escrow: &mut Escrow,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == escrow.driver, ENotDriver);
        assert!(escrow.state == STATE_LOCKED, EInvalidState);

        let old_state = escrow.state;
        escrow.state = STATE_USED;

        event::emit(EscrowStateChanged {
            escrow_id: object::uid_to_inner(&escrow.id),
            old_state,
            new_state: STATE_USED,
        });

        event::emit(UsageMarked {
            escrow_id: object::uid_to_inner(&escrow.id),
            marked_by: sender,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    /// Settle the escrow after successful parking (no disputes)
    /// Can be called by either party after deadline or by driver after marking used
    public entry fun settle(
        escrow: &mut Escrow,
        config: &mut EscrowConfig,
        reservation: &mut Reservation,
        slot: &mut ParkingSlot,
        registry: &mut ZoneRegistry,
        driver_profile: &mut UserProfile,
        owner_profile: &mut UserProfile,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(
            sender == escrow.driver || sender == escrow.slot_owner,
            ENotParty
        );
        assert!(
            escrow.state == STATE_USED || escrow.state == STATE_LOCKED,
            EInvalidState
        );
        assert!(!escrow.dispute_flag, EAlreadyDisputed);

        let current_time = clock::timestamp_ms(clock);
        
        // If still LOCKED (not marked used), must wait for deadline
        if (escrow.state == STATE_LOCKED) {
            assert!(current_time >= escrow.deadline_epoch, EDeadlineNotReached);
        };

        let old_state = escrow.state;
        escrow.state = STATE_SETTLED;

        let payment_amount = balance::value(&escrow.payment);
        let protocol_fee = (payment_amount * config.protocol_fee_bps) / BASIS_POINTS;
        let owner_payout = payment_amount - protocol_fee;
        let driver_refund = balance::value(&escrow.driver_deposit);
        let _owner_collateral_amount = balance::value(&escrow.owner_collateral);

        // Transfer protocol fee
        let fee_balance = balance::split(&mut escrow.payment, protocol_fee);
        balance::join(&mut config.protocol_fees, fee_balance);

        // Transfer payment to owner - calculate remaining after fee
        let remaining_payment = balance::value(&escrow.payment);
        let owner_payment = coin::from_balance(
            balance::split(&mut escrow.payment, remaining_payment),
            ctx
        );
        transfer::public_transfer(owner_payment, escrow.slot_owner);

        // Refund driver deposit
        let deposit_amount = balance::value(&escrow.driver_deposit);
        let driver_deposit_refund = coin::from_balance(
            balance::split(&mut escrow.driver_deposit, deposit_amount),
            ctx
        );
        transfer::public_transfer(driver_deposit_refund, escrow.driver);

        // Return owner collateral to slot's collateral pool
        let collateral_amount = balance::value(&escrow.owner_collateral);
        let owner_collateral_coin = coin::from_balance(
            balance::split(&mut escrow.owner_collateral, collateral_amount),
            ctx
        );
        market::return_collateral_to_slot(slot, owner_collateral_coin);

        // Update market state
        market::complete_reservation(reservation, slot, registry);

        // Update reputations (positive outcome) with actual profiles
        reputation::record_successful_parking(driver_profile, owner_profile, owner_payout, clock);

        event::emit(EscrowStateChanged {
            escrow_id: object::uid_to_inner(&escrow.id),
            old_state,
            new_state: STATE_SETTLED,
        });

        event::emit(EscrowSettled {
            escrow_id: object::uid_to_inner(&escrow.id),
            owner_payout,
            driver_refund,
            protocol_fee,
        });
    }

    /// Open a dispute (can be called by driver or owner)
    public entry fun open_dispute(
        escrow: &mut Escrow,
        reservation: &mut Reservation,
        reason: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let is_driver = sender == escrow.driver;
        let is_owner = sender == escrow.slot_owner;
        
        assert!(is_driver || is_owner, ENotParty);
        assert!(
            escrow.state == STATE_LOCKED || escrow.state == STATE_USED,
            EInvalidState
        );
        assert!(!escrow.dispute_flag, EAlreadyDisputed);

        let current_time = clock::timestamp_ms(clock);
        assert!(current_time <= escrow.deadline_epoch, EDeadlinePassed);

        let old_state = escrow.state;
        escrow.state = STATE_DISPUTE;
        escrow.dispute_flag = true;
        escrow.dispute_initiator = if (is_driver) { 1 } else { 2 };
        escrow.dispute_reason = reason;

        // Update reservation state
        market::dispute_reservation(reservation);

        event::emit(EscrowStateChanged {
            escrow_id: object::uid_to_inner(&escrow.id),
            old_state,
            new_state: STATE_DISPUTE,
        });

        event::emit(DisputeOpened {
            escrow_id: object::uid_to_inner(&escrow.id),
            opened_by: sender,
            reason,
            timestamp: current_time,
        });
    }

    /// Arbiter decides the dispute outcome
    /// decision: 0 = favor driver, 1 = favor owner, 2 = split
    public entry fun arbiter_decide(
        escrow: &mut Escrow,
        config: &mut EscrowConfig,
        rep_registry: &mut ReputationRegistry,
        decision: u8,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == escrow.arbiter || sender == config.admin, ENotArbiter);
        assert!(escrow.state == STATE_DISPUTE, EInvalidState);
        assert!(decision <= 2, EInvalidDecision);

        let old_state = escrow.state;
        escrow.state = STATE_SLASHED;

        // Read all values first to avoid borrow conflicts
        let payment_amount = balance::value(&escrow.payment);
        let driver_deposit_amount = balance::value(&escrow.driver_deposit);
        let owner_collateral_amount = balance::value(&escrow.owner_collateral);
        
        let driver_receives: u64;
        let owner_receives: u64;
        let slashed_amount: u64;

        if (decision == DECISION_FAVOR_DRIVER) {
            // Driver wins: full refund + owner's slashed collateral
            let slash = (owner_collateral_amount * SLASH_RATIO) / BASIS_POINTS;
            slashed_amount = slash;
            
            driver_receives = payment_amount + driver_deposit_amount + slash;
            owner_receives = owner_collateral_amount - slash;

            // Update reputations
            reputation::record_dispute_loss(rep_registry, escrow.slot_owner, false);
            reputation::record_dispute_win(rep_registry, escrow.driver, true);

            // Transfer funds to driver: payment + deposit + slashed collateral
            let payment_bal = balance::value(&escrow.payment);
            let driver_payment = balance::split(&mut escrow.payment, payment_bal);
            
            let deposit_bal = balance::value(&escrow.driver_deposit);
            let driver_deposit = balance::split(&mut escrow.driver_deposit, deposit_bal);
            
            let slash_bal = balance::split(&mut escrow.owner_collateral, slash);
            
            // Combine and transfer to driver
            balance::join(&mut escrow.payment, driver_deposit);
            balance::join(&mut escrow.payment, slash_bal);
            balance::join(&mut escrow.payment, driver_payment);
            
            let total_payment = balance::value(&escrow.payment);
            let driver_coin = coin::from_balance(
                balance::split(&mut escrow.payment, total_payment),
                ctx
            );
            transfer::public_transfer(driver_coin, escrow.driver);
            
            // Transfer remaining collateral to owner
            let remaining_collateral = balance::value(&escrow.owner_collateral);
            if (remaining_collateral > 0) {
                let owner_coin = coin::from_balance(
                    balance::split(&mut escrow.owner_collateral, remaining_collateral),
                    ctx
                );
                transfer::public_transfer(owner_coin, escrow.slot_owner);
            };

        } else if (decision == DECISION_FAVOR_OWNER) {
            // Owner wins: payment + driver's slashed deposit
            let slash = (driver_deposit_amount * SLASH_RATIO) / BASIS_POINTS;
            slashed_amount = slash;
            
            let protocol_fee = (payment_amount * config.protocol_fee_bps) / BASIS_POINTS;
            owner_receives = payment_amount - protocol_fee + owner_collateral_amount + slash;
            driver_receives = driver_deposit_amount - slash;

            // Collect protocol fee
            let fee_balance = balance::split(&mut escrow.payment, protocol_fee);
            balance::join(&mut config.protocol_fees, fee_balance);

            // Update reputations
            reputation::record_dispute_loss(rep_registry, escrow.driver, true);
            reputation::record_dispute_win(rep_registry, escrow.slot_owner, false);

            // Transfer to owner: remaining payment + collateral + slashed deposit
            let remaining_payment = balance::value(&escrow.payment);
            let owner_payment = balance::split(&mut escrow.payment, remaining_payment);
            
            let collateral_bal = balance::value(&escrow.owner_collateral);
            let owner_collateral = balance::split(&mut escrow.owner_collateral, collateral_bal);
            
            let slash_from_driver = balance::split(&mut escrow.driver_deposit, slash);
            
            balance::join(&mut escrow.payment, owner_collateral);
            balance::join(&mut escrow.payment, slash_from_driver);
            balance::join(&mut escrow.payment, owner_payment);
            
            let total_owner = balance::value(&escrow.payment);
            let owner_coin = coin::from_balance(
                balance::split(&mut escrow.payment, total_owner),
                ctx
            );
            transfer::public_transfer(owner_coin, escrow.slot_owner);
            
            // Refund remaining deposit to driver
            let remaining_deposit = balance::value(&escrow.driver_deposit);
            if (remaining_deposit > 0) {
                let driver_coin = coin::from_balance(
                    balance::split(&mut escrow.driver_deposit, remaining_deposit),
                    ctx
                );
                transfer::public_transfer(driver_coin, escrow.driver);
            };

        } else {
            // Split decision: both get partial refunds, small slash from both
            let driver_slash = (driver_deposit_amount * SLASH_RATIO / 2) / BASIS_POINTS;
            let owner_slash = (owner_collateral_amount * SLASH_RATIO / 2) / BASIS_POINTS;
            slashed_amount = driver_slash + owner_slash;

            let protocol_fee = (payment_amount * config.protocol_fee_bps) / BASIS_POINTS;
            driver_receives = payment_amount / 2 + driver_deposit_amount - driver_slash;
            owner_receives = payment_amount / 2 - protocol_fee + owner_collateral_amount - owner_slash;

            // Collect protocol fee
            let fee_balance = balance::split(&mut escrow.payment, protocol_fee);
            balance::join(&mut config.protocol_fees, fee_balance);

            // Both get minor reputation hit
            reputation::record_dispute_split(rep_registry, escrow.driver, escrow.slot_owner);

            // Split payment
            let half_payment = payment_amount / 2;
            let driver_half = balance::split(&mut escrow.payment, half_payment);
            
            // Driver gets: half payment + deposit - slash
            let deposit_for_driver = balance::value(&escrow.driver_deposit);
            let driver_deposit = balance::split(&mut escrow.driver_deposit, deposit_for_driver - driver_slash);
            balance::join(&mut escrow.payment, driver_deposit);
            balance::join(&mut escrow.payment, driver_half);
            
            // Transfer combined amount to driver
            let driver_total = balance::value(&escrow.payment);
            // Need to leave some for owner, so recalculate
            let remaining_after_fee = balance::value(&escrow.payment);
            let driver_coin = coin::from_balance(
                balance::split(&mut escrow.payment, driver_total),
                ctx
            );
            transfer::public_transfer(driver_coin, escrow.driver);
            
            // Owner gets: remaining payment + collateral - slash
            let collateral_for_owner = balance::value(&escrow.owner_collateral);
            let owner_collateral = balance::split(&mut escrow.owner_collateral, collateral_for_owner - owner_slash);
            
            // Any remaining payment goes to owner
            let remaining_payment_val = balance::value(&escrow.payment);
            if (remaining_payment_val > 0) {
                let remaining = balance::split(&mut escrow.payment, remaining_payment_val);
                balance::join(&mut escrow.owner_collateral, remaining);
            };
            balance::join(&mut escrow.owner_collateral, owner_collateral);
            
            let owner_total = balance::value(&escrow.owner_collateral);
            if (owner_total > 0) {
                let owner_coin = coin::from_balance(
                    balance::split(&mut escrow.owner_collateral, owner_total),
                    ctx
                );
                transfer::public_transfer(owner_coin, escrow.slot_owner);
            };
        };

        event::emit(EscrowStateChanged {
            escrow_id: object::uid_to_inner(&escrow.id),
            old_state,
            new_state: STATE_SLASHED,
        });

        event::emit(DisputeResolved {
            escrow_id: object::uid_to_inner(&escrow.id),
            decision,
            driver_receives,
            owner_receives,
            slashed_amount,
        });
    }

    // ============ Admin Functions ============

    /// Update arbiter address
    public entry fun update_arbiter(
        config: &mut EscrowConfig,
        new_arbiter: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotArbiter);
        config.default_arbiter = new_arbiter;
    }

    /// Update protocol fee
    public entry fun update_protocol_fee(
        config: &mut EscrowConfig,
        new_fee_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotArbiter);
        assert!(new_fee_bps <= 1000, EInvalidState); // Max 10%
        config.protocol_fee_bps = new_fee_bps;
    }

    /// Withdraw accumulated protocol fees
    public entry fun withdraw_protocol_fees(
        config: &mut EscrowConfig,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotArbiter);
        let amount = balance::value(&config.protocol_fees);
        if (amount > 0) {
            let fees = coin::from_balance(
                balance::split(&mut config.protocol_fees, amount),
                ctx
            );
            transfer::public_transfer(fees, config.treasury);
        };
    }

    // ============ Getter Functions ============

    public fun get_escrow_id(escrow: &Escrow): ID {
        object::uid_to_inner(&escrow.id)
    }

    public fun get_escrow_state(escrow: &Escrow): u8 {
        escrow.state
    }

    public fun get_escrow_driver(escrow: &Escrow): address {
        escrow.driver
    }

    public fun get_escrow_owner(escrow: &Escrow): address {
        escrow.slot_owner
    }

    public fun get_escrow_deadline(escrow: &Escrow): u64 {
        escrow.deadline_epoch
    }

    public fun get_escrow_payment_amount(escrow: &Escrow): u64 {
        balance::value(&escrow.payment)
    }

    public fun is_disputed(escrow: &Escrow): bool {
        escrow.dispute_flag
    }

    public fun get_required_deposit(price: u64): u64 {
        (price * DRIVER_DEPOSIT_RATIO) / BASIS_POINTS
    }

    public fun get_required_collateral(price: u64): u64 {
        (price * OWNER_COLLATERAL_RATIO) / BASIS_POINTS
    }

    // ============ State Constants ============

    public fun state_locked(): u8 { STATE_LOCKED }
    public fun state_used(): u8 { STATE_USED }
    public fun state_settled(): u8 { STATE_SETTLED }
    public fun state_dispute(): u8 { STATE_DISPUTE }
    public fun state_slashed(): u8 { STATE_SLASHED }

    // ============ Test Functions ============

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
