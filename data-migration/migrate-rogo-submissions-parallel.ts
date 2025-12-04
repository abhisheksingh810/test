console.log("📦 Loading parallel migration script...");

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import { build } from "esbuild";
import { db } from "../server/db";
import {
  assessments,
  malpracticeLevels,
  users,
} from "../shared/schema";
import { eq } from "drizzle-orm";

// Types
interface SubmissionFileRow {
  [key: string]: string;
}

interface AttemptMappingRow {
  "Attempt ID": string;
  "Unit Code": string;
  "Unit Code Version": string;
  "Assessment ID": string;
  Submission: string;
}

interface WorkerMessage {
  type: string;
  workerId?: number;
  [key: string]: any;
}

// Constants
const NUM_WORKERS = 5;
const PROGRESS_UPDATE_INTERVAL = 10000; // Progress updates every 10 seconds
const BATCH_WRITE_INTERVAL = 300000; // Write to CSV every 5 minutes

// Parse CSV line (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Write migrated rows to CSV
function writeMigratedRows(
  rows: Array<{
    "Attempt ID": string;
    "Launch ID": string;
    "Submission ID": string;
    "Session Record ID": string;
    "User ID": string;
    "LTI Context ID": string;
  }>,
  filePath: string,
  isFirstWrite: boolean
): void {
  if (rows.length === 0) return;

  const headers = [
    "Attempt ID",
    "Launch ID",
    "Submission ID",
    "Session Record ID",
    "User ID",
    "LTI Context ID",
  ];

  const csvContent = rows
    .map((row) =>
      [
        row["Attempt ID"],
        row["Launch ID"],
        row["Submission ID"],
        row["Session Record ID"],
        row["User ID"],
        row["LTI Context ID"],
      ].join(",")
    )
    .join("\n");

  if (isFirstWrite) {
    const headerRow = headers.join(",") + "\n";
    fs.writeFileSync(filePath, headerRow + csvContent, "utf-8");
    console.log(`✅ Wrote ${rows.length} rows to migrated.csv (initial write)`);
  } else {
    fs.appendFileSync(filePath, "\n" + csvContent, "utf-8");
    console.log(`✅ Appended ${rows.length} rows to migrated.csv`);
  }
}

