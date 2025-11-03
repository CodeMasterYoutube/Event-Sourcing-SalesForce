# Claude Code Prompts

This document contains the exact prompts given to Claude Code to implement the telecom cart Experience API.

## Prompt 1: Initial Implementation

```
I need you to implement a TypeScript/Node.js Experience API for a telecom cart system. 

Please read these two specification files first:
- /home/claude/SPEC-A-architecture.md
- /home/claude/SPEC-B-api.md

Based on these specs, implement the following:

1. Project structure:
   - src/ directory with all source code
   - tests/ directory with unit tests
   - Use TypeScript with strict mode
   - Use Express for the HTTP framework
   - Target Node 20+

2. Core components to implement:
   - SalesforceCartClient (test double) - simulates SF cart with context expiry
   - CartStateManager - manages event log and replay logic
   - CartService - main business logic layer
   - Express API routes matching the spec
   - Type definitions for all models

3. Key requirements:
   - In-memory storage only (no database)
   - Implement context expiry in SalesforceCartClient (expires after 5 minutes of inactivity)
   - Automatic replay when context expires
   - Unit tests for critical paths:
     * Event replay logic
     * Context expiry and recovery
     * Add/remove/update item operations
     * Checkout validation

4. File organization:
   src/
     types.ts - All TypeScript interfaces and types
     salesforce-client.ts - SF client test double
     state-manager.ts - Event storage and replay
     cart-service.ts - Business logic
     routes.ts - Express routes
     app.ts - Express app setup
     server.ts - Entry point
   tests/
     salesforce-client.test.ts
     state-manager.test.ts
     cart-service.test.ts

5. Additional files needed:
   - package.json with dependencies
   - tsconfig.json
   - .gitignore
   - README.md with setup instructions

Please implement this following the architecture and API specs exactly. Make sure to:
- Handle context expiry transparently 
- Validate all inputs
- Include proper error handling
- Write clean, well-typed TypeScript code
- Add JSDoc comments for public APIs
```

### Notes on Prompt 1:
- **Accepted**: Overall structure and component breakdown
- **Edited**: Added explicit error handling for empty cart checkout
- **Accepted**: Test double implementation approach
- **Added**: Request to include example curl commands in README

---

## Prompt 2: Test Coverage Enhancement

```
Please add more comprehensive unit tests for the following scenarios:

1. CartService tests:
   - Add same item multiple times (should increase quantity)
   - Remove item with partial quantity
   - Remove item with quantity exceeding current amount
   - Update item quantity
   - Attempt to remove non-existent item (should error)
   - Checkout with empty cart (should error)
   - Checkout twice on same session (should error)

2. State replay tests:
   - Replay sequence of add/remove operations
   - Replay with quantity updates
   - Verify final state matches after full replay

3. Context expiry integration tests:
   - Add item, wait for context expiry, add another item
   - Verify both items present after replay
   - Multiple expiry cycles

Make sure all tests use proper mocking and are isolated from each other.
```

### Notes on Prompt 2:
- **Accepted**: All additional test cases
- **Modified**: Adjusted context expiry timing in tests to 100ms for faster test execution
- **Accepted**: Mock-based approach for testing

---

## Prompt 3: README and Documentation

```
Please create a comprehensive README.md that includes:

1. Project overview and what it does
2. Prerequisites (Node 20+, npm)
3. Setup instructions:
   - Install dependencies
   - Build the project
   - Run tests
   - Start the server
4. API usage examples with curl commands for:
   - Creating a session
   - Adding items
   - Removing items  
   - Getting cart
   - Checking out
5. Architecture decisions section explaining:
   - Why event sourcing approach
   - How context expiry is handled
   - Design tradeoffs made
6. Known limitations and gaps
7. Project structure overview

Keep it concise but complete.
```

### Notes on Prompt 3:
- **Accepted**: README structure
- **Added**: Quick start section at the top
- **Edited**: Made curl examples more realistic with sample product data
- **Accepted**: Architecture decisions explanation

---

## Prompt 4: Edge Cases and Polish

```
Please review the implementation and address these edge cases:

1. Session cleanup: Add logic to remove old sessions that haven't been accessed in 24 hours
2. Input validation: Ensure price and quantity are positive numbers
3. Cart calculations: Verify tax calculation is correct (10% of subtotal, rounded)
4. Error messages: Make error messages clear and actionable
5. Type safety: Ensure no 'any' types are used except where absolutely necessary

Also add:
- A health check endpoint at GET /health
- Request logging middleware
- Proper HTTP status codes for all error cases
```

### Notes on Prompt 4:
- **Accepted**: Session cleanup logic with configurable TTL
- **Accepted**: Input validation enhancements
- **Modified**: Chose not to add request logging to keep implementation minimal
- **Accepted**: Health check endpoint
- **Fixed**: Found and corrected a bug in tax calculation rounding

---

## Summary of Interactions

**Total prompts**: 4 main prompts + 3 small clarification questions

**Major edits made**:
1. Adjusted test timeout values for faster execution
2. Enhanced error messages for better DX
3. Added explicit types instead of 'any' in event handling
4. Fixed edge case in remove item logic when quantity = 0

**Accepted as-is**:
- Overall architecture with event sourcing
- Test double approach for Salesforce client
- In-memory storage strategy
- API endpoint contracts
- Project structure and file organization

**Known gaps** (documented but not implemented):
- No authentication/authorization
- No rate limiting
- No request ID tracking
- No structured logging
- No metrics/observability
- No concurrent modification handling
- No distributed deployment support

The implementation followed the specs closely and delivered a working, tested solution that demonstrates the core architectural patterns for handling non-persistent external state.
