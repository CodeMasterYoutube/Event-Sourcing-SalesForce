/**
 * Express Application Setup
 */

import express, { Express } from "express";
import { CartService } from "./cart-service";
import { CartStateManager } from "./state-manager";
import { SalesforceCartClient } from "./salesforce-client";
import { createRouter } from "./routes";
import { Config, DEFAULT_CONFIG } from "./types";

export function createApp(config: Config = DEFAULT_CONFIG): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Initialize services
  const stateManager = new CartStateManager(config);
  const sfClient = new SalesforceCartClient(config);
  const cartService = new CartService(stateManager, sfClient);

  // Mount routes
  const router = createRouter(cartService);
  app.use("/api", router);

  // Root endpoint
  app.get("/", (_req, res) => {
    res.json({
      name: "Telecom Cart Experience API",
      version: "1.0.0",
      endpoints: {
        health: "GET /api/health",
        createSession: "POST /api/cart/sessions",
        getCart: "GET /api/cart/:sessionId",
        addItem: "POST /api/cart/:sessionId/items",
        removeItem: "DELETE /api/cart/:sessionId/items/:itemId",
        updateItem: "PATCH /api/cart/:sessionId/items/:itemId",
        checkout: "POST /api/cart/:sessionId/checkout",
      },
    });
  });

  return app;
}
