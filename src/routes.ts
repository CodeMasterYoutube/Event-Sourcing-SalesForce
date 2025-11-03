/**
 * Express Routes for Cart API
 */

import { Router, Request, Response } from 'express';
import { CartService } from './cart-service';
import {
  SessionNotFoundError,
  ItemNotFoundError,
  InvalidQuantityError,
  EmptyCartError,
  SessionCompletedError,
  AddItemRequest,
  RemoveItemRequest,
  UpdateItemRequest,
} from './types';

export function createRouter(cartService: CartService): Router {
  const router = Router();

  /**
   * Health check
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * Create a new cart session
   */
  router.post('/cart/sessions', (_req: Request, res: Response) => {
    try {
      const result = cartService.createSession();
      res.status(201).json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  /**
   * Get current cart state
   */
  router.get('/cart/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const cart = cartService.getCart(sessionId);
      res.json(cart);
    } catch (error) {
      handleError(error, res);
    }
  });

  /**
   * Add item to cart
   */
  router.post('/cart/:sessionId/items', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const itemRequest: AddItemRequest = req.body;
      
      const cart = await cartService.addItem(sessionId, itemRequest);
      res.json(cart);
    } catch (error) {
      handleError(error, res);
    }
  });

  /**
   * Remove item from cart
   */
  router.delete('/cart/:sessionId/items/:itemId', async (req: Request, res: Response) => {
    try {
      const { sessionId, itemId } = req.params;
      const { quantity }: RemoveItemRequest = req.body;
      
      const cart = await cartService.removeItem(sessionId, itemId, quantity);
      res.json(cart);
    } catch (error) {
      handleError(error, res);
    }
  });

  /**
   * Update item quantity
   */
  router.patch('/cart/:sessionId/items/:itemId', async (req: Request, res: Response) => {
    try {
      const { sessionId, itemId } = req.params;
      const { quantity }: UpdateItemRequest = req.body;
      
      if (quantity === undefined) {
        res.status(400).json({
          error: 'INVALID_REQUEST',
          message: 'Quantity is required',
        });
        return;
      }
      
      const cart = await cartService.updateItem(sessionId, itemId, quantity);
      res.json(cart);
    } catch (error) {
      handleError(error, res);
    }
  });

  /**
   * Checkout cart
   */
  router.post('/cart/:sessionId/checkout', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const result = await cartService.checkout(sessionId);
      res.json(result);
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}

/**
 * Centralized error handling
 */
function handleError(error: unknown, res: Response): void {
  if (error instanceof SessionNotFoundError) {
    res.status(404).json({
      error: 'SESSION_NOT_FOUND',
      message: error.message,
    });
  } else if (error instanceof ItemNotFoundError) {
    res.status(404).json({
      error: 'ITEM_NOT_FOUND',
      message: error.message,
    });
  } else if (error instanceof InvalidQuantityError) {
    res.status(400).json({
      error: 'INVALID_REQUEST',
      message: error.message,
    });
  } else if (error instanceof EmptyCartError) {
    res.status(400).json({
      error: 'EMPTY_CART',
      message: error.message,
    });
  } else if (error instanceof SessionCompletedError) {
    res.status(409).json({
      error: 'SESSION_COMPLETED',
      message: error.message,
    });
  } else {
    console.error('Unexpected error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
}
