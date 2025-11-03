/**
 * Integration Tests for Event Sourcing and Expiration
 *
 * These tests demonstrate that cart state persists through SF context expiration
 * by using event sourcing and automatic replay.
 */

import { CartService } from "../cart-service";
import { CartStateManager } from "../state-manager";
import { SalesforceCartClient } from "../salesforce-client";
import { DEFAULT_CONFIG, Config } from "../types";

describe("Event Sourcing & Expiration Integration", () => {
  let cartService: CartService;
  let stateManager: CartStateManager;
  let sfClient: SalesforceCartClient;

  // Use very short TTL for integration tests (50ms)
  const testConfig: Config = {
    ...DEFAULT_CONFIG,
    SF_CONTEXT_TTL_MS: 50, // SF context expires after 50ms
  };

  beforeEach(() => {
    stateManager = new CartStateManager(testConfig);
    sfClient = new SalesforceCartClient(testConfig);
    cartService = new CartService(stateManager, sfClient);
  });

  afterEach(() => {
    stateManager.stopCleanup();
  });

  describe("Event Log Persistence", () => {
    it("should persist events even when SF context expires", async () => {
      const { sessionId } = cartService.createSession();

      // Add item 1
      await cartService.addItem(sessionId, {
        itemId: "device1",
        type: "DEVICE",
        name: "Samsung Galaxy S24",
        price: 89900,
        quantity: 1,
      });

      // Verify events are stored
      const events1 = stateManager.getEvents(sessionId);
      expect(events1).toHaveLength(1);
      expect(events1[0].type).toBe("ITEM_ADDED");
      expect(events1[0].itemId).toBe("device1");

      // Wait for SF context to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add item 2 - this will trigger replay
      await cartService.addItem(sessionId, {
        itemId: "plan1",
        type: "PLAN",
        name: "5G Unlimited",
        price: 6500,
        quantity: 1,
      });

      // Verify both events are stored
      const events2 = stateManager.getEvents(sessionId);
      expect(events2).toHaveLength(2);
      expect(events2[0].itemId).toBe("device1");
      expect(events2[1].itemId).toBe("plan1");

      // Verify cart has both items
      const cart = cartService.getCart(sessionId);
      expect(cart.items).toHaveLength(2);
      expect(cart.items.find((i) => i.id === "device1")).toBeDefined();
      expect(cart.items.find((i) => i.id === "plan1")).toBeDefined();
    });

    it("should maintain correct quantities through replay", async () => {
      const { sessionId } = cartService.createSession();

      // Add 3 units of item1
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Tablet",
        price: 50000,
        quantity: 3,
      });

      // Add 2 more units (should be 5 total)
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Tablet",
        price: 50000,
        quantity: 2,
      });

      // Remove 1 unit (should be 4 total)
      await cartService.removeItem(sessionId, "item1", 1);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update to 7 units (should trigger replay and set to 7)
      await cartService.updateItem(sessionId, "item1", 7);

      // Verify final state
      const cart = cartService.getCart(sessionId);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(7);
    });

    it("should handle complete cart lifecycle with expiration", async () => {
      const { sessionId } = cartService.createSession();

      // Build a complex cart
      await cartService.addItem(sessionId, {
        itemId: "phone1",
        type: "DEVICE",
        name: "iPhone 15",
        price: 99900,
        quantity: 2,
      });

      await cartService.addItem(sessionId, {
        itemId: "plan1",
        type: "PLAN",
        name: "Premium Plan",
        price: 8000,
        quantity: 2,
      });

      await cartService.addItem(sessionId, {
        itemId: "addon1",
        type: "ADDON",
        name: "Insurance",
        price: 1500,
        quantity: 2,
      });

      // Remove one phone
      await cartService.removeItem(sessionId, "phone1", 1);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update plan quantity
      await cartService.updateItem(sessionId, "plan1", 1);

      // Add another addon
      await cartService.addItem(sessionId, {
        itemId: "addon2",
        type: "ADDON",
        name: "Screen Protector",
        price: 500,
        quantity: 3,
      });

      // Wait for another expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Final cart state verification
      const cart = cartService.getCart(sessionId);
      expect(cart.items).toHaveLength(4);

      const phone = cart.items.find((i) => i.id === "phone1");
      const plan = cart.items.find((i) => i.id === "plan1");
      const addon1 = cart.items.find((i) => i.id === "addon1");
      const addon2 = cart.items.find((i) => i.id === "addon2");

      expect(phone?.quantity).toBe(1); // 2 added, 1 removed
      expect(plan?.quantity).toBe(1); // Updated to 1
      expect(addon1?.quantity).toBe(2); // Original
      expect(addon2?.quantity).toBe(3); // Added after expiry

      // Calculate expected totals
      const expectedSubtotal =
        phone!.price * phone!.quantity +
        plan!.price * plan!.quantity +
        addon1!.price * addon1!.quantity +
        addon2!.price * addon2!.quantity;

      expect(cart.subtotal).toBe(expectedSubtotal);
    });
  });

  describe("Event Replay Accuracy", () => {
    it("should replay events in correct order", async () => {
      const { sessionId } = cartService.createSession();

      // Create a specific sequence
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Device",
        price: 10000,
        quantity: 5,
      });

      await cartService.removeItem(sessionId, "item1", 2); // Should have 3
      await cartService.updateItem(sessionId, "item1", 10); // Should have 10

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      await cartService.removeItem(sessionId, "item1", 3); // Should have 7

      // Verify final state
      const cart = cartService.getCart(sessionId);
      expect(cart.items[0].quantity).toBe(7);

      // Verify event log has all operations
      const events = stateManager.getEvents(sessionId);
      expect(events).toHaveLength(4);
      expect(events[0].type).toBe("ITEM_ADDED");
      expect(events[1].type).toBe("ITEM_REMOVED");
      expect(events[2].type).toBe("ITEM_UPDATED");
      expect(events[3].type).toBe("ITEM_REMOVED");
    });

    it("should handle item removal to zero correctly", async () => {
      const { sessionId } = cartService.createSession();

      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Device",
        price: 10000,
        quantity: 2,
      });

      await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Plan",
        price: 5000,
        quantity: 1,
      });

      // Remove all of item1
      await cartService.removeItem(sessionId, "item1");

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify item1 is gone but item2 remains
      const cart = cartService.getCart(sessionId);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].id).toBe("item2");
    });
  });

  describe("Checkout with Expiration", () => {
    it("should checkout successfully after SF context expiry", async () => {
      const { sessionId } = cartService.createSession();

      // Build cart
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Device",
        price: 50000,
        quantity: 1,
      });

      await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Plan",
        price: 7000,
        quantity: 1,
      });

      // Wait for SF context to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Checkout should still work
      const result = await cartService.checkout(sessionId);

      expect(result.orderId).toBeDefined();
      expect(result.orderId).toMatch(/^ord_/);
      expect(result.status).toBe("COMPLETED");
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(result.subtotal + result.tax);
    });

    it("should preserve cart state through multiple expiries before checkout", async () => {
      const { sessionId } = cartService.createSession();

      // Add item 1
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Device",
        price: 30000,
        quantity: 1,
      });

      // Wait for expiry #1
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add item 2
      await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Plan",
        price: 5000,
        quantity: 1,
      });

      // Wait for expiry #2
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add item 3
      await cartService.addItem(sessionId, {
        itemId: "item3",
        type: "ADDON",
        name: "Addon",
        price: 1000,
        quantity: 2,
      });

      // Wait for expiry #3
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Checkout
      const result = await cartService.checkout(sessionId);

      // All items should be in the order
      expect(result.items).toHaveLength(3);
      expect(result.items.find((i) => i.id === "item1")).toBeDefined();
      expect(result.items.find((i) => i.id === "item2")).toBeDefined();
      expect(result.items.find((i) => i.id === "item3")).toBeDefined();

      // Verify pricing
      const expectedSubtotal = 30000 + 5000 + 1000 * 2;
      expect(result.subtotal).toBe(expectedSubtotal);
    });
  });

  describe("Cart State Reconstruction", () => {
    it("should reconstruct identical state from events after expiry", async () => {
      const { sessionId } = cartService.createSession();

      // Build cart
      await cartService.addItem(sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Phone",
        price: 80000,
        quantity: 1,
      });

      await cartService.addItem(sessionId, {
        itemId: "item2",
        type: "PLAN",
        name: "Plan",
        price: 6000,
        quantity: 1,
      });

      // Get cart state before expiry
      const cart1 = cartService.getCart(sessionId);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Force replay by adding and removing an item
      await cartService.addItem(sessionId, {
        itemId: "temp",
        type: "ADDON",
        name: "Temp",
        price: 100,
        quantity: 1,
      });
      await cartService.removeItem(sessionId, "temp");

      // Get cart state after expiry and replay
      const cart2 = cartService.getCart(sessionId);

      // States should be identical (minus temp item)
      expect(cart2.items).toHaveLength(2);
      expect(cart1.items[0]).toEqual(cart2.items[0]);
      expect(cart1.items[1]).toEqual(cart2.items[1]);
      expect(cart1.subtotal).toBe(cart2.subtotal);
      expect(cart1.tax).toBe(cart2.tax);
      expect(cart1.total).toBe(cart2.total);
    });
  });

  describe("Session Isolation", () => {
    it("should maintain separate event logs for different sessions", async () => {
      const session1 = cartService.createSession();
      const session2 = cartService.createSession();

      // Add different items to each session
      await cartService.addItem(session1.sessionId, {
        itemId: "item1",
        type: "DEVICE",
        name: "Device 1",
        price: 50000,
        quantity: 1,
      });

      await cartService.addItem(session2.sessionId, {
        itemId: "item2",
        type: "DEVICE",
        name: "Device 2",
        price: 60000,
        quantity: 1,
      });

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add more items
      await cartService.addItem(session1.sessionId, {
        itemId: "item3",
        type: "PLAN",
        name: "Plan 1",
        price: 5000,
        quantity: 1,
      });

      await cartService.addItem(session2.sessionId, {
        itemId: "item4",
        type: "PLAN",
        name: "Plan 2",
        price: 7000,
        quantity: 1,
      });

      // Verify each session has its own items
      const cart1 = cartService.getCart(session1.sessionId);
      const cart2 = cartService.getCart(session2.sessionId);

      expect(cart1.items).toHaveLength(2);
      expect(cart2.items).toHaveLength(2);

      expect(cart1.items.find((i) => i.id === "item1")).toBeDefined();
      expect(cart1.items.find((i) => i.id === "item3")).toBeDefined();

      expect(cart2.items.find((i) => i.id === "item2")).toBeDefined();
      expect(cart2.items.find((i) => i.id === "item4")).toBeDefined();

      // Verify no cross-contamination
      expect(cart1.items.find((i) => i.id === "item2")).toBeUndefined();
      expect(cart2.items.find((i) => i.id === "item1")).toBeUndefined();
    });
  });
});
