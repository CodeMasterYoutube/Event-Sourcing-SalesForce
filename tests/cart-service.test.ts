/**
 * Tests for CartService
 */

import { CartService } from "../src/cart-service";
import { CartStateManager } from "../src/state-manager";
import { SalesforceCartClient } from "../src/salesforce-client";
import {
  DEFAULT_CONFIG,
  SessionNotFoundError,
  ItemNotFoundError,
  InvalidQuantityError,
  EmptyCartError,
  SessionCompletedError,
} from "../src/types";

describe("CartService", () => {
  let cartService: CartService;
  let stateManager: CartStateManager;
  let sfClient: SalesforceCartClient;

  // Use shorter TTL for tests
  const testConfig = {
    ...DEFAULT_CONFIG,
    SF_CONTEXT_TTL_MS: 100,
  };

  beforeEach(() => {
    stateManager = new CartStateManager(testConfig);
    sfClient = new SalesforceCartClient(testConfig);
    cartService = new CartService(stateManager, sfClient);
  });

  afterEach(() => {
    stateManager.stopCleanup();
  });

  describe("createSession", () => {
    it("should create a new session with empty cart", () => {
      const result = cartService.createSession();

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toMatch(/^exp_/);
      expect(result.cart.items).toHaveLength(0);
      expect(result.cart.total).toBe(0);
    });
  });

  describe("getCart", () => {
    it("should get empty cart for new session", () => {
      const { sessionId } = cartService.createSession();
      const cart = cartService.getCart(sessionId);

      expect(cart.sessionId).toBe(sessionId);
      expect(cart.items).toHaveLength(0);
    });

    it("should throw SessionNotFoundError for invalid session", () => {
      expect(() => {
        cartService.getCart("invalid-session");
      }).toThrow(SessionNotFoundError);
    });
  });

  describe("addItem", () => {
    it("should add item to cart", async () => {
      const { sessionId } = cartService.createSession();

      const cart = await cartService.addItem(sessionId, {
        itemId: "iphone15",
        type: "DEVICE",
        name: "iPhone 15 Pro",
        price: 99900,
        quantity: 1,
      });

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].id).toBe("iphone15");
      expect(cart.items[0].quantity).toBe(1);
      expect(cart.subtotal).toBe(99900);
    });

    it("should increment quantity when adding same item", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "iphone15",
        type: "DEVICE",
        name: "iPhone 15 Pro",
        price: 99900,
        quantity: 1,
      });

      const cart = await cartService.addItem(sessionId, {
        itemId: "iphone15",
        type: "DEVICE",
        name: "iPhone 15 Pro",
        price: 99900,
        quantity: 2,
      });

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
    });

    it("should add multiple different items", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "iphone15",
        type: "DEVICE",
        name: "iPhone 15 Pro",
        price: 99900,
        quantity: 1,
      });

      const cart = await cartService.addItem(sessionId, {
        itemId: "plan_unlimited",
        type: "PLAN",
        name: "Unlimited 5G",
        price: 7000,
        quantity: 1,
      });

      expect(cart.items).toHaveLength(2);
      expect(cart.subtotal).toBe(106900);
      expect(cart.tax).toBe(10690);
      expect(cart.total).toBe(117590);
    });

    it("should validate item request", async () => {
      const { sessionId } = cartService.createSession();

      await expect(
        cartService.addItem(sessionId, {
          itemId: "",
          type: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 1,
        })
      ).rejects.toThrow(InvalidQuantityError);

      await expect(
        cartService.addItem(sessionId, {
          itemId: "item1",
          type: "INVALID" as any,
          name: "iPhone",
          price: 99900,
          quantity: 1,
        })
      ).rejects.toThrow(InvalidQuantityError);

      await expect(
        cartService.addItem(sessionId, {
          itemId: "item1",
          type: "DEVICE",
          name: "",
          price: 99900,
          quantity: 1,
        })
      ).rejects.toThrow(InvalidQuantityError);

      await expect(
        cartService.addItem(sessionId, {
          itemId: "item1",
          type: "DEVICE",
          name: "iPhone",
          price: -100,
          quantity: 1,
        })
      ).rejects.toThrow(InvalidQuantityError);

      await expect(
        cartService.addItem(sessionId, {
          itemId: "item1",
          type: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 0,
        })
      ).rejects.toThrow(InvalidQuantityError);
    });

    it("should handle context expiry with automatic replay", async () => {
      const { sessionId } = cartService.createSession();

      // Add first item
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      // Wait for SF context to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Add second item - should trigger replay
      const cart = await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Unlimited",
        price: 5000,
        quantity: 1,
      });

      // Both items should be present
      expect(cart.items).toHaveLength(2);
      expect(cart.items.find((i) => i.id === "item1")).toBeDefined();
      expect(cart.items.find((i) => i.id === "item2")).toBeDefined();
    });

    it("should not allow adding to checked out session", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      await cartService.checkout(sessionId);

      await expect(
        cartService.addItem(sessionId, {
          itemId: "item2",
          type: "PLAN",
          name: "Plan",
          price: 5000,
          quantity: 1,
        })
      ).rejects.toThrow(SessionCompletedError);
    });
  });

  describe("removeItem", () => {
    it("should remove item from cart", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      const cart = await cartService.removeItem(sessionId, "item1");

      expect(cart.items).toHaveLength(0);
    });

    it("should reduce quantity when removing partial amount", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 3,
      });

      const cart = await cartService.removeItem(sessionId, "item1", 1);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it("should remove item when removing quantity >= current", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 2,
      });

      const cart = await cartService.removeItem(sessionId, "item1", 5);

      expect(cart.items).toHaveLength(0);
    });

    it("should throw ItemNotFoundError for non-existent item", async () => {
      const { sessionId } = cartService.createSession();

      await expect(
        cartService.removeItem(sessionId, "nonexistent")
      ).rejects.toThrow(ItemNotFoundError);
    });

    it("should validate quantity", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      await expect(
        cartService.removeItem(sessionId, "item1", 0)
      ).rejects.toThrow(InvalidQuantityError);

      await expect(
        cartService.removeItem(sessionId, "item1", -1)
      ).rejects.toThrow(InvalidQuantityError);
    });
  });

  describe("updateItem", () => {
    it("should update item quantity", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      const cart = await cartService.updateItem(sessionId, "item1", 5);

      expect(cart.items[0].quantity).toBe(5);
    });

    it("should throw ItemNotFoundError for non-existent item", async () => {
      const { sessionId } = cartService.createSession();

      await expect(
        cartService.updateItem(sessionId, "nonexistent", 5)
      ).rejects.toThrow(ItemNotFoundError);
    });

    it("should validate quantity", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      await expect(
        cartService.updateItem(sessionId, "item1", 0)
      ).rejects.toThrow(InvalidQuantityError);

      await expect(
        cartService.updateItem(sessionId, "item1", -1)
      ).rejects.toThrow(InvalidQuantityError);
    });
  });

  describe("checkout", () => {
    it("should checkout cart successfully", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      const result = await cartService.checkout(sessionId);

      expect(result.orderId).toBeDefined();
      expect(result.orderId).toMatch(/^ord_/);
      expect(result.status).toBe("COMPLETED");
      expect(result.items).toHaveLength(1);
    });

    it("should throw EmptyCartError for empty cart", async () => {
      const { sessionId } = cartService.createSession();

      await expect(cartService.checkout(sessionId)).rejects.toThrow(
        EmptyCartError
      );
    });

    it("should throw SessionCompletedError when checking out twice", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      await cartService.checkout(sessionId);

      await expect(cartService.checkout(sessionId)).rejects.toThrow(
        SessionCompletedError
      );
    });

    it("should handle context expiry during checkout", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      // Wait for context to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Checkout should still work
      const result = await cartService.checkout(sessionId);

      expect(result.orderId).toBeDefined();
      expect(result.items).toHaveLength(1);
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple context expiries", async () => {
      const { sessionId } = cartService.createSession();

      // Add item 1
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      });

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Add item 2 (triggers first replay)
      await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Plan",
        price: 5000,
        quantity: 1,
      });

      // Wait for expiry again
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Add item 3 (triggers second replay)
      const cart = await cartService.addItem(sessionId, {
        itemId: "item3",
        type: "ADDON",
        name: "Case",
        price: 2000,
        quantity: 1,
      });

      // All three items should be present
      expect(cart.items).toHaveLength(3);
    });

    it("should handle add, remove, update sequence with expiry", async () => {
      const { sessionId } = cartService.createSession();

      // Add items
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 2,
      });

      await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Plan",
        price: 5000,
        quantity: 1,
      });

      // Remove one of item1
      await cartService.removeItem(sessionId, "item1", 1);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Update item1 quantity
      await cartService.updateItem(sessionId, "item1", 3);

      // Add item3
      const cart = await cartService.addItem(sessionId, {
        itemId: "item3",
        type: "ADDON",
        name: "Case",
        price: 2000,
        quantity: 1,
      });

      expect(cart.items).toHaveLength(3);
      expect(cart.items.find((i) => i.id === "item1")?.quantity).toBe(3);
    });
  });
});
