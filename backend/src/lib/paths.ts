import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BACKEND_DIR = path.resolve(__dirname, "..", "..");
export const WORKSPACE_DIR = path.resolve(BACKEND_DIR, "..");
export const DATA_DIR = path.join(WORKSPACE_DIR, "data");
export const DB_PATH = path.join(DATA_DIR, "jobs.db");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const GENERATED_DIR = path.join(DATA_DIR, "generated");

export function ensureDataDirs(): void {
  [DATA_DIR, UPLOADS_DIR, GENERATED_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
