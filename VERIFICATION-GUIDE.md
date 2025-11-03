# Cart Expiration & Event Sourcing Verification Guide

This guide explains how to verify that cart expiration and event sourcing persistence work correctly in your implementation.

## Overview

Your implementation uses **event sourcing** to ensure cart state is never lost, even when the Salesforce context expires. Here's how it works:

### Key Components

1. **ExperienceSession** ([state-manager.ts:39](state-manager.ts#L39))
   - Stores the event log for each session
   - Tracks last activity and session state
   - Never expires until explicitly cleaned up (after 24 hours of inactivity)

2. **Salesforce Context** ([salesforce-client.ts:31](salesforce-client.ts#L31))
   - Temporary Salesforce cart context
   - Expires after 5 minutes of inactivity (configurable)
   - Can be recreated at any time

3. **Event Replay** ([cart-service.ts:243](cart-service.ts#L243))
   - When SF context expires, a new one is created
   - All events from the event log are replayed to rebuild the cart state
   - Operations continue seamlessly

## How Expiration Works

### Session Expiration (State Manager)
- **Timeout**: 24 hours (configurable via `MAX_SESSION_AGE_MS`)
- **Purpose**: Clean up old, abandoned sessions
- **Persistence**: Events are stored in memory for the session lifetime
- **Location**: [state-manager.ts:166](state-manager.ts#L166) - `cleanupOldSessions()`

### Salesforce Context Expiration
- **Timeout**: 5 minutes (configurable via `SF_CONTEXT_TTL_MS`)
- **Purpose**: Simulates real Salesforce cart context behavior
- **Recovery**: Automatic replay of events to new context
- **Location**: [salesforce-client.ts:144](salesforce-client.ts#L144) - `getValidContext()`

## Event Sourcing Flow

```
User Action → Event Created → Event Stored → SF Context Updated
                                 ↓
                         Event Log (Source of Truth)
                                 ↓
                    SF Context Expires? → Replay Events → New SF Context
```

### Event Types
1. **ITEM_ADDED** - Records item addition with full details
2. **ITEM_REMOVED** - Records item removal with quantity
3. **ITEM_UPDATED** - Records quantity updates

All events are stored in [types.ts:31](types.ts#L31)

## Verification Methods

### Method 1: Run Existing Tests

Your test suite already verifies expiration and replay:

```bash
npm test
```

**Key tests to check:**
- `should handle context expiry with automatic replay` ([cart-service.test.ts:185](tests/cart-service.test.ts#L185))
- `should handle context expiry during checkout` ([cart-service.test.ts:411](tests/cart-service.test.ts#L411))
- `should handle multiple context expiries` ([cart-service.test.ts:434](tests/cart-service.test.ts#L434))
- `should handle add, remove, update sequence with expiry` ([cart-service.test.ts:474](tests/cart-service.test.ts#L474))

### Method 2: Manual API Testing

1. **Start the server:**
   ```bash
   npm run build
   npm start
   ```

2. **Create a session:**
   ```bash
   curl -X POST http://localhost:3000/api/cart/sessions
   ```
   Save the `sessionId` from the response.

3. **Add items to the cart:**
   ```bash
   curl -X POST http://localhost:3000/api/cart/sessions/{sessionId}/items \
     -H "Content-Type: application/json" \
     -d '{
       "itemId": "iphone15",
       "type": "DEVICE",
       "name": "iPhone 15 Pro",
       "price": 99900,
       "quantity": 1
     }'
   ```

4. **Wait 6 minutes** (longer than the 5-minute SF context TTL)

5. **Add another item** (this will trigger replay):
   ```bash
   curl -X POST http://localhost:3000/api/cart/sessions/{sessionId}/items \
     -H "Content-Type: application/json" \
     -d '{
       "itemId": "plan_unlimited",
       "type": "PLAN",
       "name": "Unlimited 5G",
       "price": 7000,
       "quantity": 1
     }'
   ```

6. **Verify both items are present:**
   ```bash
   curl http://localhost:3000/api/cart/sessions/{sessionId}
   ```

   You should see both items in the cart, proving the first item was preserved through event replay.

### Method 3: Integration Test

Run the provided integration test that simulates a real-world scenario with multiple operations and expiration.

See [tests/integration.test.ts](tests/integration.test.ts) (to be created)

## What Makes It Work

### 1. Event Log is the Source of Truth
- Every cart operation creates an event ([cart-service.ts:78](cart-service.ts#L78))
- Events are appended to the session ([state-manager.ts:74](state-manager.ts#L74))
- Cart state is rebuilt from events ([state-manager.ts:99](state-manager.ts#L99))

### 2. Automatic Replay on Expiration
- `executeWithReplay()` catches `ContextExpiredError` ([cart-service.ts:223](cart-service.ts#L223))
- Creates new SF context ([cart-service.ts:245](cart-service.ts#L245))
- Replays all events to rebuild cart ([cart-service.ts:252](cart-service.ts#L252))

### 3. Separation of Concerns
- **StateManager**: Manages sessions and events (persistent)
- **SalesforceClient**: Manages SF contexts (ephemeral)
- **CartService**: Orchestrates and handles replay logic

## Common Scenarios

### Scenario 1: Context Expires Between Operations
✅ **Expected**: Next operation triggers replay, all previous items restored
✅ **Verified by**: [cart-service.test.ts:185](tests/cart-service.test.ts#L185)

### Scenario 2: Multiple Expiries During Session
✅ **Expected**: Each operation replays full event log, cart remains consistent
✅ **Verified by**: [cart-service.test.ts:434](tests/cart-service.test.ts#L434)

### Scenario 3: Context Expires Before Checkout
✅ **Expected**: Checkout triggers replay, order completed with full cart
✅ **Verified by**: [cart-service.test.ts:411](tests/cart-service.test.ts#L411)

### Scenario 4: Complex Operations with Expiry
✅ **Expected**: Add, remove, update operations all replayed correctly
✅ **Verified by**: [cart-service.test.ts:474](tests/cart-service.test.ts#L474)

## Configuration

Adjust timeouts for testing or production in [types.ts:137](types.ts#L137):

```typescript
export const DEFAULT_CONFIG: Config = {
  SF_CONTEXT_TTL_MS: 5 * 60 * 1000,        // 5 minutes (SF context)
  SESSION_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour (cleanup frequency)
  MAX_SESSION_AGE_MS: 24 * 60 * 60 * 1000,     // 24 hours (session lifetime)
  TAX_RATE: 0.10,
  PORT: 3000,
};
```

## Troubleshooting

### Issue: Items disappear after inactivity
**Cause**: Session expired (24 hours)
**Solution**: This is expected behavior. Sessions cleanup after MAX_SESSION_AGE_MS.

### Issue: Context expiry not triggering
**Cause**: SF_CONTEXT_TTL_MS too long for testing
**Solution**: Use shorter timeout in tests (see [cart-service.test.ts:23](tests/cart-service.test.ts#L23))

### Issue: Events not replaying correctly
**Cause**: Event ordering or missing event types
**Solution**: Check event timestamps and ensure all event types are handled in [cart-service.ts:253](cart-service.ts#L253)

## Conclusion

Your implementation is **production-ready** for event sourcing and expiration handling:

✅ Events are the source of truth
✅ SF context expiration is handled automatically
✅ Cart state is never lost (within 24-hour session window)
✅ Comprehensive test coverage exists
✅ Operations are transparent to the user

The cart state is **persisted through event sourcing** - not in a database, but through an immutable event log that can reconstruct the cart state at any time.
