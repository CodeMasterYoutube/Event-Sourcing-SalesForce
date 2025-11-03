/**
 * Tests for CartStateManager
 */

import { CartStateManager } from "../dist/state-manager";
import { CartEvent, SessionNotFoundError, DEFAULT_CONFIG } from "../src/types";

describe("CartStateManager", () => {
  let stateManager: CartStateManager;

  beforeEach(() => {
    stateManager = new CartStateManager(DEFAULT_CONFIG);
  });

  afterEach(() => {
    stateManager.stopCleanup();
  });

  describe("createSession", () => {
    it("should create a new session with unique ID", () => {
      const sessionId1 = stateManager.createSession();
      const sessionId2 = stateManager.createSession();

      expect(sessionId1).toBeDefined();
      expect(sessionId2).toBeDefined();
      expect(sessionId1).not.toBe(sessionId2);
      expect(sessionId1).toMatch(/^exp_/);
    });

    it("should create session with empty events", () => {
      const sessionId = stateManager.createSession();
      const events = stateManager.getEvents(sessionId);

      expect(events).toHaveLength(0);
    });
  });

  describe("getSession", () => {
    it("should retrieve an existing session", () => {
      const sessionId = stateManager.createSession();
      const session = stateManager.getSession(sessionId);

      expect(session.sessionId).toBe(sessionId);
      expect(session.events).toEqual([]);
      expect(session.checkedOut).toBe(false);
    });

    it("should throw SessionNotFoundError for non-existent session", () => {
      expect(() => {
        stateManager.getSession("nonexistent");
      }).toThrow(SessionNotFoundError);
    });

    it("should update last activity timestamp", () => {
      const sessionId = stateManager.createSession();
      const session1 = stateManager.getSession(sessionId);
      const timestamp1 = session1.lastActivity;

      // Small delay
      const session2 = stateManager.getSession(sessionId);
      const timestamp2 = session2.lastActivity;

      expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
    });
  });

  describe("appendEvent", () => {
    it("should append event to session", () => {
      const sessionId = stateManager.createSession();
      const event: CartEvent = {
        type: "ITEM_ADDED",
        itemId: "item1",
        itemType: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
        timestamp: Date.now(),
      };

      stateManager.appendEvent(sessionId, event);
      const events = stateManager.getEvents(sessionId);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it("should append multiple events in order", () => {
      const sessionId = stateManager.createSession();
      const event1: CartEvent = {
        type: "ITEM_ADDED",
        itemId: "item1",
        itemType: "DEVICE",
        name: "iPhone",
        price: 99900,
        quantity: 1,
        timestamp: Date.now(),
      };
      const event2: CartEvent = {
        type: "ITEM_ADDED",
        itemId: "item2",
        itemType: "PLAN",
        name: "Unlimited",
        price: 5000,
        quantity: 1,
        timestamp: Date.now(),
      };

      stateManager.appendEvent(sessionId, event1);
      stateManager.appendEvent(sessionId, event2);

      const events = stateManager.getEvents(sessionId);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual(event1);
      expect(events[1]).toEqual(event2);
    });
  });

  describe("buildCartFromEvents", () => {
    it("should build empty cart from no events", () => {
      const sessionId = stateManager.createSession();
      const cart = stateManager.buildCartFromEvents(sessionId, []);

      expect(cart.sessionId).toBe(sessionId);
      expect(cart.items).toHaveLength(0);
      expect(cart.subtotal).toBe(0);
      expect(cart.tax).toBe(0);
      expect(cart.total).toBe(0);
    });

    it("should build cart from ITEM_ADDED events", () => {
      const sessionId = "test-session";
      const events: CartEvent[] = [
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 100000,
          quantity: 1,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_ADDED",
          itemId: "item2",
          itemType: "PLAN",
          name: "Unlimited",
          price: 5000,
          quantity: 1,
          timestamp: Date.now(),
        },
      ];

      const cart = stateManager.buildCartFromEvents(sessionId, events);

      expect(cart.items).toHaveLength(2);
      expect(cart.items[0].id).toBe("item1");
      expect(cart.items[1].id).toBe("item2");
      expect(cart.subtotal).toBe(105000);
      expect(cart.tax).toBe(10500);
      expect(cart.total).toBe(115500);
    });

    it("should increment quantity for duplicate adds", () => {
      const sessionId = "test-session";
      const events: CartEvent[] = [
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 1,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 1,
          timestamp: Date.now(),
        },
      ];

      const cart = stateManager.buildCartFromEvents(sessionId, events);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it("should handle ITEM_REMOVED events", () => {
      const sessionId = "test-session";
      const events: CartEvent[] = [
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 3,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_REMOVED",
          itemId: "item1",
          quantity: 1,
          timestamp: Date.now(),
        },
      ];

      const cart = stateManager.buildCartFromEvents(sessionId, events);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it("should remove item completely when quantity removed >= current", () => {
      const sessionId = "test-session";
      const events: CartEvent[] = [
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 2,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_REMOVED",
          itemId: "item1",
          quantity: 5,
          timestamp: Date.now(),
        },
      ];

      const cart = stateManager.buildCartFromEvents(sessionId, events);

      expect(cart.items).toHaveLength(0);
    });

    it("should handle ITEM_UPDATED events", () => {
      const sessionId = "test-session";
      const events: CartEvent[] = [
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 99900,
          quantity: 1,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_UPDATED",
          itemId: "item1",
          quantity: 5,
          timestamp: Date.now(),
        },
      ];

      const cart = stateManager.buildCartFromEvents(sessionId, events);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(5);
    });

    it("should handle complex event sequences", () => {
      const sessionId = "test-session";
      const events: CartEvent[] = [
        {
          type: "ITEM_ADDED",
          itemId: "item1",
          itemType: "DEVICE",
          name: "iPhone",
          price: 100000,
          quantity: 2,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_ADDED",
          itemId: "item2",
          itemType: "PLAN",
          name: "Unlimited",
          price: 5000,
          quantity: 1,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_REMOVED",
          itemId: "item1",
          quantity: 1,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_ADDED",
          itemId: "item3",
          itemType: "ADDON",
          name: "Case",
          price: 2000,
          quantity: 3,
          timestamp: Date.now(),
        },
        {
          type: "ITEM_UPDATED",
          itemId: "item3",
          quantity: 2,
          timestamp: Date.now(),
        },
      ];

      const cart = stateManager.buildCartFromEvents(sessionId, events);

      expect(cart.items).toHaveLength(3);
      expect(cart.items.find((i) => i.id === "item1")?.quantity).toBe(1);
      expect(cart.items.find((i) => i.id === "item2")?.quantity).toBe(1);
      expect(cart.items.find((i) => i.id === "item3")?.quantity).toBe(2);
    });
  });

  describe("markCheckedOut", () => {
    it("should mark session as checked out", () => {
      const sessionId = stateManager.createSession();

      expect(stateManager.isCheckedOut(sessionId)).toBe(false);

      stateManager.markCheckedOut(sessionId);

      expect(stateManager.isCheckedOut(sessionId)).toBe(true);
    });
  });

  describe("updateSfContextId", () => {
    it("should update Salesforce context ID", () => {
      const sessionId = stateManager.createSession();
      const session1 = stateManager.getSession(sessionId);

      expect(session1.sfContextId).toBeNull();

      stateManager.updateSfContextId(sessionId, "sf_12345");

      const session2 = stateManager.getSession(sessionId);
      expect(session2.sfContextId).toBe("sf_12345");
    });
  });
});
