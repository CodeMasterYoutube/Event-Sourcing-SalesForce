# API Specification: Telecom Cart Experience API

## Base URL
```
http://localhost:3000/api
```

## Data Models

### CartItem
```typescript
{
  id: string;           // Unique identifier
  type: 'DEVICE' | 'PLAN' | 'ADDON';
  name: string;
  price: number;        // In cents
  quantity: number;
}
```

### Cart
```typescript
{
  sessionId: string;
  items: CartItem[];
  subtotal: number;     // In cents
  tax: number;          // In cents  
  total: number;        // In cents
}
```

### Error Response
```typescript
{
  error: string;        // Error code
  message: string;      // Human-readable message
  details?: any;        // Optional additional context
}
```

## Endpoints

### 1. Create Session
Initialize a new cart session.

**Request**
```
POST /cart/sessions
Content-Type: application/json

{}
```

**Response: 201 Created**
```json
{
  "sessionId": "exp_abc123",
  "cart": {
    "sessionId": "exp_abc123",
    "items": [],
    "subtotal": 0,
    "tax": 0,
    "total": 0
  }
}
```

**Errors**
- 500: Internal server error

---

### 2. Get Cart
Retrieve current cart state for a session.

**Request**
```
GET /cart/:sessionId
```

**Response: 200 OK**
```json
{
  "sessionId": "exp_abc123",
  "items": [
    {
      "id": "item_001",
      "type": "DEVICE",
      "name": "iPhone 15 Pro",
      "price": 99900,
      "quantity": 1
    },
    {
      "id": "item_002",
      "type": "PLAN",
      "name": "Unlimited 5G",
      "price": 7000,
      "quantity": 1
    }
  ],
  "subtotal": 106900,
  "tax": 10690,
  "total": 117590
}
```

**Errors**
- 404: Session not found
- 500: Internal server error

---

### 3. Add Item to Cart
Add a new item or increase quantity of existing item.

**Request**
```
POST /cart/:sessionId/items
Content-Type: application/json

{
  "itemId": "item_001",
  "type": "DEVICE",
  "name": "iPhone 15 Pro",
  "price": 99900,
  "quantity": 1
}
```

**Request Schema**
```typescript
{
  itemId: string;       // Required
  type: 'DEVICE' | 'PLAN' | 'ADDON';  // Required
  name: string;         // Required
  price: number;        // Required, must be >= 0
  quantity: number;     // Required, must be > 0
}
```

**Response: 200 OK**
```json
{
  "sessionId": "exp_abc123",
  "items": [
    {
      "id": "item_001",
      "type": "DEVICE",
      "name": "iPhone 15 Pro",
      "price": 99900,
      "quantity": 1
    }
  ],
  "subtotal": 99900,
  "tax": 9990,
  "total": 109890
}
```

**Behavior**
- If item with same `itemId` exists, increment its quantity
- Tax calculated as 10% of subtotal
- All amounts in cents (USD)

**Errors**
- 400: Invalid request body (missing fields, invalid types)
- 404: Session not found
- 500: Internal server error

---

### 4. Remove Item from Cart
Remove an item or decrease its quantity.

**Request**
```
DELETE /cart/:sessionId/items/:itemId
Content-Type: application/json

{
  "quantity": 1
}
```

**Request Schema**
```typescript
{
  quantity?: number;    // Optional, defaults to entire quantity
}
```

**Response: 200 OK**
```json
{
  "sessionId": "exp_abc123",
  "items": [],
  "subtotal": 0,
  "tax": 0,
  "total": 0
}
```

**Behavior**
- If `quantity` not specified, remove entire item
- If `quantity` < item's current quantity, decrease by that amount
- If `quantity` >= item's current quantity, remove item completely

**Errors**
- 400: Invalid quantity
- 404: Session not found or item not found in cart
- 500: Internal server error

---

### 5. Update Item Quantity
Update the quantity of an existing item.

**Request**
```
PATCH /cart/:sessionId/items/:itemId
Content-Type: application/json

{
  "quantity": 3
}
```

**Request Schema**
```typescript
{
  quantity: number;     // Required, must be > 0
}
```

