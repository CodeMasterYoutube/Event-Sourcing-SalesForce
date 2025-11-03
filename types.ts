/**
 * Core type definitions for the Telecom Cart Experience API
 */

export type ItemType = 'DEVICE' | 'PLAN' | 'ADDON';

export interface CartItem {
  id: string;
  type: ItemType;
  name: string;
  price: number;        // In cents
  quantity: number;
}

export interface Cart {
  sessionId: string;
  items: CartItem[];
  subtotal: number;     // In cents
  tax: number;          // In cents
  total: number;        // In cents
}

export interface CheckoutResult extends Cart {
  orderId: string;
  status: 'COMPLETED';
}

/**
 * Cart events for event sourcing
 */
export type CartEvent =
  | { type: 'ITEM_ADDED'; itemId: string; itemType: ItemType; name: string; price: number; quantity: number; timestamp: number }
  | { type: 'ITEM_REMOVED'; itemId: string; quantity: number; timestamp: number }
  | { type: 'ITEM_UPDATED'; itemId: string; quantity: number; timestamp: number };

/**
 * Experience session that maps to Salesforce cart context
 */
export interface ExperienceSession {
  sessionId: string;
  sfContextId: string | null;
  lastActivity: number;
  events: CartEvent[];
  checkedOut: boolean;
}

/**
 * Salesforce cart context
 */
export interface SalesforceCartContext {
  contextId: string;
  items: Map<string, CartItem>;
  createdAt: number;
  lastActivity: number;
}

/**
 * Request/Response DTOs
 */
export interface AddItemRequest {
  itemId: string;
  type: ItemType;
  name: string;
  price: number;
  quantity: number;
}

export interface RemoveItemRequest {
  quantity?: number;
}

export interface UpdateItemRequest {
  quantity: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  cart: Cart;
}

/**
 * Custom errors
 */
export class ContextExpiredError extends Error {
  constructor(contextId: string) {
    super(`Salesforce context ${contextId} has expired`);
    this.name = 'ContextExpiredError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class ItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} not found in cart`);
    this.name = 'ItemNotFoundError';
  }
}

export class InvalidQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuantityError';
  }
}

export class EmptyCartError extends Error {
  constructor() {
    super('Cannot checkout an empty cart');
    this.name = 'EmptyCartError';
  }
}

export class SessionCompletedError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} has already been checked out`);
    this.name = 'SessionCompletedError';
  }
}

/**
 * Configuration
 */
export interface Config {
  SF_CONTEXT_TTL_MS: number;        // 5 minutes
  SESSION_CLEANUP_INTERVAL_MS: number; // 1 hour
  MAX_SESSION_AGE_MS: number;       // 24 hours
  TAX_RATE: number;                 // 0.10 (10%)
  PORT: number;
}

export const DEFAULT_CONFIG: Config = {
  SF_CONTEXT_TTL_MS: 5 * 60 * 1000,        // 5 minutes
  SESSION_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  MAX_SESSION_AGE_MS: 24 * 60 * 60 * 1000,     // 24 hours
  TAX_RATE: 0.10,
  PORT: 3000,
};
