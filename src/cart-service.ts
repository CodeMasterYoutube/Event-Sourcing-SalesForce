/**
 * Cart Service
 *
 * Main business logic layer that:
 * - Orchestrates between StateManager and SalesforceClient
 * - Handles context expiry with automatic replay
 * - Validates operations
 * - Provides high-level cart operations
 */

import { SalesforceCartClient } from "./salesforce-client";
import { CartStateManager } from "./state-manager";
import {
  Cart,
  CartItem,
  CheckoutResult,
  CartEvent,
  ContextExpiredError,
  InvalidQuantityError,
  ItemNotFoundError,
  EmptyCartError,
  SessionCompletedError,
  AddItemRequest,
} from "./types";

export class CartService {
  constructor(
    private readonly stateManager: CartStateManager,
    private readonly sfClient: SalesforceCartClient
  ) {}

  /**
   * Create a new cart session
   */
  createSession(): { sessionId: string; cart: Cart } {
    const sessionId = this.stateManager.createSession();
    const cart = this.stateManager.buildCartFromEvents(sessionId, []);
    return { sessionId, cart };
  }

  /**
   * Get current cart state
   */
  getCart(sessionId: string): Cart {
    // Verify session exists (will throw if not)
    this.stateManager.getSession(sessionId);
    const events = this.stateManager.getEvents(sessionId);
    return this.stateManager.buildCartFromEvents(sessionId, events);
  }

  /**
   * Add an item to the cart
   */
  async addItem(sessionId: string, request: AddItemRequest): Promise<Cart> {
    // Validate input
    this.validateAddItemRequest(request);

    // Check if session is already checked out
    if (this.stateManager.isCheckedOut(sessionId)) {
      throw new SessionCompletedError(sessionId);
    }

    const item: CartItem = {
      id: request.itemId,
      type: request.type,
      name: request.name,
      price: request.price,
      quantity: request.quantity,
    };

    // Try to add to SF cart, with replay on context expiry
    await this.executeWithReplay(sessionId, () => {
      const sfContextId = this.ensureSfContext(sessionId);
      this.sfClient.addItem(sfContextId, item);
    });

    // Record event
    const event: CartEvent = {
      type: "ITEM_ADDED",
      itemId: request.itemId,
      itemType: request.type,
      name: request.name,
      price: request.price,
      quantity: request.quantity,
      timestamp: Date.now(),
    };
    this.stateManager.appendEvent(sessionId, event);

    return this.getCart(sessionId);
  }

  /**
   * Remove an item from the cart
   */
  async removeItem(
    sessionId: string,
    itemId: string,
    quantity?: number
  ): Promise<Cart> {
    // Validate quantity
    if (quantity !== undefined && quantity <= 0) {
      throw new InvalidQuantityError("Quantity must be positive");
    }

    // Check if session is already checked out
    if (this.stateManager.isCheckedOut(sessionId)) {
      throw new SessionCompletedError(sessionId);
    }

    // Check if item exists in current state
    const currentCart = this.getCart(sessionId);
    const existingItem = currentCart.items.find((item) => item.id === itemId);
    if (!existingItem) {
      throw new ItemNotFoundError(itemId);
    }

    // Determine actual quantity to remove
    const quantityToRemove =
      quantity === undefined
        ? existingItem.quantity
        : Math.min(quantity, existingItem.quantity);

    // Try to remove from SF cart, with replay on context expiry
    await this.executeWithReplay(sessionId, () => {
      const sfContextId = this.ensureSfContext(sessionId);
      this.sfClient.removeItem(sfContextId, itemId, quantityToRemove);
    });

    // Record event
    const event: CartEvent = {
      type: "ITEM_REMOVED",
      itemId,
      quantity: quantityToRemove,
      timestamp: Date.now(),
    };
    this.stateManager.appendEvent(sessionId, event);

    return this.getCart(sessionId);
  }

  /**
   * Update an item's quantity
   */
  async updateItem(
    sessionId: string,
    itemId: string,
    quantity: number
  ): Promise<Cart> {
    // Validate quantity
    if (quantity <= 0) {
      throw new InvalidQuantityError("Quantity must be positive");
    }

    // Check if session is already checked out
    if (this.stateManager.isCheckedOut(sessionId)) {
      throw new SessionCompletedError(sessionId);
    }

    // Check if item exists in current state
    const currentCart = this.getCart(sessionId);
    const existingItem = currentCart.items.find((item) => item.id === itemId);
    if (!existingItem) {
      throw new ItemNotFoundError(itemId);
    }

    // Try to update in SF cart, with replay on context expiry
    await this.executeWithReplay(sessionId, () => {
      const sfContextId = this.ensureSfContext(sessionId);
      this.sfClient.updateItem(sfContextId, itemId, quantity);
    });

    // Record event
    const event: CartEvent = {
      type: "ITEM_UPDATED",
      itemId,
      quantity,
      timestamp: Date.now(),
    };
    this.stateManager.appendEvent(sessionId, event);

    return this.getCart(sessionId);
  }

