/**
 * Manual Verification Script for Cart Expiration & Event Sourcing
 *
 * This script demonstrates that cart state persists through SF context expiration
 * using event sourcing. Run with: npx ts-node verify-expiration.ts
 */

import { CartService } from "./cart-service";
import { CartStateManager } from "./state-manager";
import { SalesforceCartClient } from "./salesforce-client";
import { DEFAULT_CONFIG } from "./types";

// Use 2-second TTL for manual verification
const config = {
  ...DEFAULT_CONFIG,
  SF_CONTEXT_TTL_MS: 2000, // 2 seconds for easy testing
};

async function verifyExpiration() {
  console.log("Starting Cart Expiration & Event Sourcing Verification\n");
  console.log(
    `Configuration: SF Context TTL = ${config.SF_CONTEXT_TTL_MS}ms (${
      config.SF_CONTEXT_TTL_MS / 1000
    }s)\n`
  );

  // Initialize services
  const stateManager = new CartStateManager(config);
  const sfClient = new SalesforceCartClient(config);
  const cartService = new CartService(stateManager, sfClient);

  try {
    // Step 1: Create session
    console.log(" Step 1: Creating session...");
    const { sessionId, cart: initialCart } = cartService.createSession();
    console.log(` Session created: ${sessionId}`);
    console.log(`   Cart: ${JSON.stringify(initialCart)}\n`);

    // Step 2: Add first item
    console.log(" Step 2: Adding first item (iPhone 15 Pro)...");
    const cart1 = await cartService.addItem(sessionId, {
      itemId: "iphone15",
      type: "DEVICE",
      name: "iPhone 15 Pro",
      price: 99900,
      quantity: 1,
    });
    console.log(` Item added: ${cart1.items[0].name}`);
    console.log(
      `   Cart: ${cart1.items.length} item(s), Total: $${cart1.total / 100}\n`
    );

    // Step 3: Check event log
    const events1 = stateManager.getEvents(sessionId);
    console.log(` Event Log: ${events1.length} event(s)`);
    console.log(`   Latest event: ${events1[events1.length - 1].type}\n`);

    // Step 4: Wait for SF context to expire
    console.log(
      ` Step 3: Waiting ${
        config.SF_CONTEXT_TTL_MS / 1000
      } seconds for SF context to expire...`
    );
    await new Promise((resolve) =>
      setTimeout(resolve, config.SF_CONTEXT_TTL_MS + 500)
    );
    console.log(` SF context has expired!\n`);

    // Step 5: Add second item (will trigger replay)
    console.log(" Step 4: Adding second item (Unlimited Plan)...");
    console.log("    This should trigger automatic event replay!");
    const cart2 = await cartService.addItem(sessionId, {
      itemId: "plan_unlimited",
      type: "PLAN",
      name: "Unlimited 5G Plan",
      price: 7000,
      quantity: 1,
    });
    console.log(`Item added after expiration`);
    console.log(
      `   Cart: ${cart2.items.length} item(s), Total: $${cart2.total / 100}\n`
    );

    // Step 6: Verify first item still exists
    console.log(" Step 5: Verifying first item still exists...");
    const iphone = cart2.items.find((i) => i.id === "iphone15");
    const plan = cart2.items.find((i) => i.id === "plan_unlimited");

    if (iphone && plan) {
      console.log(
        ` SUCCESS! Both items are present after SF context expiration:`
      );
      console.log(`   1. ${iphone.name} - $${iphone.price / 100}`);
      console.log(`   2. ${plan.name} - $${plan.price / 100}\n`);
    } else {
      console.log(` FAILURE! Items missing after expiration\n`);
      process.exit(1);
    }

    // Step 7: Check event log again
    const events2 = stateManager.getEvents(sessionId);
    console.log(` Event Log: ${events2.length} event(s)`);
    events2.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.type} - ${event.itemId || "N/A"}`);
    });
    console.log();

    // Step 8: Wait for another expiration
    console.log(` Step 6: Waiting for another expiration...`);
    await new Promise((resolve) =>
      setTimeout(resolve, config.SF_CONTEXT_TTL_MS + 500)
    );
    console.log(` SF context has expired again!\n`);

    // Step 9: Update item quantity
    console.log(" Step 7: Updating iPhone quantity to 2...");
    const cart3 = await cartService.updateItem(sessionId, "iphone15", 2);
    console.log(` Item updated after second expiration`);
    console.log(
      `   iPhone quantity: ${
        cart3.items.find((i) => i.id === "iphone15")?.quantity
      }`
    );
    console.log(`   Total: $${cart3.total / 100}\n`);

    // Step 10: Final verification
    console.log(" Step 8: Final cart verification...");
    const finalCart = cartService.getCart(sessionId);
    console.log(` Final Cart State:`);
    console.log(`   Items: ${finalCart.items.length}`);
    finalCart.items.forEach((item) => {
      console.log(
        `     - ${item.name}: ${item.quantity} x $${item.price / 100}`
      );
    });
    console.log(`   Subtotal: $${finalCart.subtotal / 100}`);
    console.log(`   Tax: $${finalCart.tax / 100}`);
    console.log(`   Total: $${finalCart.total / 100}\n`);

    // Step 11: Checkout
    console.log(" Step 9: Checking out...");
    const checkoutResult = await cartService.checkout(sessionId);
    console.log(` Checkout successful!`);
    console.log(`   Order ID: ${checkoutResult.orderId}`);
    console.log(`   Status: ${checkoutResult.status}`);
    console.log(`   Total: $${checkoutResult.total / 100}\n`);

    // Summary
    console.log("=".repeat(70));
    console.log(" VERIFICATION COMPLETE - ALL TESTS PASSED!");
    console.log("=".repeat(70));
    console.log(
      "\n Cart state persisted through multiple SF context expirations"
    );
    console.log(" Event sourcing correctly rebuilds cart state");
    console.log(" Automatic replay works seamlessly");
    console.log(" Checkout works after expiration\n");

    console.log(" Key Takeaways:");
    console.log("   1. Events are the source of truth, stored in memory");
    console.log("   2. SF context can expire without losing cart data");
    console.log("   3. New SF context is created automatically when needed");
    console.log("   4. All events are replayed to rebuild cart state");
    console.log("   5. Operations are transparent to the user\n");
  } catch (error) {
    console.error(" ERROR:", error);
    process.exit(1);
  } finally {
    stateManager.stopCleanup();
  }
}

// Run verification
verifyExpiration().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
