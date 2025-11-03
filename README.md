# Telecom Cart Experience API

A thin Experience API layer that provides a stable, persistent-like interface on top of a non-persistent Salesforce cart context. Built with TypeScript and Node.js.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Start the server
npm start
```

The API will be available at `http://localhost:3000`.

## Problem & Solution

### The Challenge
- Salesforce cart contexts are session-based and expire after 5 minutes of inactivity
- When a context expires, all cart state is lost
- Clients need a seamless experience where the cart appears persistent

### Our Approach
We use an **event sourcing lite** pattern:
1. Store cart operations as immutable events (not just final state)
2. When the SF context expires, automatically create a new one
3. Replay all events to reconstruct cart state
4. Retry the operation transparently

From the client's perspective, the cart is always available and persistent.

## Architecture

```
┌─────────────────────────┐
│   HTTP API Layer        │  Express routes, input validation
├─────────────────────────┤
│   Cart Service          │  Business logic, orchestration
├─────────────────────────┤
│   State Manager         │  Event log storage, cart reconstruction
├─────────────────────────┤
│   SF Cart Client        │  Test double simulating SF behavior
└─────────────────────────┘
```

### Key Components

- **CartService**: Main business logic layer that orchestrates operations and handles context expiry
- **CartStateManager**: Manages experience sessions and event logs using event sourcing
- **SalesforceCartClient**: Test double that simulates realistic SF behavior including context expiry
- **Express Routes**: HTTP API endpoints following REST conventions

## API Endpoints

### Create Session
```bash
curl -X POST http://localhost:3000/api/cart/sessions
```

Response:
```json
{
  "sessionId": "exp_a1b2c3d4e5",
  "cart": {
    "sessionId": "exp_a1b2c3d4e5",
    "items": [],
    "subtotal": 0,
    "tax": 0,
    "total": 0
  }
}
```

### Add Item
```bash
curl -X POST http://localhost:3000/api/cart/exp_a1b2c3d4e5/items \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "iphone15",
    "type": "DEVICE",
    "name": "iPhone 15 Pro",
    "price": 99900,
    "quantity": 1
  }'
```

### Get Cart
```bash
curl http://localhost:3000/api/cart/exp_a1b2c3d4e5
```

### Update Item Quantity
```bash
curl -X PATCH http://localhost:3000/api/cart/exp_a1b2c3d4e5/items/iphone15 \
  -H "Content-Type: application/json" \
  -d '{"quantity": 2}'
```

### Remove Item
```bash
# Remove specific quantity
curl -X DELETE http://localhost:3000/api/cart/exp_a1b2c3d4e5/items/iphone15 \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}'

# Remove entire item
curl -X DELETE http://localhost:3000/api/cart/exp_a1b2c3d4e5/items/iphone15
```

### Checkout
```bash
curl -X POST http://localhost:3000/api/cart/exp_a1b2c3d4e5/checkout
```

Response:
```json
{
  "orderId": "ord_xyz789",
  "sessionId": "exp_a1b2c3d4e5",
  "items": [...],
  "subtotal": 99900,
  "tax": 9990,
  "total": 109890,
  "status": "COMPLETED"
}
```

## Complete Example Flow

```bash
# 1. Create a session
SESSION=$(curl -s -X POST http://localhost:3000/api/cart/sessions | jq -r '.sessionId')

# 2. Add iPhone
curl -X POST http://localhost:3000/api/cart/$SESSION/items \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "iphone15",
    "type": "DEVICE",
    "name": "iPhone 15 Pro",
    "price": 99900,
    "quantity": 1
  }'

# 3. Add unlimited plan
curl -X POST http://localhost:3000/api/cart/$SESSION/items \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "plan_unlimited",
    "type": "PLAN",
    "name": "Unlimited 5G",
    "price": 7000,
    "quantity": 1
  }'

# 4. Add phone case
curl -X POST http://localhost:3000/api/cart/$SESSION/items \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "case_01",
    "type": "ADDON",
    "name": "Protective Case",
    "price": 2999,
    "quantity": 1
  }'

# 5. View cart
curl http://localhost:3000/api/cart/$SESSION

# 6. Update case quantity
curl -X PATCH http://localhost:3000/api/cart/$SESSION/items/case_01 \
  -H "Content-Type: application/json" \
  -d '{"quantity": 2}'

# 7. Checkout
curl -X POST http://localhost:3000/api/cart/$SESSION/checkout
```

