import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

/**
 * Loads the repo-root .env for the standalone server and CLI scripts. Import this first.
 * (When the tools run inside the Next.js app, Next/Vercel provide the environment instead.)
 */
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env"), quiet: true });
