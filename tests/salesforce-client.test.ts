/**
 * Tests for SalesforceCartClient
 */

import { SalesforceCartClient } from "../src/salesforce-client";
import {
  ContextExpiredError,
  ItemNotFoundError,
  CartItem,
  DEFAULT_CONFIG,
} from "../src/types";

describe("SalesforceCartClient", () => {
  let client: SalesforceCartClient;

  // Use shorter TTL for tests
  const testConfig = {
    ...DEFAULT_CONFIG,
    SF_CONTEXT_TTL_MS: 100, // 100ms for fast tests
  };

  beforeEach(() => {
    client = new SalesforceCartClient(testConfig);
  });

  describe("createContext", () => {
    it("should create a new context with unique ID", () => {
      const context1 = client.createContext();
      const context2 = client.createContext();

      expect(context1).toBeDefined();
      expect(context2).toBeDefined();
      expect(context1).not.toBe(context2);
      expect(context1).toMatch(/^sf_/);
    });
  });

  describe("addItem", () => {
    it("should add an item to the cart", () => {
      const contextId = client.createContext();
      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      };

      client.addItem(contextId, item);
      const cart = client.getCart(contextId, "session1");

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toEqual(item);
    });

    it("should increment quantity when adding same item", () => {
      const contextId = client.createContext();
      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      };

      client.addItem(contextId, item);
      client.addItem(contextId, item);

      const cart = client.getCart(contextId, "session1");
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it("should throw ContextExpiredError after TTL", async () => {
      const contextId = client.createContext();

      // Wait for context to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      };

      expect(() => {
        client.addItem(contextId, item);
      }).toThrow(ContextExpiredError);
    });
  });

  describe("removeItem", () => {
    it("should remove an item completely", () => {
      const contextId = client.createContext();
      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 2,
      };

      client.addItem(contextId, item);
      client.removeItem(contextId, "item1");

      const cart = client.getCart(contextId, "session1");
      expect(cart.items).toHaveLength(0);
    });

    it("should reduce quantity when removing partial amount", () => {
      const contextId = client.createContext();
      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 3,
      };

      client.addItem(contextId, item);
      client.removeItem(contextId, "item1", 1);

      const cart = client.getCart(contextId, "session1");
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it("should throw ItemNotFoundError for non-existent item", () => {
      const contextId = client.createContext();

      expect(() => {
        client.removeItem(contextId, "nonexistent");
      }).toThrow(ItemNotFoundError);
    });
  });

  describe("updateItem", () => {
    it("should update item quantity", () => {
      const contextId = client.createContext();
      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      };

      client.addItem(contextId, item);
      client.updateItem(contextId, "item1", 5);

      const cart = client.getCart(contextId, "session1");
      expect(cart.items[0].quantity).toBe(5);
    });

    it("should throw ItemNotFoundError for non-existent item", () => {
      const contextId = client.createContext();

      expect(() => {
        client.updateItem(contextId, "nonexistent", 5);
      }).toThrow(ItemNotFoundError);
    });
  });

  describe("getCart", () => {
    it("should return empty cart for new context", () => {
      const contextId = client.createContext();
      const cart = client.getCart(contextId, "session1");

      expect(cart.sessionId).toBe("session1");
      expect(cart.items).toHaveLength(0);
      expect(cart.subtotal).toBe(0);
      expect(cart.tax).toBe(0);
      expect(cart.total).toBe(0);
    });

    it("should calculate subtotal, tax, and total correctly", () => {
      const contextId = client.createContext();
      const item1: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 100000, // $1000
        quantity: 1,
      };
      const item2: CartItem = {
        id: "item2",
        type: "PLAN",
        name: "Unlimited",
        price: 5000, // $50
        quantity: 1,
      };

      client.addItem(contextId, item1);
      client.addItem(contextId, item2);

      const cart = client.getCart(contextId, "session1");
      expect(cart.subtotal).toBe(105000);
      expect(cart.tax).toBe(10500); // 10% of subtotal
      expect(cart.total).toBe(115500);
    });
  });

  describe("checkout", () => {
    it("should generate an order ID", () => {
      const contextId = client.createContext();
      const orderId = client.checkout(contextId, "session1");

      expect(orderId).toBeDefined();
      expect(orderId).toMatch(/^ord_/);
    });
  });

  describe("context management", () => {
    it("should refresh activity timestamp on operations", async () => {
      const contextId = client.createContext();

      // Perform operations within TTL window
      await new Promise((resolve) => setTimeout(resolve, 50));

      const item: CartItem = {
        id: "item1",
        type: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
      };
      client.addItem(contextId, item);

      // Wait again but context should still be valid
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw
      const cart = client.getCart(contextId, "session1");
      expect(cart.items).toHaveLength(1);
    });
  });
});
