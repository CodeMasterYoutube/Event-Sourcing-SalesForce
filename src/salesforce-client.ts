/**
 * Salesforce Cart Client Test Double
 * 
 * Simulates a Salesforce cart API with realistic behavior including:
 * - Context-based sessions that expire after inactivity
 * - Cart operations (add, remove, get)
 * - Checkout functionality
 */

import { nanoid } from 'nanoid';
import {
  CartItem,
  Cart,
  SalesforceCartContext,
  ContextExpiredError,
  ItemNotFoundError,
  Config,
} from './types';

export class SalesforceCartClient {
  private contexts: Map<string, SalesforceCartContext> = new Map();
  private readonly contextTTL: number;

  constructor(config: Config) {
    this.contextTTL = config.SF_CONTEXT_TTL_MS;
  }

  /**
   * Create a new Salesforce cart context
   */
  createContext(): string {
    const contextId = `sf_${nanoid(10)}`;
    const context: SalesforceCartContext = {
      contextId,
      items: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.contexts.set(contextId, context);
    return contextId;
  }

  /**
   * Add an item to the cart
   */
  addItem(contextId: string, item: CartItem): void {
    const context = this.getValidContext(contextId);
    
    const existingItem = context.items.get(item.id);
    if (existingItem) {
      // Increment quantity if item already exists
      existingItem.quantity += item.quantity;
    } else {
      // Add new item
      context.items.set(item.id, { ...item });
    }
    
    context.lastActivity = Date.now();
  }

  /**
   * Remove an item or reduce its quantity
   */
  removeItem(contextId: string, itemId: string, quantity?: number): void {
    const context = this.getValidContext(contextId);
    
    const item = context.items.get(itemId);
    if (!item) {
      throw new ItemNotFoundError(itemId);
    }

    if (quantity === undefined || quantity >= item.quantity) {
      // Remove item completely
      context.items.delete(itemId);
    } else {
      // Reduce quantity
      item.quantity -= quantity;
    }
    
    context.lastActivity = Date.now();
  }

  /**
   * Update an item's quantity
   */
  updateItem(contextId: string, itemId: string, quantity: number): void {
    const context = this.getValidContext(contextId);
    
    const item = context.items.get(itemId);
    if (!item) {
      throw new ItemNotFoundError(itemId);
    }

    item.quantity = quantity;
    context.lastActivity = Date.now();
  }

  /**
   * Get the current cart state
   */
  getCart(contextId: string, sessionId: string): Cart {
    const context = this.getValidContext(contextId);
    context.lastActivity = Date.now();
    
    return this.buildCart(sessionId, context);
  }

  /**
   * Checkout the cart
   */
  checkout(contextId: string, _sessionId: string): string {
    const context = this.getValidContext(contextId);
    context.lastActivity = Date.now();
    
    // Simulate checkout by generating order ID
    const orderId = `ord_${nanoid(10)}`;
    
    // In a real system, this would process payment, create order, etc.
    // For now, we just return the order ID
    
    return orderId;
  }

  /**
   * Check if a context exists (for testing)
   */
  hasContext(contextId: string): boolean {
    return this.contexts.has(contextId);
  }

  /**
   * Get a valid context or throw if expired
   */
  private getValidContext(contextId: string): SalesforceCartContext {
    const context = this.contexts.get(contextId);
    
    if (!context) {
      throw new ContextExpiredError(contextId);
    }

    const now = Date.now();
    const timeSinceActivity = now - context.lastActivity;
    
    if (timeSinceActivity > this.contextTTL) {
      // Context has expired, remove it
      this.contexts.delete(contextId);
      throw new ContextExpiredError(contextId);
    }

    return context;
  }

  /**
   * Build a Cart object from a context
   */
  private buildCart(sessionId: string, context: SalesforceCartContext): Cart {
    const items = Array.from(context.items.values());
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.round(subtotal * 0.10); // 10% tax
    const total = subtotal + tax;

    return {
      sessionId,
      items,
      subtotal,
      tax,
      total,
    };
  }

  /**
   * Clean up expired contexts (for testing/maintenance)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [contextId, context] of this.contexts.entries()) {
      const timeSinceActivity = now - context.lastActivity;
      if (timeSinceActivity > this.contextTTL) {
        this.contexts.delete(contextId);
      }
    }
  }
}