**Response: 200 OK**
```json
{
  "sessionId": "exp_abc123",
  "items": [
    {
      "id": "item_001",
      "type": "DEVICE",
      "name": "iPhone 15 Pro",
      "price": 99900,
      "quantity": 3
    }
  ],
  "subtotal": 299700,
  "tax": 29970,
  "total": 329670
}
```

**Errors**
- 400: Invalid quantity (must be > 0)
- 404: Session not found or item not found
- 500: Internal server error

---

### 6. Checkout
Complete the cart and process checkout.

**Request**
```
POST /cart/:sessionId/checkout
Content-Type: application/json

{}
```

**Response: 200 OK**
```json
{
  "orderId": "ord_xyz789",
  "sessionId": "exp_abc123",
  "items": [
    {
      "id": "item_001",
      "type": "DEVICE",
      "name": "iPhone 15 Pro",
      "price": 99900,
      "quantity": 1
    }
  ],
  "subtotal": 99900,
  "tax": 9990,
  "total": 109890,
  "status": "COMPLETED"
}
```

**Behavior**
- Cart must have at least one item to checkout
- After successful checkout, the session is marked as completed
- Subsequent operations on a checked-out session should fail

**Errors**
- 400: Empty cart cannot be checked out
- 404: Session not found
- 409: Session already checked out
- 500: Internal server error

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| SESSION_NOT_FOUND | 404 | Experience session does not exist |
| ITEM_NOT_FOUND | 404 | Item not in cart |
| INVALID_REQUEST | 400 | Malformed request body |
| INVALID_QUANTITY | 400 | Quantity must be positive |
| EMPTY_CART | 400 | Cannot checkout empty cart |
| SESSION_COMPLETED | 409 | Session already checked out |
| CONTEXT_EXPIRED | 500 | SF context expired (should be handled internally) |
| INTERNAL_ERROR | 500 | Unexpected server error |

## Implementation Notes

### Session ID Format
- Prefix: `exp_` (for "experience")
- Followed by random alphanumeric string
- Example: `exp_a1b2c3d4e5f6`

### Tax Calculation
- Tax rate: 10% of subtotal
- Calculated as: `Math.round(subtotal * 0.10)`
- All amounts rounded to nearest cent

### Idempotency
- Adding same item multiple times increases quantity
- Removing item multiple times is idempotent (no-op after first removal)

### Context Expiry Handling
- Transparent to client
- If SF context expires, API automatically:
  1. Creates new SF context
  2. Replays all events
  3. Retries operation
- Client sees no error, just slightly slower response

### Concurrency
- Not handled in this implementation
- Last write wins
- Real implementation would need optimistic locking

## Example Flows

### Happy Path: Complete Purchase Flow
```
1. POST /cart/sessions
   → Returns sessionId: exp_123

2. POST /cart/exp_123/items
   Body: { itemId: "iphone15", type: "DEVICE", name: "iPhone 15", price: 99900, quantity: 1 }
   → Returns cart with 1 item

3. POST /cart/exp_123/items
   Body: { itemId: "plan_unlimited", type: "PLAN", name: "Unlimited 5G", price: 7000, quantity: 1 }
   → Returns cart with 2 items

4. GET /cart/exp_123
   → Returns current cart state

5. POST /cart/exp_123/checkout
   → Returns order confirmation
```

### Context Expiry Scenario (Transparent to Client)
```
1. POST /cart/sessions
   → sessionId: exp_456
   
2. POST /cart/exp_456/items (adds iPhone)
   → Success

3. [Wait 6 minutes - SF context expires]

4. POST /cart/exp_456/items (adds Plan)
   → API detects context expired
   → Creates new SF context
   → Replays: add iPhone
   → Retries: add Plan
   → Success (client sees no error)

5. GET /cart/exp_456
   → Returns cart with both items
```

### Modify Quantity
```
1. POST /cart/exp_789/items
   Body: { itemId: "case", type: "ADDON", name: "Phone Case", price: 2999, quantity: 1 }
   
2. PATCH /cart/exp_789/items/case
   Body: { quantity: 3 }
   → Cart now has 3 cases

3. DELETE /cart/exp_789/items/case
   Body: { quantity: 2 }
   → Cart now has 1 case

4. DELETE /cart/exp_789/items/case
   (no body)
   → Cart now empty
```