## Design Decisions & Tradeoffs

### Event Sourcing Lite
**Chosen**: Store operations as events and replay on context expiry  
**Pros**: 
- Accurate state reconstruction
- Built-in audit trail
- Simpler consistency model

**Cons**: 
- Need to replay entire history on expiry
- Memory grows with number of operations

**Alternative Considered**: Cache SF state and resync, but harder to guarantee consistency

### Independent Session IDs
**Chosen**: Generate our own session IDs separate from SF context IDs  
**Pros**: 
- Stable client experience
- SF implementation details hidden
- Can survive multiple SF context cycles

**Cons**: Additional mapping layer needed

**Alternative Considered**: Expose SF context IDs directly, but breaks on expiry

### Synchronous Replay
**Chosen**: Replay events on-demand when context expires  
**Pros**: 
- Simple implementation
- No background jobs
- Lazy evaluation

**Cons**: 
- First request after expiry is slower
- Client may experience slight latency

**Alternative Considered**: Proactive refresh before expiry, but adds complexity

### In-Memory Storage
**Chosen**: Use Maps for session and context storage  
**Pros**: 
- Simple and fast
- No database setup needed
- Sufficient for demo/MVP

**Cons**: 
- State lost on restart
- Not suitable for production
- No horizontal scaling

**Future**: Would use Redis or similar for distributed persistence

## Testing

Run all tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

### Test Coverage

- **SalesforceCartClient**: Context creation, operations, expiry behavior
- **CartStateManager**: Event storage, replay logic, session management
- **CartService**: End-to-end operations, validation, context expiry handling

Key test scenarios:
- Context expiry with automatic replay
- Multiple expiry cycles in one session
- Complex operation sequences (add, remove, update)
- Edge cases (empty cart, duplicate items, invalid inputs)

## Project Structure

```
.
├── src/
│   ├── types.ts              # TypeScript types and interfaces
│   ├── salesforce-client.ts  # SF cart test double
│   ├── state-manager.ts      # Event sourcing and session management
│   ├── cart-service.ts       # Main business logic
│   ├── routes.ts             # Express API routes
│   ├── app.ts                # Express app setup
│   └── server.ts             # Entry point
├── tests/
│   ├── salesforce-client.test.ts
│   ├── state-manager.test.ts
│   └── cart-service.test.ts
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Configuration

Default configuration in `src/types.ts`:
```typescript
{
  SF_CONTEXT_TTL_MS: 5 * 60 * 1000,        // 5 minutes
  SESSION_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  MAX_SESSION_AGE_MS: 24 * 60 * 60 * 1000,     // 24 hours
  TAX_RATE: 0.10,                          // 10%
  PORT: 3000
}
```

## Known Limitations & Gaps

### Out of Scope for This Implementation
- **Authentication/Authorization**: No user authentication or session security
- **Persistence**: In-memory only, state lost on restart
- **Real Salesforce Integration**: Using test double instead
- **Concurrency Control**: No optimistic locking or conflict resolution
- **Rate Limiting**: No request throttling
- **Distributed Systems**: Cannot scale horizontally
- **Observability**: No structured logging, metrics, or tracing
- **Input Sanitization**: Basic validation only

### Production Considerations
To make this production-ready, you would need:
1. **Database**: Redis or PostgreSQL for persistent event storage
2. **Authentication**: OAuth 2.0 or JWT-based auth
3. **Real SF Integration**: Replace test double with actual Salesforce API client
4. **Monitoring**: Add logging (Winston/Pino), metrics (Prometheus), tracing (OpenTelemetry)
5. **Error Recovery**: Dead letter queues, retry policies
6. **API Gateway**: Rate limiting, request validation, API versioning
7. **Security**: Input sanitization, CORS configuration, HTTPS
8. **Tests**: Integration tests, load tests, chaos engineering
9. **Documentation**: OpenAPI/Swagger spec

## Development

### Prerequisites
- Node.js 20+
- npm

### Commands
```bash
# Install dependencies
npm install

# Development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Adding New Features

To add a new cart operation:
1. Add event type to `CartEvent` union in `types.ts`
2. Implement SF operation in `SalesforceCartClient`
3. Add event replay logic in `CartStateManager.buildCartFromEvents()`
4. Add service method in `CartService`
5. Add route in `routes.ts`
6. Write tests

## License

MIT
