/**
 * Server Entry Point
 */

import { createApp } from "./app";
import { DEFAULT_CONFIG } from "./types";

const PORT = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : DEFAULT_CONFIG.PORT;

const app = createApp(DEFAULT_CONFIG);

app.listen(PORT, () => {
  console.log(` Telecom Cart API running on http://localhost:${PORT}`);
  console.log(` API documentation: http://localhost:${PORT}/`);
  console.log(`  Health check: http://localhost:${PORT}/api/health`);
});
