import sdk from "stremio-addon-sdk";
import { createAddon } from "./addon.js";
const port = Number(process.env.PORT || 7000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
try {
  await sdk.serveHTTP(createAddon(), { port });
} catch (error) {
  console.error(`Could not start NguonC on port ${port}:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