// Write failed rows to CSV
function writeFailedRows(
  rows: Array<SubmissionFileRow & { Error: string }>,
  filePath: string,
  csvHeaders: string[],
  isFirstWrite: boolean
): void {
  if (rows.length === 0) return;

  const headers = [...csvHeaders, "Error"];

  const csvContent = rows
    .map((row) => {
      const values = headers.map((h) => {
        const value = row[h] || "";
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"') || value.includes("\n"))
        ) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      return values.join(",");
    })
    .join("\n");

  if (isFirstWrite) {
    const headerRow = headers.join(",") + "\n";
    fs.writeFileSync(filePath, headerRow + csvContent, "utf-8");
    console.log(
      `✅ Wrote ${rows.length} rows to submissions_failed_migration.csv (initial write)`
    );
  } else {
    fs.appendFileSync(filePath, "\n" + csvContent, "utf-8");
    console.log(
      `✅ Appended ${rows.length} rows to submissions_failed_migration.csv`
    );
  }
}

// Main parallel migration function
async function migrateRogoSubmissionsParallel() {
  console.log(
    "🚀 Starting parallel Rogo submissions migration with worker pool pattern...\n"
  );
  console.log(`⚙️  Configuration: ${NUM_WORKERS} worker threads\n`);

  // Get current directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = __dirname;
  const csvPath = path.join(dataDir, "submission_files.csv");
  const attemptMappingPath = path.join(dataDir, "attempt_number_mapping.csv");
  const migratedCsvPath = path.join(dataDir, "migrated.csv");
  const failedCsvPath = path.join(dataDir, "submissions_failed_migration.csv");
  const workerScriptPath = path.join(__dirname, "migration-worker.ts");
  const workerScriptPathJS = path.join(__dirname, "migration-worker.js");

  // Compile worker TypeScript to JavaScript using esbuild
  console.log("🔧 Compiling worker script...");
  try {
    await build({
      entryPoints: [workerScriptPath],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: workerScriptPathJS,
      external: [
        "dotenv",
        "mssql",
        "@azure/storage-blob",
        "drizzle-orm",
        "pg",
        "postgres",
      ],
      target: "node20",
      sourcemap: false,
    });
    console.log("✅ Worker script compiled successfully\n");
  } catch (error) {
    throw new Error(
      `Failed to compile worker script: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // Validate environment variable
  if (!process.env.DATA_WAREHOUSE_CONNECTION_STRING) {
    throw new Error(
      "DATA_WAREHOUSE_CONNECTION_STRING environment variable is required"
    );
  }

  // Load CSV files
  console.log("📂 Loading submission_files.csv...");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const csvLines = csvContent.split("\n").filter((line) => line.trim());
  if (csvLines.length === 0) {
    throw new Error("CSV file is empty");
  }

  const csvHeaders = parseCSVLine(csvLines[0]);
  const submissionRows: SubmissionFileRow[] = csvLines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: SubmissionFileRow = {};
    csvHeaders.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
  console.log(`✅ Loaded ${submissionRows.length} submission rows from CSV\n`);

  // Load attempt_number_mapping.csv
  console.log("📂 Loading attempt_number_mapping.csv...");
  if (!fs.existsSync(attemptMappingPath)) {
    throw new Error(`Attempt mapping file not found: ${attemptMappingPath}`);
  }
  const mappingContent = fs.readFileSync(attemptMappingPath, "utf-8");
  const mappingLines = mappingContent.split("\n").filter((line) => line.trim());
  const mappingHeaders = parseCSVLine(mappingLines[0]);
  const attemptNumberMapping = new Map<string, AttemptMappingRow>();
  for (let i = 1; i < mappingLines.length; i++) {
    const values = parseCSVLine(mappingLines[i]);
    const row: any = {};
    mappingHeaders.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    const attemptId = String(row["Attempt ID"]);
    if (attemptId) {
      attemptNumberMapping.set(attemptId, row as AttemptMappingRow);
    }
  }
  console.log(`✅ Loaded ${attemptNumberMapping.size} attempt mappings\n`);

  // Convert Map to array for worker data (Worker threads can't serialize Map)
  const attemptMappingArray: Array<[string, AttemptMappingRow]> = Array.from(
    attemptNumberMapping.entries()
  );

  // Load assessments from database
  console.log("📂 Loading assessments from database...");
  const allAssessments = await db
    .select({
      id: assessments.id,
      name: assessments.name,
      code: assessments.code,
    })
    .from(assessments);
  console.log(`✅ Loaded ${allAssessments.length} assessments from database\n`);

  // Load malpractice levels from database
  console.log("📂 Loading malpractice levels from database...");
  const allMalpracticeLevels = await db
    .select({
      id: malpracticeLevels.id,
      levelText: malpracticeLevels.levelText,
    })
    .from(malpracticeLevels)
    .where(eq(malpracticeLevels.isActive, "true"))
    .orderBy(malpracticeLevels.sortOrder);
  console.log(
    `✅ Loaded ${allMalpracticeLevels.length} malpractice levels from database\n`
  );

  // Get system user for migration
  console.log("📂 Finding system user for migration operations...");
  const systemUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (systemUsers.length === 0) {
    throw new Error(
      "No admin user found in database. Please ensure at least one admin user exists."
    );
  }
  const migrationUserId = systemUsers[0].id;
  console.log(`✅ Using system user ID: ${migrationUserId}\n`);

  // Work queue - process from end to start (most recent first)
  const workQueue: SubmissionFileRow[] = [...submissionRows];
  let nextWorkIndex = 0;

  // Tracking
  const migratedRows: Array<{
    "Attempt ID": string;
    "Launch ID": string;
    "Submission ID": string;
    "Session Record ID": string;
    "User ID": string;
    "LTI Context ID": string;
  }> = [];
  const failedRows: Array<SubmissionFileRow & { Error: string }> = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let isFirstMigratedWrite = !fs.existsSync(migratedCsvPath);
  let isFirstFailedWrite = !fs.existsSync(failedCsvPath);

  // Worker management
  const workers: Worker[] = [];
  const workerStats: Map<
    number,
    { processed: number; succeeded: number; failed: number }
  > = new Map();

  // Start time
  const startTime = Date.now();

  // Function to print progress summary
  function printProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalProcessed = successCount + failedCount + skippedCount;
    const remaining = submissionRows.length - totalProcessed;
    const rate = totalProcessed / parseFloat(elapsed);
    const estimatedRemaining = remaining / rate;

    console.log("\n" + "=".repeat(80));
    console.log("📊 Progress Update");
    console.log("=".repeat(80));
    console.log(
      `✅ Successful: ${successCount} | ❌ Failed: ${failedCount} | ⏭️  Skipped: ${skippedCount}`
    );
    console.log(
      `📝 Total Processed: ${totalProcessed}/${submissionRows.length} (${(
        (totalProcessed / submissionRows.length) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `⏱️  Elapsed: ${elapsed}s | Rate: ${rate.toFixed(
        2
      )} submissions/s | ETA: ${estimatedRemaining.toFixed(0)}s`
    );

    // Worker stats
    console.log("\n🔧 Worker Statistics:");
    workerStats.forEach((stats, workerId) => {
      console.log(
        `   Worker ${workerId}: ${stats.processed} processed (${stats.succeeded} ✅, ${stats.failed} ❌)`
      );
    });
    console.log("=".repeat(80) + "\n");
  }

  // Periodic progress updates (every 10 seconds)
  const progressInterval = setInterval(() => {
    printProgress();
  }, PROGRESS_UPDATE_INTERVAL);

  // Periodic CSV writer (every 5 minutes)
  const writeInterval = setInterval(() => {
    if (migratedRows.length > 0) {
      console.log(`💾 Writing batch to CSV files (${migratedRows.length} migrated, ${failedRows.length} failed)...`);
      writeMigratedRows(migratedRows, migratedCsvPath, isFirstMigratedWrite);
      migratedRows.length = 0;
      isFirstMigratedWrite = false;
    }
    if (failedRows.length > 0) {
      writeFailedRows(failedRows, failedCsvPath, csvHeaders, isFirstFailedWrite);
      failedRows.length = 0;
      isFirstFailedWrite = false;
    }
  }, BATCH_WRITE_INTERVAL);

  // Promise to track when all work is complete
  let resolveAllWorkComplete: () => void;
  const allWorkCompletePromise = new Promise<void>((resolve) => {
    resolveAllWorkComplete = resolve;
  });

  // Function to send work to a worker
  function sendWorkToWorker(worker: Worker, workerId: number): void {
    if (nextWorkIndex >= workQueue.length) {
      // No more work - check if all workers are idle
      return;
    }

    const csvRow = workQueue[nextWorkIndex];
    nextWorkIndex++;

    worker.postMessage({
      type: "WORK",
      csvRow,
    });
  }

  // Function to check if all work is complete
  function checkWorkComplete(): void {
    const totalProcessed = successCount + failedCount + skippedCount;
    if (totalProcessed >= submissionRows.length) {
      console.log("\n🎉 All work completed! Shutting down workers...");
      clearInterval(progressInterval);
      clearInterval(writeInterval);

      // Shutdown all workers
      workers.forEach((worker) => {
        worker.postMessage({ type: "SHUTDOWN" });
      });

      // Wait a bit for graceful shutdown, then terminate
      setTimeout(() => {
        workers.forEach((worker) => worker.terminate());
        resolveAllWorkComplete();
      }, 2000);
    }
  }

  // Create workers
  console.log(`🔧 Spawning ${NUM_WORKERS} worker threads...\n`);
  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(workerScriptPathJS, {
      workerData: {
        workerId: i,
        allAssessments,
        allMalpracticeLevels,
        migrationUserId,
        attemptNumberMapping: attemptMappingArray,
        csvHeaders,
      },
    });

    workerStats.set(i, { processed: 0, succeeded: 0, failed: 0 });

    worker.on("message", (message: WorkerMessage) => {
      const workerId = message.workerId ?? i;

      if (message.type === "WORK_REQUEST") {
        // Worker is ready for work
        sendWorkToWorker(worker, workerId);
      } else if (message.type === "WORK_RESULT") {
        // Worker completed a task
        const stats = workerStats.get(workerId)!;
        stats.processed++;

        if (message.success) {
          if (message.migratedRow) {
            migratedRows.push(message.migratedRow);
            stats.succeeded++;
            successCount++;
          } else {
            // Skipped (already migrated or filtered)
            skippedCount++;
          }
        } else {
          if (message.failedRow) {
            failedRows.push(message.failedRow);
          }
          stats.failed++;
          failedCount++;
        }

        // Check if all work is done
        checkWorkComplete();
      } else if (message.type === "PROGRESS") {
        // Progress update from worker (optional detailed logging)
        // Uncomment for verbose logging:
        // console.log(`[Worker ${workerId}] [${message.attemptId}] ${message.message}`);
      }
    });

    worker.on("error", (error) => {
      console.error(`\n❌ Worker ${i} error:`, error);
      // Don't kill the entire migration on worker error
      // The work will be picked up if we restart or can be retried
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`\n⚠️  Worker ${i} exited with code ${code}`);
      }
    });

    workers.push(worker);
  }

  console.log(`✅ All ${NUM_WORKERS} workers spawned and ready\n`);
  console.log("🚀 Starting migration...\n");

  // Wait for all work to complete
  await allWorkCompletePromise;

  // Clean up compiled worker file
  try {
    if (fs.existsSync(workerScriptPathJS)) {
      fs.unlinkSync(workerScriptPathJS);
      console.log("\n🗑️  Cleaned up compiled worker script");
    }
  } catch (error) {
    console.warn("⚠️  Could not clean up compiled worker script:", error);
  }

  // Write final batch
  console.log("\n📝 Writing final batch to output files...");
  if (migratedRows.length > 0) {
    writeMigratedRows(migratedRows, migratedCsvPath, isFirstMigratedWrite);
  }
  if (failedRows.length > 0) {
    writeFailedRows(failedRows, failedCsvPath, csvHeaders, isFirstFailedWrite);
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgRate = (successCount / parseFloat(totalTime)).toFixed(2);

  console.log("\n" + "=".repeat(80));
  console.log("🎉 Migration Complete!");
  console.log("=".repeat(80));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`📁 Total: ${submissionRows.length}`);
  console.log(`⏱️  Total Time: ${totalTime}s`);
  console.log(`⚡ Average Rate: ${avgRate} submissions/s`);
  console.log("\n🔧 Final Worker Statistics:");
  workerStats.forEach((stats, workerId) => {
    console.log(
      `   Worker ${workerId}: ${stats.processed} processed (${stats.succeeded} ✅, ${stats.failed} ❌)`
    );
  });
  console.log("=".repeat(80));
}

// Run migration
migrateRogoSubmissionsParallel()
  .then(() => {
    console.log("\n✅ Parallel migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Parallel migration failed:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  });

export { migrateRogoSubmissionsParallel };

