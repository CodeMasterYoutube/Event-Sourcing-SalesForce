# Architecture Specification: Telecom Cart Experience API

## Overview
Design a thin Experience API layer that provides a stable, reliable interface for telecom cart operations on top of a non-persistent Salesforce cart context that expires.

## Problem Statement
- Salesforce cart context is session-based and expires after periods of inactivity
- When the SF context expires, all cart state is lost
- We need to provide a seamless experience where the cart appears persistent from the client's perspective
- Must handle context expiry gracefully and transparently

## Core Architecture Principles

### 1. Event Sourcing Lite
- Store cart operations as events, not just final state
- When SF context expires, replay events to reconstruct cart
- Events are the source of truth, SF cart is a projection

### 2. Layered Architecture
```
┌─────────────────────────┐
│   HTTP API Layer        │  Express routes, validation
├─────────────────────────┤
│   Cart Service          │  Business logic, orchestration
├─────────────────────────┤
│   State Manager         │  Event storage, replay logic
├─────────────────────────┤
│   SF Cart Client        │  Adapter, context management
└─────────────────────────┘
```

### 3. Session Management
- Generate experience session IDs independent of SF context
- Map experience sessions to SF cart contexts
- Track SF context expiry and handle regeneration

## Key Abstractions

### CartEvent
Immutable record of a cart operation:
```typescript
type CartEvent = 
  | { type: 'ITEM_ADDED', itemId: string, quantity: number, timestamp: number }
  | { type: 'ITEM_REMOVED', itemId: string, timestamp: number }
  | { type: 'ITEM_UPDATED', itemId: string, quantity: number, timestamp: number }
```

### CartStateManager
Responsibilities:
- Store events for each experience session
- Replay events to reconstruct cart state
- Provide current cart snapshot from events

### SalesforceCartClient (Test Double)
Simulates realistic SF behavior:
- Cart contexts that expire after N minutes of inactivity
- Methods: createContext(), addItem(), removeItem(), getCart(), checkout()
- Throws ContextExpiredError when context is stale
- Each context has a unique ID

### CartService
Main orchestration layer:
- Handles all business logic
- Coordinates between StateManager and SF Client
- Implements retry logic for context expiry
- Validates operations (e.g., can't remove item that doesn't exist)

### ExperienceSession
```typescript
interface ExperienceSession {
  sessionId: string;           // Our stable session ID
  sfContextId: string | null;  // Current SF context (null if expired)
  lastActivity: number;        // Timestamp
  events: CartEvent[];         // Event log
}
```

## Context Expiry Handling Flow

1. Client makes request with experience sessionId
2. CartService retrieves session from StateManager
3. CartService attempts operation on SF cart
4. If ContextExpiredError:
   - Create new SF context
   - Replay all events from StateManager to new context
   - Retry original operation
   - Update session with new SF context ID
5. If success:
   - Append event to StateManager
   - Return result

## Data Flow Example: Add Item

```
Client -> POST /cart/items
  ↓
CartService.addItem(sessionId, item)
  ↓
StateManager.getSession(sessionId)
  ↓
Try: SFClient.addItem(sfContextId, item)
  ↓
If ContextExpiredError:
  1. newContextId = SFClient.createContext()
  2. Replay all events to newContextId
  3. Retry: SFClient.addItem(newContextId, item)
  ↓
StateManager.appendEvent(sessionId, ADD_ITEM event)
  ↓
Return cart state to client
```

## Telecom Domain Model

### CartItem
```typescript
interface CartItem {
  id: string;
  type: 'DEVICE' | 'PLAN' | 'ADDON';
  name: string;
  price: number;
  quantity: number;
}
```

### Cart
```typescript
interface Cart {
  sessionId: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
}
```

## Implementation Guidelines

### In-Memory Storage
- Use Map<sessionId, ExperienceSession> for session storage
- No database required
- State is lost on server restart (acceptable for this exercise)

### Pure Functions Where Possible
- Event replay logic should be pure
- Cart calculation (subtotal, tax, total) should be pure
- Separation between pure business logic and side effects

### Error Handling
- ContextExpiredError - handled automatically with replay
- ItemNotFoundError - when trying to remove non-existent item
- InvalidQuantityError - for invalid quantities
- ValidationError - for malformed requests

### Testing Strategy
- Unit test StateManager event replay logic
- Unit test CartService with mock SF client
- Test context expiry scenarios explicitly
- Test edge cases: empty cart, duplicate adds, remove non-existent

## Configuration
```typescript
interface Config {
  SF_CONTEXT_TTL_MS: number;     // How long SF contexts live (e.g., 5 min)
  SESSION_CLEANUP_INTERVAL_MS: number;  // Clean old sessions
  MAX_SESSION_AGE_MS: number;    // When to expire experience sessions
}
```

## Out of Scope for This Implementation
- Authentication/authorization
- Persistence layer (database)
- Real Salesforce integration
- Rate limiting
- Concurrent modification handling
- Distributed systems concerns

## Design Tradeoffs

### Event Sourcing vs State Caching
**Chosen: Event Sourcing Lite**
- Pros: Accurate replay, audit trail, simpler consistency model
- Cons: Need to replay entire history on context expiry
- Alternative considered: Cache SF state and resync, but harder to guarantee consistency

### Session Management
**Chosen: Independent session IDs**
- Pros: Stable client experience, SF details hidden
- Cons: Additional mapping layer
- Alternative: Expose SF context IDs directly, but breaks on expiry

### Synchronous Replay
**Chosen: Replay on-demand when context expires**
- Pros: Simple, no background jobs
- Cons: Slower on first request after expiry
- Alternative: Proactive refresh, but adds complexity