  /**
   * Checkout the cart
   */
  async checkout(sessionId: string): Promise<CheckoutResult> {
    // Check if session is already checked out
    if (this.stateManager.isCheckedOut(sessionId)) {
      throw new SessionCompletedError(sessionId);
    }

    const currentCart = this.getCart(sessionId);

    if (currentCart.items.length === 0) {
      throw new EmptyCartError();
    }

    // Try to checkout in SF, with replay on context expiry
    let orderId: string = "";
    await this.executeWithReplay(sessionId, () => {
      const sfContextId = this.ensureSfContext(sessionId);
      orderId = this.sfClient.checkout(sfContextId, sessionId);
    });

    // Mark session as checked out
    this.stateManager.markCheckedOut(sessionId);

    return {
      orderId,
      sessionId,
      items: currentCart.items,
      subtotal: currentCart.subtotal,
      tax: currentCart.tax,
      total: currentCart.total,
      status: "COMPLETED",
    };
  }

  /**
   * Execute an operation with automatic replay on context expiry
   */
  private async executeWithReplay(
    sessionId: string,
    operation: () => void
  ): Promise<void> {
    try {
      operation();
    } catch (error) {
      if (error instanceof ContextExpiredError) {
        // Context expired, replay events and retry
        await this.replayEvents(sessionId);
        operation(); // Retry the operation
      } else {
        throw error;
      }
    }
  }

  /**
   * Replay all events to a new Salesforce context
   */
  private async replayEvents(sessionId: string): Promise<void> {
    // Create new SF context
    const newContextId = this.sfClient.createContext();
    this.stateManager.updateSfContextId(sessionId, newContextId);

    // Get all events
    const events = this.stateManager.getEvents(sessionId);

    // Replay each event
    for (const event of events) {
      switch (event.type) {
        case "ITEM_ADDED": {
          const item: CartItem = {
            id: event.itemId,
            type: event.itemType,
            name: event.name,
            price: event.price,
            quantity: event.quantity,
          };
          this.sfClient.addItem(newContextId, item);
          break;
        }
        case "ITEM_REMOVED": {
          try {
            this.sfClient.removeItem(
              newContextId,
              event.itemId,
              event.quantity
            );
          } catch (error) {
            // Item might not exist due to prior operations, ignore
            if (!(error instanceof ItemNotFoundError)) {
              throw error;
            }
          }
          break;
        }
        case "ITEM_UPDATED": {
          try {
            this.sfClient.updateItem(
              newContextId,
              event.itemId,
              event.quantity
            );
          } catch (error) {
            // Item might not exist, ignore
            if (!(error instanceof ItemNotFoundError)) {
              throw error;
            }
          }
          break;
        }
      }
    }
  }

  /**
   * Ensure a Salesforce context exists for the session
   */
  private ensureSfContext(sessionId: string): string {
    const session = this.stateManager.getSession(sessionId);

    if (!session.sfContextId) {
      const contextId = this.sfClient.createContext();
      this.stateManager.updateSfContextId(sessionId, contextId);
      return contextId;
    }

    return session.sfContextId;
  }

  /**
   * Validate add item request
   */
  private validateAddItemRequest(request: AddItemRequest): void {
    if (!request.itemId || typeof request.itemId !== "string") {
      throw new InvalidQuantityError("Item ID is required");
    }
    if (!request.type || !["DEVICE", "PLAN", "ADDON"].includes(request.type)) {
      throw new InvalidQuantityError("Invalid item type");
    }
    if (!request.name || typeof request.name !== "string") {
      throw new InvalidQuantityError("Item name is required");
    }
    if (typeof request.price !== "number" || request.price < 0) {
      throw new InvalidQuantityError("Price must be a non-negative number");
    }
    if (typeof request.quantity !== "number" || request.quantity <= 0) {
      throw new InvalidQuantityError("Quantity must be a positive number");
    }
  }
}
