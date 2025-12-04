import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db";
import { log } from "./vite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

/**
 * Runs database migrations automatically at application startup
 */
export async function runMigrations(): Promise<void> {
  try {
    log("Running database migrations...");

    // Determine the migrations folder path
    // The migrations folder should be at the project root
    // Try multiple possible locations
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Possible locations for migrations folder
    const possiblePaths = [
      join(process.cwd(), "migrations"), // Current working directory (most common)
      join(__dirname, "../migrations"), // Relative to this file (works when bundled in dist/)
      join(__dirname, "../../migrations"), // Relative to this file (works in development from server/)
    ];

    // Find the first path that exists
    let migrationsFolder: string | undefined;
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        migrationsFolder = path;
        break;
      }
    }

    // Default to process.cwd() if nothing found
    if (!migrationsFolder) {
      migrationsFolder = join(process.cwd(), "migrations");
    }

    log(`Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    log("✓ Database migrations completed successfully");
  } catch (error) {
    log("✗ Database migration failed:");
    log(`  ${error instanceof Error ? error.message : String(error)}`);

    // In production, you might want to exit if migrations fail
    // In development, we'll continue to allow debugging
    if (process.env.NODE_ENV === "production") {
      log("Exiting due to migration failure in production");
      //   await pool.end();
      //   process.exit(1);
    } else {
      log("⚠ Continuing despite migration failure (development mode)");
    }
  }
}
