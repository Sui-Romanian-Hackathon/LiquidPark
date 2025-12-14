/// Module: parking::reputation
/// On-chain reputation system for users (can be both drivers and parking slot owners)
module blockchain::reputation {
    use sui::object::{Self, UID, ID};
    use sui::table::{Self, Table};
    use sui::event;

    // ============ Error Codes ============
    const EProfileNotFound: u64 = 0;
    const ENotAuthorized: u64 = 1;
    const EAlreadyRegistered: u64 = 2;
    const EInvalidScore: u64 = 3;

    // ============ Constants ============
    // Base reputation score (out of 10000 basis points = 100%)
    const BASE_SCORE: u64 = 5_000; // Start at 50%
    const MAX_SCORE: u64 = 10_000; // 100%
    const MIN_SCORE: u64 = 0;
    const BASIS_POINTS: u64 = 10_000;

    // Score adjustments (in basis points)
    const SUCCESSFUL_PARKING_BONUS: u64 = 100; // +1%
    const DISPUTE_WIN_BONUS: u64 = 200; // +2%
    const DISPUTE_LOSS_PENALTY: u64 = 500; // -5%
    const DISPUTE_SPLIT_PENALTY: u64 = 100; // -1%
    const NO_SHOW_PENALTY: u64 = 300; // -3%
    const LATE_PENALTY: u64 = 150; // -1.5%

    // Decay constants
    const DECAY_PERIOD_MS: u64 = 2_592_000_000; // 30 days in ms
    const DECAY_RATE: u64 = 50; // 0.5% decay per period of inactivity

    // ============ Structs ============

    /// Global reputation registry
    public struct ReputationRegistry has key {
        id: UID,
        /// Maps user address -> user profile ID
        user_profiles: Table<address, ID>,
        /// Admin address (for system updates)
        admin: address,
        /// Authorized callers (escrow module)
        authorized_modules: Table<address, bool>,
    }

    /// Unified user reputation profile (can be both driver and owner)
    public struct UserProfile has key, store {
        id: UID,
        /// User address
        user: address,
        /// User display name
        name: vector<u8>,
        /// Current reputation score (0-10000 basis points)
        score: u64,
        
        // Driver statistics
        /// Total successful parkings (as driver)
        successful_parkings: u64,
        /// Total disputes filed (as driver)
        disputes_filed: u64,
        /// Disputes won (as driver)
        disputes_won_as_driver: u64,
        /// Disputes lost (as driver)
        disputes_lost_as_driver: u64,
        /// No-shows (failed to use reserved spot)
        no_shows: u64,
        /// Late arrivals
        late_arrivals: u64,
        /// Total SUI spent on parking
        total_spent: u64,
        
        // Owner statistics
        /// Total successful rentals (as owner)
        successful_rentals: u64,
        /// Total disputes received (as owner)
        disputes_received: u64,
        /// Disputes won (as owner)
        disputes_won_as_owner: u64,
        /// Disputes lost (as owner)
        disputes_lost_as_owner: u64,
        /// Availability violations (marked free but wasn't)
        availability_violations: u64,
        /// Total SUI earned
        total_earned: u64,
        
        // Common fields
        /// Last activity timestamp
        last_activity: u64,
        /// Profile creation timestamp
        created_at: u64,
        /// Number of ratings received
        rating_count: u64,
        /// Cumulative rating sum (for averaging)
        rating_sum: u64,
    }

    /// Badge NFT for reputation milestones
    public struct ReputationBadge has key, store {
        id: UID,
        /// Badge type
        badge_type: u8,
        /// Badge name
        name: vector<u8>,
        /// Description
        description: vector<u8>,
        /// Owner address
        owner: address,
        /// Earned timestamp
        earned_at: u64,
    }

    // Badge types
    const BADGE_NEWCOMER: u8 = 0;
    const BADGE_REGULAR: u8 = 1; // 10+ parkings
    const BADGE_TRUSTED: u8 = 2; // 50+ parkings, 80%+ score
    const BADGE_VIP: u8 = 3; // 100+ parkings, 90%+ score
    const BADGE_DISPUTE_FREE: u8 = 4; // 50+ parkings, 0 disputes lost

    // ============ Events ============

    public struct ProfileCreated has copy, drop {
        profile_id: ID,
        user: address,
        name: vector<u8>,
    }

    public struct ScoreUpdated has copy, drop {
        user: address,
        old_score: u64,
        new_score: u64,
        reason: u8,
    }

    public struct BadgeEarned has copy, drop {
        badge_id: ID,
        user: address,
        badge_type: u8,
    }

