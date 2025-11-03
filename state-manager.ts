/**
 * Cart State Manager
 * 
 * Manages experience sessions and event logs.
 * Implements event sourcing pattern to reconstruct cart state.
 */

import { nanoid } from 'nanoid';
import {
  ExperienceSession,
  CartEvent,
  Cart,
  CartItem,
  SessionNotFoundError,
  Config,
} from './types';

export class CartStateManager {
  private sessions: Map<string, ExperienceSession> = new Map();
  private readonly maxSessionAge: number;
  private readonly taxRate: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Config) {
    this.maxSessionAge = config.MAX_SESSION_AGE_MS;
    this.taxRate = config.TAX_RATE;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupOldSessions(),
      config.SESSION_CLEANUP_INTERVAL_MS
    );
  }

  /**
   * Create a new experience session
   */
  createSession(): string {
    const sessionId = `exp_${nanoid(10)}`;
    const session: ExperienceSession = {
      sessionId,
      sfContextId: null,
      lastActivity: Date.now(),
      events: [],
      checkedOut: false,
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): ExperienceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Update the Salesforce context ID for a session
   */
  updateSfContextId(sessionId: string, sfContextId: string): void {
    const session = this.getSession(sessionId);
    session.sfContextId = sfContextId;
  }

  /**
   * Append an event to a session's event log
   */
  appendEvent(sessionId: string, event: CartEvent): void {
    const session = this.getSession(sessionId);
    session.events.push(event);
    session.lastActivity = Date.now();
  }

  /**
   * Mark a session as checked out
   */
  markCheckedOut(sessionId: string): void {
    const session = this.getSession(sessionId);
    session.checkedOut = true;
  }

  /**
   * Get all events for a session
   */
  getEvents(sessionId: string): CartEvent[] {
    const session = this.getSession(sessionId);
    return [...session.events];
  }

  /**
   * Build current cart state from events (pure function)
   */
  buildCartFromEvents(sessionId: string, events: CartEvent[]): Cart {
    const itemsMap = new Map<string, CartItem>();

    // Replay events to build current state
    for (const event of events) {
      switch (event.type) {
        case 'ITEM_ADDED': {
          const existing = itemsMap.get(event.itemId);
          if (existing) {
            existing.quantity += event.quantity;
          } else {
            itemsMap.set(event.itemId, {
              id: event.itemId,
              type: event.itemType,
              name: event.name,
              price: event.price,
              quantity: event.quantity,
            });
          }
          break;
        }
        case 'ITEM_REMOVED': {
          const existing = itemsMap.get(event.itemId);
          if (existing) {
            if (event.quantity >= existing.quantity) {
              itemsMap.delete(event.itemId);
            } else {
              existing.quantity -= event.quantity;
            }
          }
          break;
        }
        case 'ITEM_UPDATED': {
          const existing = itemsMap.get(event.itemId);
          if (existing) {
            existing.quantity = event.quantity;
          }
          break;
        }
      }
    }

    const items = Array.from(itemsMap.values());
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = Math.round(subtotal * this.taxRate);
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
   * Check if a session has been checked out
   */
  isCheckedOut(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session.checkedOut;
  }

  /**
   * Remove old sessions that haven't been accessed recently
   */
  private cleanupOldSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity;
      if (age > this.maxSessionAge) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Stop cleanup interval (for testing)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get session count (for testing)
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}