    public struct DisputeRecorded has copy, drop {
        user: address,
        as_driver: bool,
        won: bool,
    }

    // Score update reasons
    const REASON_SUCCESSFUL_PARKING: u8 = 0;
    const REASON_DISPUTE_WIN: u8 = 1;
    const REASON_DISPUTE_LOSS: u8 = 2;
    const REASON_DISPUTE_SPLIT: u8 = 3;
    const REASON_NO_SHOW: u8 = 4;
    const REASON_LATE: u8 = 5;
    const REASON_DECAY: u8 = 6;
    const REASON_RATING: u8 = 7;

    // ============ Init Function ============

    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        let registry = ReputationRegistry {
            id: object::new(ctx),
            user_profiles: table::new(ctx),
            admin,
            authorized_modules: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // ============ Profile Management ============

    /// Register a new user with their name
    public entry fun register_user(
        registry: &mut ReputationRegistry,
        name: vector<u8>,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ) {
        let user = tx_context::sender(ctx);
        assert!(!table::contains(&registry.user_profiles, user), EAlreadyRegistered);

        let profile_uid = object::new(ctx);
        let profile_id = object::uid_to_inner(&profile_uid);
        let timestamp = sui::clock::timestamp_ms(clock);

        let profile = UserProfile {
            id: profile_uid,
            user,
            name,
            score: BASE_SCORE,
            // Driver stats
            successful_parkings: 0,
            disputes_filed: 0,
            disputes_won_as_driver: 0,
            disputes_lost_as_driver: 0,
            no_shows: 0,
            late_arrivals: 0,
            total_spent: 0,
            // Owner stats
            successful_rentals: 0,
            disputes_received: 0,
            disputes_won_as_owner: 0,
            disputes_lost_as_owner: 0,
            availability_violations: 0,
            total_earned: 0,
            // Common fields
            last_activity: timestamp,
            created_at: timestamp,
            rating_count: 0,
            rating_sum: 0,
        };

        table::add(&mut registry.user_profiles, user, profile_id);

        event::emit(ProfileCreated {
            profile_id,
            user,
            name,
        });

        transfer::share_object(profile);
    }

    // ============ Score Update Functions (called by escrow module) ============

    /// Record a successful parking (called after escrow settlement)
    /// Updates both driver and owner profiles with success stats
    public(package) fun record_successful_parking(
        driver_profile: &mut UserProfile,
        owner_profile: &mut UserProfile,
        payment_amount: u64,
        clock: &sui::clock::Clock,
    ) {
        let current_time = sui::clock::timestamp_ms(clock);
        
        // Update driver profile
        let old_driver_score = driver_profile.score;
        driver_profile.successful_parkings = driver_profile.successful_parkings + 1;
        driver_profile.total_spent = driver_profile.total_spent + payment_amount;
        driver_profile.last_activity = current_time;
        driver_profile.score = safe_add_score(driver_profile.score, SUCCESSFUL_PARKING_BONUS);

        event::emit(ScoreUpdated {
            user: driver_profile.user,
            old_score: old_driver_score,
            new_score: driver_profile.score,
            reason: REASON_SUCCESSFUL_PARKING,
        });

        // Update owner profile
        let old_owner_score = owner_profile.score;
        owner_profile.successful_rentals = owner_profile.successful_rentals + 1;
        owner_profile.total_earned = owner_profile.total_earned + payment_amount;
        owner_profile.last_activity = current_time;
        owner_profile.score = safe_add_score(owner_profile.score, SUCCESSFUL_PARKING_BONUS);

        event::emit(ScoreUpdated {
            user: owner_profile.user,
            old_score: old_owner_score,
            new_score: owner_profile.score,
            reason: REASON_SUCCESSFUL_PARKING,
        });
    }

    /// Update user profile after successful parking (as driver)
    public entry fun update_driver_success(
        profile: &mut UserProfile,
        amount_spent: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(profile.user == tx_context::sender(ctx), ENotAuthorized);
        
        let old_score = profile.score;
        profile.successful_parkings = profile.successful_parkings + 1;
        profile.total_spent = profile.total_spent + amount_spent;
        profile.last_activity = sui::clock::timestamp_ms(clock);
        
        // Increase score
        profile.score = safe_add_score(profile.score, SUCCESSFUL_PARKING_BONUS);

        event::emit(ScoreUpdated {
            user: profile.user,
            old_score,
            new_score: profile.score,
            reason: REASON_SUCCESSFUL_PARKING,
        });
    }

    /// Update user profile after successful rental (as owner)
    public entry fun update_owner_success(
        profile: &mut UserProfile,
        amount_earned: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ) {
        assert!(profile.user == tx_context::sender(ctx), ENotAuthorized);
        
        let old_score = profile.score;
        profile.successful_rentals = profile.successful_rentals + 1;
        profile.total_earned = profile.total_earned + amount_earned;
        profile.last_activity = sui::clock::timestamp_ms(clock);
        
        // Increase score
        profile.score = safe_add_score(profile.score, SUCCESSFUL_PARKING_BONUS);

        event::emit(ScoreUpdated {
            user: profile.user,
            old_score,
            new_score: profile.score,
            reason: REASON_SUCCESSFUL_PARKING,
        });
    }

    /// Record dispute win
    public fun record_dispute_win(
        _registry: &mut ReputationRegistry,
        user: address,
        as_driver: bool,
    ) {
        event::emit(DisputeRecorded {
            user,
            as_driver,
            won: true,
        });

        event::emit(ScoreUpdated {
            user,
            old_score: 0,
            new_score: 0,
            reason: REASON_DISPUTE_WIN,
        });
    }

    /// Record dispute loss
    public fun record_dispute_loss(
        _registry: &mut ReputationRegistry,
        user: address,
        as_driver: bool,
    ) {
        event::emit(DisputeRecorded {
            user,
            as_driver,
            won: false,
        });

        event::emit(ScoreUpdated {
            user,
            old_score: 0,
            new_score: 0,
            reason: REASON_DISPUTE_LOSS,
        });
    }

    /// Record dispute split (both parties affected)
    public fun record_dispute_split(
        _registry: &mut ReputationRegistry,
        driver: address,
        owner: address,
    ) {
        event::emit(ScoreUpdated {
            user: driver,
            old_score: 0,
            new_score: 0,
            reason: REASON_DISPUTE_SPLIT,
        });

        event::emit(ScoreUpdated {
            user: owner,
            old_score: 0,
            new_score: 0,
            reason: REASON_DISPUTE_SPLIT,
        });
    }

    /// Update user profile after dispute (as driver)
    public entry fun update_driver_dispute(
        profile: &mut UserProfile,
        won: bool,
        clock: &sui::clock::Clock,
    ) {
        let old_score = profile.score;
        profile.last_activity = sui::clock::timestamp_ms(clock);

        if (won) {
            profile.disputes_won_as_driver = profile.disputes_won_as_driver + 1;
            profile.score = safe_add_score(profile.score, DISPUTE_WIN_BONUS);
        } else {
            profile.disputes_lost_as_driver = profile.disputes_lost_as_driver + 1;
            profile.score = safe_sub_score(profile.score, DISPUTE_LOSS_PENALTY);
        };

        event::emit(ScoreUpdated {
            user: profile.user,
            old_score,
            new_score: profile.score,
            reason: if (won) { REASON_DISPUTE_WIN } else { REASON_DISPUTE_LOSS },
        });
    }

    /// Update user profile after dispute (as owner)
    public entry fun update_owner_dispute(
        profile: &mut UserProfile,
        won: bool,
        clock: &sui::clock::Clock,
    ) {
        let old_score = profile.score;
        profile.last_activity = sui::clock::timestamp_ms(clock);
        profile.disputes_received = profile.disputes_received + 1;

        if (won) {
            profile.disputes_won_as_owner = profile.disputes_won_as_owner + 1;
            profile.score = safe_add_score(profile.score, DISPUTE_WIN_BONUS);
        } else {
            profile.disputes_lost_as_owner = profile.disputes_lost_as_owner + 1;
            profile.score = safe_sub_score(profile.score, DISPUTE_LOSS_PENALTY);
        };

        event::emit(ScoreUpdated {
            user: profile.user,
            old_score,
            new_score: profile.score,
            reason: if (won) { REASON_DISPUTE_WIN } else { REASON_DISPUTE_LOSS },
        });
    }

    // ============ Rating Functions ============

    /// Rate a user (can rate both as driver and as owner)
    public entry fun rate_user(
        profile: &mut UserProfile,
        rating: u64, // 1-5 stars, scaled to basis points (2000 = 1 star, 10000 = 5 stars)
        clock: &sui::clock::Clock,
    ) {
        assert!(rating >= 2_000 && rating <= 10_000, EInvalidScore);

        let old_score = profile.score;
        profile.rating_count = profile.rating_count + 1;
        profile.rating_sum = profile.rating_sum + rating;
        profile.last_activity = sui::clock::timestamp_ms(clock);

        // Adjust score towards rating average
        let avg_rating = profile.rating_sum / profile.rating_count;
        if (avg_rating > profile.score) {
            profile.score = safe_add_score(profile.score, (avg_rating - profile.score) / 10);
        } else {
            profile.score = safe_sub_score(profile.score, (profile.score - avg_rating) / 10);
        };

        event::emit(ScoreUpdated {
            user: profile.user,
            old_score,
            new_score: profile.score,
            reason: REASON_RATING,
        });
    }

    // ============ Helper Functions ============

    /// Safely add to score without overflow
    fun safe_add_score(current: u64, bonus: u64): u64 {
        let new_score = current + bonus;
        if (new_score > MAX_SCORE) {
            MAX_SCORE
        } else {
            new_score
        }
    }

    /// Safely subtract from score without underflow
    fun safe_sub_score(current: u64, penalty: u64): u64 {
        if (penalty > current) {
            MIN_SCORE
        } else {
            current - penalty
        }
    }

    // ============ Getter Functions ============

    /// Get user score (returns BASE_SCORE if not registered)
    public fun get_user_score(registry: &ReputationRegistry, user: address): u64 {
        if (table::contains(&registry.user_profiles, user)) {
            BASE_SCORE
        } else {
            BASE_SCORE
        }
    }

    /// Check if user is registered
    public fun is_user_registered(registry: &ReputationRegistry, user: address): bool {
        table::contains(&registry.user_profiles, user)
    }

    /// Get user profile ID
    public fun get_user_profile_id(registry: &ReputationRegistry, user: address): ID {
        *table::borrow(&registry.user_profiles, user)
    }

    /// Get user profile score directly
    public fun get_user_profile_score(profile: &UserProfile): u64 {
        profile.score
    }

    /// Get user name
    public fun get_user_name(profile: &UserProfile): vector<u8> {
        profile.name
    }

    /// Get user stats (driver stats, owner stats)
    public fun get_user_stats(profile: &UserProfile): (u64, u64, u64, u64, u64, u64, u64, u64) {
        (
            profile.successful_parkings,
            profile.disputes_won_as_driver,
            profile.disputes_lost_as_driver,
            profile.total_spent,
            profile.successful_rentals,
            profile.disputes_won_as_owner,
            profile.disputes_lost_as_owner,
            profile.total_earned
        )
    }

    // ============ Badge Functions ============

    /// Mint a reputation badge (called when milestone is reached)
    public entry fun mint_badge(
        profile: &UserProfile,
        badge_type: u8,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ) {
        let user = profile.user;
        
        // Verify eligibility based on badge type
        let eligible = if (badge_type == BADGE_NEWCOMER) {
            profile.successful_parkings >= 1
        } else if (badge_type == BADGE_REGULAR) {
            profile.successful_parkings >= 10
        } else if (badge_type == BADGE_TRUSTED) {
            profile.successful_parkings >= 50 && profile.score >= 8_000
        } else if (badge_type == BADGE_VIP) {
            profile.successful_parkings >= 100 && profile.score >= 9_000
        } else if (badge_type == BADGE_DISPUTE_FREE) {
            profile.successful_parkings >= 50 && profile.disputes_lost_as_driver == 0
        } else {
            false
        };

        assert!(eligible, ENotAuthorized);

        let badge_name = if (badge_type == BADGE_NEWCOMER) {
            b"Newcomer"
        } else if (badge_type == BADGE_REGULAR) {
            b"Regular Parker"
        } else if (badge_type == BADGE_TRUSTED) {
            b"Trusted Driver"
        } else if (badge_type == BADGE_VIP) {
            b"VIP Driver"
        } else {
            b"Dispute-Free Champion"
        };

        let badge_uid = object::new(ctx);
        let badge_id = object::uid_to_inner(&badge_uid);

        let badge = ReputationBadge {
            id: badge_uid,
            badge_type,
            name: badge_name,
            description: b"Parking Market Reputation Badge",
            owner: user,
            earned_at: sui::clock::timestamp_ms(clock),
        };

        event::emit(BadgeEarned {
            badge_id,
            user,
            badge_type,
        });

        transfer::transfer(badge, user);
    }

    // ============ Admin Functions ============

    /// Authorize a module to update reputations
    public entry fun authorize_module(
        registry: &mut ReputationRegistry,
        module_address: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAuthorized);
        if (!table::contains(&registry.authorized_modules, module_address)) {
            table::add(&mut registry.authorized_modules, module_address, true);
        };
    }

    /// Remove module authorization
    public entry fun revoke_module(
        registry: &mut ReputationRegistry,
        module_address: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAuthorized);
        if (table::contains(&registry.authorized_modules, module_address)) {
            table::remove(&mut registry.authorized_modules, module_address);
        };
    }

    // ============ Test Functions ============

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
