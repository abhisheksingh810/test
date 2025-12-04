console.log("📦 Loading migration script...");

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import mssql from "mssql";
import { db } from "../server/db";
import {
  getAzureBlobService,
  initializeAzureBlobService,
} from "../server/services/azureBlobService";
import {
  assessments,
  assessmentSections,
  ltiLaunchSessions,
  ltiSessionRecords,
  assignmentSubmissions,
  submissionFiles as submissionFilesTable,
  submissionMarkingAssignments,
  submissionSectionMarks,
  submissionGrades,
  malpracticeLevels,
  malpracticeEnforcements,
  users,
} from "../shared/schema";
import { eq, and, gt, sql, like } from "drizzle-orm";
import type {
  InsertLtiLaunchSession,
  InsertLtiSessionRecord,
  InsertAssignmentSubmission,
  InsertSubmissionFile,
  InsertSubmissionMarkingAssignment,
  InsertSubmissionSectionMark,
  InsertSubmissionGrade,
  InsertMalpracticeEnforcement,
} from "../shared/schema";

// Helper function to get content type based on file extension
function getContentType(fileExtension: string): string {
  const contentTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
  };
  return (
    contentTypes[fileExtension?.toLowerCase()] || "application/octet-stream"
  );
}

// Format file size in MB
function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

// Generate launch ID with Attempt ID prefix
function generateLaunchId(attemptId: string): string {
  return `rogo_${attemptId}_${Date.now().toString()}${Math.random()
    .toString(36)
    .substr(2, 9)}`;
}

// Parse context ID to extract parts
function parseContextId(contextId: string): { guid: string; suffix: string } {
  const parts = contextId.split("::");
  if (parts.length !== 2) {
    throw new Error(`Invalid context_id format: ${contextId}`);
  }
  return {
    guid: parts[0],
    suffix: parts[1],
  };
}

// Constants
const LMS_INSTANCE_ID = "79755547-2e38-493d-8b22-75d268777b4a";
const TOOL_CONSUMER_INSTANCE_GUID = "79755547-2e38-493d-8b22-75d268777b4a";

// Grade mapping function based on assessment code prefix
function mapGrade(grade: string, assessmentCode: string): string {
  const trimmedGrade = grade.trim();

  // Fail if grade is "Grade Missed"
  if (trimmedGrade === "Grade Missed") {
    throw new Error(`Grade is "Grade Missed" - cannot process`);
  }

  // Check if assessment code starts with 3, 4, or 5
  const firstChar = assessmentCode.charAt(0);
  if (["3", "4", "5"].includes(firstChar)) {
    // For codes starting with 3, 4, or 5
    if (
      trimmedGrade === "Refer/Fail" ||
      trimmedGrade === "Refer" ||
      trimmedGrade === "Fail"
    ) {
      return "Refer";
    }
    if (trimmedGrade === "Low Pass") {
      return "Low Pass";
    }
    if (trimmedGrade === "Pass") {
      return "Pass";
    }
    if (trimmedGrade === "High Pass") {
      return "High Pass";
    }
    // Return as-is if no mapping needed
    return trimmedGrade;
  }

  // Check if assessment code starts with 7 (Level 7)
  if (firstChar === "7") {
    // For Level 7 assessments
    if (
      trimmedGrade === "Refer/Fail" ||
      trimmedGrade === "Refer" ||
      trimmedGrade === "Fail"
    ) {
      return "Refer";
    }
    if (trimmedGrade === "Pass") {
      return "Low Pass";
    }
    if (trimmedGrade === "Merit") {
      return "Pass";
    }
    if (trimmedGrade === "Distinction") {
      return "High Pass";
    }
    // Return as-is if no mapping needed
    return trimmedGrade;
  }

  // For other assessment codes, return as-is
  return trimmedGrade;
}

// Construct context ID from TI Section ID
// Format: ti instance id::TISectionId
// NOTE: This function should only be called if tiSectionId is not null (validated before)
function constructContextId(tiSectionId: string): string {
  return tiSectionId; // Already prefixed
}

// Parse SQL Server datetime to JavaScript Date
// SQL Server returns datetime columns as Date objects, but we handle both Date and string
// Convert to PostgreSQL-compatible timestamp
function parseDate(dateValue: Date | string | null | undefined): Date {
  if (!dateValue) {
    throw new Error("Date value is null or undefined");
  }
  // If it's already a Date object, return it
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) {
      throw new Error(`Invalid Date object`);
    }
    return dateValue;
  }
  // If it's a string, parse it
  // SQL Server datetime format: YYYY-MM-DD HH:mm:ss.SSS
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateValue}`);
  }
  return date;
}

// Extract file extension from filename
function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

// Simple CSV parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim()); // Add last field
  return result;
}

// Download file from URL
async function downloadFileFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download file: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Parse comma-separated values from CSV
function parseCommaSeparated(value: string): string[] {
  if (!value || value.trim() === "") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// Types for data structures
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

interface WarehouseAssessmentReport {
  AttemptId: number | string;
  TIUserId: string | null;
  TISectionId: string | null;
  Exercise: string;
  MarksAchieved?: number;
  MarksAwarded?: number;
  MarksAvailable: number;
  GradePercent: number;
  MarkerNotes: string | null;
  ResultsApproved: Date | string | null;
  DateInserted: Date | string;
  DateModified: Date | string | null;
  Grade?: string; // Add Grade field to interface
  [key: string]: any; // Allow additional columns
}

interface WarehouseScore {
  AttemptId: number | string;
  ScoreLabelCorrected: string;
  Score: number;
  MarkerComment: string | null;
  DateInserted: Date | string;
  DateModified: Date | string | null;
  [key: string]: any; // Allow additional columns
}

// Helper function to write migrated rows to CSV
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

  const migratedHeaders = [
    "Attempt ID",
    "Launch ID",
    "Submission ID",
    "Session Record ID",
    "User ID",
    "LTI Context ID",
  ];

  const migratedCsv = rows
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
    // Write header and data
    const headerRow = migratedHeaders.join(",") + "\n";
    fs.writeFileSync(filePath, headerRow + migratedCsv, "utf-8");
    console.log(`✅ Wrote ${rows.length} rows to migrated.csv (initial write)`);
  } else {
    // Append data only
    fs.appendFileSync(filePath, "\n" + migratedCsv, "utf-8");
    console.log(`✅ Appended ${rows.length} rows to migrated.csv`);
  }
}

// Helper function to write failed rows to CSV
function writeFailedRows(
  rows: Array<SubmissionFileRow & { Error: string }>,
  filePath: string,
  csvHeaders: string[],
  isFirstWrite: boolean
): void {
  if (rows.length === 0) return;

  const headers = [...csvHeaders, "Error"];

  const failedRowsCsv = rows
    .map((row) => {
      const values = headers.map((h) => {
        const value = row[h] || "";
        // Escape commas and quotes in CSV
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
    // Write header and data
    const headerRow = headers.join(",") + "\n";
    fs.writeFileSync(filePath, headerRow + failedRowsCsv, "utf-8");
    console.log(
      `✅ Wrote ${rows.length} rows to submissions_failed_migration.csv (initial write)`
    );
  } else {
    // Append data only
    fs.appendFileSync(filePath, "\n" + failedRowsCsv, "utf-8");
    console.log(
      `✅ Appended ${rows.length} rows to submissions_failed_migration.csv`
    );
  }
}

// Main migration function
async function migrateRogoSubmissions() {
  console.log(
    "🚀 Starting full Rogo submissions migration with marking data...\n"
  );

  // Get current directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = __dirname;
  const csvPath = path.join(dataDir, "submission_files.csv");
  const attemptMappingPath = path.join(dataDir, "attempt_number_mapping.csv");
  const migratedCsvPath = path.join(dataDir, "migrated.csv");
  const failedCsvPath = path.join(dataDir, "submissions_failed_migration.csv");

  // Validate environment variable
  console.log("DATA_WAREHOUSE_CONNECTION_STRING", process.env.DATA_WAREHOUSE_CONNECTION_STRING);
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

  // Load assessments from database (all assessments, not just active)
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

  // Get a system/admin user ID for migration operations (required for malpractice enforcement)
  console.log("📂 Finding system user for migration operations...");
  const systemUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (systemUsers.length === 0) {
    throw new Error(
      "No admin user found in database. Please ensure at least one admin user exists for migration operations."
    );
  }
  const migrationUserId = systemUsers[0].id;
  console.log(`✅ Using system user ID: ${migrationUserId}\n`);

  // Note: We no longer load migrated.csv for duplicate checking
  // Instead, we check the database directly for existing migrations
  // The CSV file is still written for tracking purposes

  // Initialize Azure SQL Server Data Warehouse connection pool with retry logic
  console.log("📂 Connecting to Data Warehouse (Azure SQL Server)...");
  let warehouseDb: mssql.ConnectionPool | null = null;

  // Retry connection logic for ~30k submissions
  const maxRetries = 5;
  const retryDelay = 2000; // 2 seconds
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Create connection pool for Azure SQL Server
      // mssql ConnectionPool can accept a connection string directly
      warehouseDb = new mssql.ConnectionPool(process.env.DATA_WAREHOUSE_CONNECTION_STRING!);
      
      // Configure connection pool options for Azure SQL Server
      warehouseDb.config.options = {
        ...warehouseDb.config.options,
        encrypt: true, // Required for Azure SQL Server
        trustServerCertificate: false, // Use proper SSL for Azure
        enableArithAbort: true,
        requestTimeout: 30000, // 30 seconds
      };
      
      // Connect to the database
      await warehouseDb.connect();

      // Test connection
      const testResult = await warehouseDb.request().query("SELECT 1 as test");
      if (testResult && testResult.recordset && testResult.recordset.length > 0) {
        console.log("✅ Connected to Data Warehouse (Azure SQL Server)\n");
        break;
      }
    } catch (error) {
      // Close the connection if it was partially created
      if (warehouseDb && warehouseDb.connected) {
        try {
          await warehouseDb.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }
      warehouseDb = null;
      
      retryCount++;
      if (retryCount >= maxRetries) {
        throw new Error(
          `Failed to connect to Data Warehouse after ${maxRetries} attempts: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      console.log(
        `  ⚠️  Connection attempt ${retryCount} failed, retrying in ${retryDelay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  // Initialize Azure Blob Service
  console.log("📂 Initializing Azure Blob Service...");
  await initializeAzureBlobService();
  const azureService = getAzureBlobService();
  console.log("✅ Azure Blob Service initialized\n");

  // Prepare CSV writers
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
  let processedCount = 0; // Track total processed attempts (including skipped)
  const BATCH_SIZE = 500; // Write to CSV every 500 attempts
  let isFirstMigratedWrite = !fs.existsSync(migratedCsvPath);
  let isFirstFailedWrite = !fs.existsSync(failedCsvPath);

  // Process each submission row
  for (let i = submissionRows.length - 1; i >= 0; i--) {
    const csvRow = submissionRows[i];
    const attemptId = String(csvRow["Attempt ID"] || "");

    if (!attemptId) {
      console.log(
        `\n[${i + 1}/${
          submissionRows.length
        }] ⚠️  Skipping row with no Attempt ID`
      );
      continue;
    }

    console.log(
      `\n[${i + 1}/${
        submissionRows.length
      }] Processing submission ${attemptId}...`
    );

    // Track uploaded files for cleanup on failure
    let uploadedBlobNames: string[] = [];

    try {
      // Check if already migrated by querying the database
      // Look for lti_launch_id starting with "rogo_{attemptId}_"
      const launchIdPattern = `rogo_${attemptId}_%`;
      const existingSubmission = await db
        .select({ id: assignmentSubmissions.id, ltiLaunchId: assignmentSubmissions.ltiLaunchId })
        .from(assignmentSubmissions)
        .where(like(assignmentSubmissions.ltiLaunchId, launchIdPattern))
        .limit(1);

      if (existingSubmission.length > 0) {
        console.log(
          `  ⏭️  Already migrated (found existing submission with lti_launch_id: ${existingSubmission[0].ltiLaunchId}), skipping...`
        );
        continue;
      }

      // Get mapping row first to check Unit Code Version before querying warehouse (fail fast)
      const mappingRow = attemptNumberMapping.get(attemptId);
      if (!mappingRow) {
        throw new Error(
          `Missing attempt_number_mapping entry for Attempt ID: ${attemptId}`
        );
      }

      // Validate Unit Code Version and fail fast if it doesn't start with 24 or 25
      const casSuffix = (mappingRow["Unit Code Version"] || "").trim();
      if (!casSuffix) {
        throw new Error(
          `Missing or empty Unit Code Version for Attempt ID: ${attemptId}`
        );
      }

      // Filter: Only migrate submissions where Unit Code Version starts with '24' or '25'
      if (!casSuffix.startsWith("24") && !casSuffix.startsWith("25")) {
        console.log(
          `  ⏭️  Skipping submission - Unit Code Version "${casSuffix}" does not start with '24' or '25'`
        );
        continue; // Skip this submission without querying warehouse
      }

      // Get submission text from mapping (needed later for attempt number extraction)
      const submissionText = (mappingRow["Submission"] || "").trim();
      if (!submissionText) {
        throw new Error(
          `Missing or empty Submission field for Attempt ID: ${attemptId}`
        );
      }

      // Step 1: Query Data Warehouse (only if Unit Code Version passes filter)
      console.log(
        `  🔍 Querying Data Warehouse for Attempt ID: ${attemptId}...`
      );

      const reportResult = await warehouseDb!.request()
        .input("attemptId", mssql.Int, parseInt(attemptId))
        .query("SELECT * FROM [dbo].[Rogo_AssessmentReport] WHERE AttemptId = @attemptId");

      const reportRows = reportResult.recordset as WarehouseAssessmentReport[];

      if (!reportRows || reportRows.length === 0) {
        throw new Error(
          `Missing Rogo_AssessmentReport row for Attempt ID: ${attemptId}`
        );
      }

      const assessmentReport = reportRows[0];

      // Validate required fields from warehouse BEFORE any transformations
      if (
        !assessmentReport.Exercise ||
        assessmentReport.Exercise.trim() === ""
      ) {
        throw new Error(
          `Missing or empty Exercise field for Attempt ID: ${attemptId}`
        );
      }
      if (
        !assessmentReport.TIUserId ||
        assessmentReport.TIUserId.trim() === ""
      ) {
        throw new Error(
          `Missing or empty TIUserId field for Attempt ID: ${attemptId}`
        );
      }
      if (
        !assessmentReport.TISectionId ||
        assessmentReport.TISectionId.trim() === ""
      ) {
        throw new Error(
          `Missing or empty TISectionId field for Attempt ID: ${attemptId}`
        );
      }
      if (
        assessmentReport.MarksAchieved === null &&
        assessmentReport.MarksAwarded === null
      ) {
        throw new Error(
          `Missing MarksAchieved/MarksAwarded field for Attempt ID: ${attemptId}`
        );
      }
      if (
        assessmentReport.MarksAvailable === null ||
        assessmentReport.MarksAvailable === undefined
      ) {
        throw new Error(
          `Missing MarksAvailable field for Attempt ID: ${attemptId}`
        );
      }
      if (
        assessmentReport.GradePercent === null ||
        assessmentReport.GradePercent === undefined
      ) {
        throw new Error(
          `Missing GradePercent field for Attempt ID: ${attemptId}`
        );
      }
      if (!assessmentReport.DateInserted) {
        throw new Error(
          `Missing DateInserted field for Attempt ID: ${attemptId}`
        );
      }
      // Validate DateInserted is a valid Date or string
      if (assessmentReport.DateInserted instanceof Date && isNaN(assessmentReport.DateInserted.getTime())) {
        throw new Error(
          `Invalid DateInserted Date object for Attempt ID: ${attemptId}`
        );
      }
      if (typeof assessmentReport.DateInserted === 'string' && assessmentReport.DateInserted.trim() === "") {
        throw new Error(
          `Empty DateInserted string for Attempt ID: ${attemptId}`
        );
      }
      if (!assessmentReport.Grade || (typeof assessmentReport.Grade === 'string' && assessmentReport.Grade.trim() === "")) {
        throw new Error(`Missing Grade field for Attempt ID: ${attemptId}`);
      }

      console.log(`  ✅ Found assessment report: ${assessmentReport.Exercise}`);

      // Query scores
      const scoreResult = await warehouseDb!.request()
        .input("attemptId", mssql.Int, parseInt(attemptId))
        .query("SELECT * FROM [dbo].[Rogo_AssessmentReportScores] WHERE AttemptId = @attemptId");

      const assessmentScores = (scoreResult.recordset as WarehouseScore[]) || [];
      console.log(`  ✅ Found ${assessmentScores.length} score record(s)`);

      // Validate scores have required fields
      for (const score of assessmentScores) {
        if (
          !score.ScoreLabelCorrected ||
          score.ScoreLabelCorrected.trim() === ""
        ) {
          throw new Error(
            `Missing ScoreLabelCorrected in score record for Attempt ID: ${attemptId}`
          );
        }
        if (score.Score === null || score.Score === undefined) {
          throw new Error(
            `Missing Score in score record for Attempt ID: ${attemptId}`
          );
        }
      }

      // Step 2: Determine Assessment Code
      const exercise = assessmentReport.Exercise.trim();
      const casParts = exercise.split(" ");
      if (casParts.length < 2) {
        throw new Error(`Invalid Exercise format: ${exercise}`);
      }
      const casPrefix = `${casParts[0]} ${casParts[1]}`;
      console.log(`  🔍 Looking for assessment with prefix: "${casPrefix}"`);

      // Validate required CSV fields
      const csvFirstName = (csvRow["First Name"] || "").trim();
      const csvSurname = (csvRow["Surname"] || "").trim();
      const csvEmail = (csvRow["Learner Email"] || "").trim();
      if (!csvEmail) {
        throw new Error(
          `Missing or empty Learner Email for Attempt ID: ${attemptId}`
        );
      }

      console.log(`  🔍 Looking for assessment with suffix: "${casSuffix}"`);

      // Find matching assessment (use first match if multiple)
      const matchingAssessments = allAssessments.filter(
        (a) =>
          a.name.trim().startsWith(casPrefix) &&
          a.name.trim().endsWith(casSuffix)
      );

      if (matchingAssessments.length === 0) {
        throw new Error(
          `No assessment found matching prefix "${casPrefix}" and suffix "${casSuffix}"`
        );
      }

      // Use first matching assessment
      const matchingAssessment = matchingAssessments[0];
      if (matchingAssessments.length > 1) {
        console.log(
          `  ⚠️  Multiple assessments matched, using first: ${matchingAssessment.name}`
        );
      }

      const customAssessmentCode = matchingAssessment.code;
      console.log(
        `  ✅ Found assessment: ${matchingAssessment.name} (code: ${customAssessmentCode})`
      );

      // Extract attempt number
      const attemptNumberMatch = submissionText.match(/Attempt\s+(\d+)/i);
      const attemptNumber = attemptNumberMatch
        ? parseInt(attemptNumberMatch[1])
        : null;
      if (attemptNumber === null) {
        throw new Error(
          `Unable to extract attempt number from Submission: ${submissionText}`
        );
      }
      console.log(`  ✅ Attempt number: ${attemptNumber}`);

      // Process TI IDs - prefix with LMS instance ID (already validated as non-null above)
      // userId/lmsUserId = ti instance id::TIUserId
      const tiUserId = `${LMS_INSTANCE_ID}::${assessmentReport.TIUserId.trim()}`;

      // contextId = ti instance id::TISectionId
      const tiSectionId = `${LMS_INSTANCE_ID}::${assessmentReport.TISectionId.trim()}`;

      // Use prefixed TIUserId as userId and lmsUserId
      const userId = tiUserId;
      const lmsUserId = tiUserId;

      // contextId = ti instance id::TISectionId
      const contextId = constructContextId(tiSectionId);
      const { suffix: contextIdSuffix } = parseContextId(contextId);

      // Use constant for toolConsumerInstanceGuid
      const toolConsumerInstanceGuid = TOOL_CONSUMER_INSTANCE_GUID;

      // Step 3: Process Files
      console.log(`  📥 Processing files...`);

      const learnerFileUrls = parseCommaSeparated(
        csvRow["Learner Azure Blob URLs"] || ""
      );
      const learnerFileNames = parseCommaSeparated(
        csvRow["Learner File Names"] || ""
      );
      const markerFileUrls = parseCommaSeparated(
        csvRow["Marker Azure Blob URLs"] || ""
      );
      // Note: We no longer use Marker File Names from CSV
      // Marker files are always named: {Assessment ID}_{First Name}-{Last Name}_feedback.docx

      const uploadedFiles: Array<{
        fileName: string;
        originalFileName: string;
        fileSize: string;
        fileType: string;
        fileMimeType: string;
        fileUrl: string;
        azureBlobUrl: string;
        azureBlobName: string;
        uploadOrder: number;
        submissionFileType: "submission" | "feedback";
        uploadedBy: string | null;
      }> = [];

      let uploadOrder = 1;
      let totalFileSizeBytes = 0;
      uploadedBlobNames = []; // Reset for this submission

      // Process learner files
      for (let j = 0; j < learnerFileUrls.length; j++) {
        const fileUrl = learnerFileUrls[j];
        const fileName = learnerFileNames[j] || `learner_file_${j + 1}`;

        if (
          !fileUrl.startsWith("https://rogoreplacement.blob.core.windows.net")
        ) {
          console.log(`    ⚠️  Skipping non-rogoreplacement URL: ${fileUrl}`);
          continue;
        }

        console.log(
          `    [${uploadOrder}] Downloading learner file: ${fileName}`
        );
        try {
          const fileBuffer = await downloadFileFromUrl(fileUrl);
          totalFileSizeBytes += fileBuffer.length;

          const fileExtension = getFileExtension(fileName);
          const fileMimeType = getContentType(fileExtension);

          const uploadResult = await azureService.uploadFile({
            fileName,
            fileBuffer,
            contentType: fileMimeType,
            metadata: {
              attemptId: attemptId,
              migratedFrom: "rogo_warehouse",
            },
            folder: "LTI_Uploads",
          });

          uploadedFiles.push({
            fileName,
            originalFileName: fileName,
            fileSize: formatFileSize(fileBuffer.length),
            fileType: fileExtension,
            fileMimeType,
            fileUrl: uploadResult.url,
            azureBlobUrl: uploadResult.url,
            azureBlobName: uploadResult.blobName,
            uploadOrder: uploadOrder++,
            submissionFileType: "submission",
            uploadedBy:
              csvRow["Rogo User ID"] || csvRow["Learner Email"] || null,
          });

          uploadedBlobNames.push(uploadResult.blobName);
          console.log(`    ✅ Uploaded: ${uploadResult.blobName}`);
        } catch (error) {
          // Clean up any already uploaded files
          for (const blobName of uploadedBlobNames) {
            try {
              await azureService.deleteFile(blobName);
              console.log(`    🗑️  Cleaned up file: ${blobName}`);
            } catch (cleanupError) {
              console.error(
                `    ⚠️  Failed to cleanup file ${blobName}:`,
                cleanupError
              );
            }
          }
          throw new Error(
            `File download/upload failed for ${fileName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Process marker files
      // Get Assessment ID from CSV for proper file naming
      const assessmentId = (csvRow["Assessment ID"] || customAssessmentCode || "").trim();
      if (!assessmentId) {
        console.log(`    ⚠️  Warning: No Assessment ID found, using assessment code: ${customAssessmentCode}`);
      }
      
      // Generate clean names for marker feedback files
      // Format: {Assessment ID}_{First Name}-{Last Name}_feedback.docx
      // If multiple files, add numeric suffix: _1.docx, _2.docx, etc.
      const sanitizeFileName = (name: string): string => {
        // Remove special characters and spaces, replace with underscores
        return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\s+/g, '_');
      };
      
      const baseMarkerFileName = assessmentId 
        ? `${assessmentId}_${sanitizeFileName(csvFirstName)}-${sanitizeFileName(csvSurname)}_feedback`
        : `feedback_${attemptId}`;

      for (let j = 0; j < markerFileUrls.length; j++) {
        const fileUrl = markerFileUrls[j];

        if (
          !fileUrl.startsWith("https://rogoreplacement.blob.core.windows.net")
        ) {
          console.log(`    ⚠️  Skipping non-rogoreplacement URL: ${fileUrl}`);
          continue;
        }

        // Always use .docx extension for marker feedback files
        const fileExtension = "docx";
        
        // Generate filename with proper format: {Assessment ID}_{First Name}-{Last Name}_feedback.docx
        // Add numeric suffix if multiple files (1-based index)
        const markerFileName = markerFileUrls.length > 1
          ? `${baseMarkerFileName}_${j + 1}.${fileExtension}`
          : `${baseMarkerFileName}.${fileExtension}`;

        console.log(
          `    [${uploadOrder}] Downloading marker file: ${markerFileName}`
        );
        try {
          const fileBuffer = await downloadFileFromUrl(fileUrl);
          totalFileSizeBytes += fileBuffer.length;

          const fileMimeType = getContentType(fileExtension);

          const uploadResult = await azureService.uploadFile({
            fileName: markerFileName, // Use the new formatted filename
            fileBuffer,
            contentType: fileMimeType,
            metadata: {
              attemptId: attemptId,
              migratedFrom: "rogo_warehouse",
              fileType: "marker_feedback",
            },
            folder: "Marker_files",
          });

          uploadedFiles.push({
            fileName: markerFileName, // Always use the formatted filename
            originalFileName: markerFileName, // Same as fileName since we generate it
            fileSize: formatFileSize(fileBuffer.length),
            fileType: fileExtension,
            fileMimeType,
            fileUrl: uploadResult.url,
            azureBlobUrl: uploadResult.url,
            azureBlobName: uploadResult.blobName,
            uploadOrder: uploadOrder++,
            submissionFileType: "feedback",
            uploadedBy: null, // Marker ID not available
          });

          uploadedBlobNames.push(uploadResult.blobName);
          console.log(`    ✅ Uploaded: ${uploadResult.blobName}`);
        } catch (error) {
          // Clean up any already uploaded files
          for (const blobName of uploadedBlobNames) {
            try {
              await azureService.deleteFile(blobName);
              console.log(`    🗑️  Cleaned up file: ${blobName}`);
            } catch (cleanupError) {
              console.error(
                `    ⚠️  Failed to cleanup file ${blobName}:`,
                cleanupError
              );
            }
          }
          throw new Error(
            `File download/upload failed for ${markerFileName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      const totalFileSize = formatFileSize(totalFileSizeBytes);
      console.log(
        `  ✅ Total file size: ${totalFileSize} (${uploadedFiles.length} files)`
      );

      // Step 4: Create Database Records (Single Transaction)
      console.log(`  💾 Creating database records...`);

      // Generate launch ID with Attempt ID prefix
      const launchId = generateLaunchId(attemptId);
      const returnUrl = `https://hub.avadolearning.com/learn/lti/consumer/return/${contextIdSuffix}`;
      // Parse dates (already validated as non-null above)
      const submittedAt = parseDate(
        assessmentReport.ResultsApproved || assessmentReport.DateInserted
      );
      const createdAt = parseDate(assessmentReport.DateInserted);
      const updatedAt = parseDate(
        assessmentReport.DateModified || assessmentReport.DateInserted
      );
      const expiresAt = new Date("2099-12-31"); // Far future for historical records

      const firstName = csvFirstName;
      const surname = csvSurname;
      const fullName =
        `${firstName} ${surname}`.trim() ||
        (csvRow["Rogo User Name"] || "").trim();
      const email = csvEmail;
      const courseTitle =
        (csvRow["Course Title"] || "").trim() || assessmentReport.Exercise;

      await db.transaction(async (tx) => {
        // 1. Create lti_launch_sessions
        const ltiLaunchSession: InsertLtiLaunchSession = {
          launchId,
          consumerKey: "MggwgSmGeNMNnsZmZKUP+Q==",
          userId: userId, // Use prefixed TIUserId
          userEmail: email,
          userName: fullName,
          courseName: assessmentReport.Exercise,
          returnUrl,
          resourceLinkId: null,
          contextId,
          toolConsumerInstanceGuid,
          customParams: JSON.stringify({
            cis: "AIS",
            cas: customAssessmentCode,
          }),
          ltiMessageType: "basic-lti-launch-request",
          contextType: "CourseSection",
          contextTitle: courseTitle,
          roles: "Learner",
          lisPersonNameGiven: firstName,
          lisPersonNameFamily: surname,
          lisPersonNameFull: fullName,
          lisPersonContactEmailPrimary: email,
          toolConsumerInstanceName: "Avado Learning",
          customAction: "exercise_attempt",
          assignmentTitle: "Submission Area",
          customInstructionSet: "AIS",
          customAssessmentCode: customAssessmentCode,
          expiresAt,
        };
        await tx.insert(ltiLaunchSessions).values(ltiLaunchSession);

        // 2. Create lti_session_records
        const ltiSessionRecord: InsertLtiSessionRecord = {
          launchId,
          lmsUserId,
          consumerName: "Avado Learning",
          role: "Learner",
          firstName,
          lastName: surname,
          fullName,
          email,
          customAction: "exercise_attempt",
          customInstructionSet: "AIS",
          customAssessmentCode: customAssessmentCode,
          contextType: "CourseSection",
          contextTitle: courseTitle,
          resourceLinkId: null,
          resourceLinkTitle: courseTitle,
          contextId,
          consumerKey: "MggwgSmGeNMNnsZmZKUP+Q==",
          toolConsumerInstanceGuid,
          returnUrl,
          hasFileSubmission: "true",
          sessionExpiry: expiresAt,
        };
        const [sessionRecord] = await tx
          .insert(ltiSessionRecords)
          .values(ltiSessionRecord)
          .returning();
        const sessionRecordId = sessionRecord.id;

        // 3. Create assignment_submissions
        const assignmentSubmission: InsertAssignmentSubmission = {
          ltiSessionRecordId: sessionRecordId,
          ltiLaunchId: launchId,
          fileCount: uploadedFiles.length,
          totalFileSize,
          attemptNumber,
          lmsUserId,
          consumerName: "Avado Learning",
          role: "Learner",
          firstName,
          lastName: surname,
          fullName,
          email,
          customInstructionSet: "AIS",
          customAssessmentCode: customAssessmentCode,
          customAction: "exercise_attempt",
          contextType: "CourseSection",
          contextTitle: courseTitle,
          contextId,
        };
        // Insert with createdAt and updatedAt set to DateInserted from warehouse
        const [submissionRecord] = await tx
          .insert(assignmentSubmissions)
          .values({
            ...assignmentSubmission,
            createdAt,
            updatedAt,
          } as any)
          .returning();
        const submissionId = submissionRecord.id;

        // 4. Create submission_files
        const submissionFileRecords: Array<
          InsertSubmissionFile & { uploadedAt?: Date }
        > = uploadedFiles.map((file) => ({
          submissionId,
          fileName: file.fileName,
          originalFileName: file.originalFileName,
          fileSize: file.fileSize,
          fileType: file.fileType,
          fileMimeType: file.fileMimeType,
          fileUrl: file.fileUrl,
          azureBlobUrl: file.azureBlobUrl,
          azureContainerName: "rogoreplacement",
          azureBlobName: file.azureBlobName,
          uploadOrder: file.uploadOrder,
          submissionFileType: file.submissionFileType,
          uploadedBy: file.uploadedBy,
          uploadedAt: submittedAt,
          // Set turnitinStatus to 'Completed' for learner files (submission type)
          turnitinStatus: file.submissionFileType === "submission" ? "complete" : undefined,
        }));
        await tx
          .insert(submissionFilesTable)
          .values(submissionFileRecords as any);

        // 5. Create submission_marking_assignments
        const markingAssignment: InsertSubmissionMarkingAssignment = {
          submissionId,
          assignedMarkerId: null,
          markingStatus: "released", // Set to 'released' for completed historical submissions
          statusUpdatedAt: submittedAt,
          statusUpdatedBy: null,
        };
        // Insert with createdAt and updatedAt set to match assignment_submissions createdAt
        await tx.insert(submissionMarkingAssignments).values({
          ...markingAssignment,
          createdAt,
          updatedAt: createdAt, // Use createdAt for both since they should match
        } as any);

        // 6. Create submission_section_marks
        // First, get all sections for the assessment
        const sections = await tx
          .select()
          .from(assessmentSections)
          .where(eq(assessmentSections.assessmentId, matchingAssessment.id));

        // Validate all scores can be matched before inserting (with trimmed whitespace)
        const unmatchedScores: string[] = [];
        for (const scoreRow of assessmentScores) {
          const scoreLabel = scoreRow.ScoreLabelCorrected.trim();
          const matchingSection = sections.find((s) => {
            const questionText = (s.questionText || "").trim();
            return questionText.startsWith(scoreLabel);
          });
          if (!matchingSection) {
            unmatchedScores.push(scoreLabel);
          }
        }

        // Fail if any scores cannot be matched
        if (unmatchedScores.length > 0) {
          throw new Error(
            `Cannot match ScoreLabelCorrected to assessment sections: ${unmatchedScores.join(
              ", "
            )}`
          );
        }

        // Insert all section marks (with trimmed whitespace)
        for (const scoreRow of assessmentScores) {
          const scoreLabel = scoreRow.ScoreLabelCorrected.trim();
          const matchingSection = sections.find((s) => {
            const questionText = (s.questionText || "").trim();
            return questionText.startsWith(scoreLabel);
          })!; // Safe to use ! since validated above

          const sectionMark: InsertSubmissionSectionMark = {
            submissionId,
            sectionId: matchingSection.id,
            markerId: null,
            selectedOptionId: null,
            feedback: (scoreRow.MarkerComment || "").trim() || null,
            marksAwarded: parseFloat(String(scoreRow.Score)) || 0,
          };
          await tx.insert(submissionSectionMarks).values(sectionMark);
        }

        // 7. Process Grade and Malpractice
        // Ensure Grade is a string (SQL Server might return it as a different type)
        const gradeValue = assessmentReport.Grade;
        if (!gradeValue || (typeof gradeValue === 'string' && gradeValue.trim() === "")) {
          throw new Error(`Missing or empty Grade field for Attempt ID: ${attemptId}`);
        }
        const warehouseGrade = typeof gradeValue === 'string' ? gradeValue.trim() : String(gradeValue).trim();

        // Check for "Grade Missed" - fail processing
        if (warehouseGrade === "Grade Missed") {
          throw new Error('Grade is "Grade Missed" - cannot process');
        }

        // Check if grade starts with "Malpractice"
        let finalGrade: string;
        let malpracticeLevelId: string | null = null;
        let malpracticeNotes: string | null = null;

        if (warehouseGrade.toLowerCase().startsWith("malpractice")) {
          // Extract malpractice level text (e.g., "Malpractice Moderate" -> "Moderate")
          const gradeParts = warehouseGrade.split(" ");
          if (gradeParts.length < 2) {
            throw new Error(
              `Invalid malpractice grade format: ${warehouseGrade}`
            );
          }

          const levelText = gradeParts[1]; // e.g., "Moderate", "Considerable", "Severe"

          // Find matching malpractice level by exact match: Grade.split(" ")[1] === level_text
          const matchingLevels = allMalpracticeLevels.filter(
            (level) => level.levelText.trim() === levelText.trim()
          );

          if (matchingLevels.length === 0) {
            throw new Error(
              `No malpractice level found matching level text: "${levelText}" (from grade: "${warehouseGrade}")`
            );
          }

          // Use first match if multiple exist (as per requirements)
          const matchedLevel = matchingLevels[0];
          if (matchingLevels.length > 1) {
            console.log(
              `    ⚠️  Multiple malpractice levels matched, using first: ${matchedLevel.levelText}`
            );
          }

          malpracticeLevelId = matchedLevel.id;
          malpracticeNotes = warehouseGrade; // Store full grade text as notes

          // For malpractice cases, set finalGrade based on assessment code
          finalGrade = mapGrade("Refer", customAssessmentCode); // Malpractice always results in Refer

          console.log(
            `  ⚠️  Malpractice detected: ${warehouseGrade} -> Level: ${matchedLevel.levelText} (ID: ${matchedLevel.id})`
          );
        } else {
          // Apply grade mapping based on assessment code
          finalGrade = mapGrade(warehouseGrade, customAssessmentCode);
        }

        // 8. Create submission_grades (using validated fields)
        const totalMarksAwarded = parseFloat(
          String(
            assessmentReport.MarksAchieved || assessmentReport.MarksAwarded
          )
        );
        const totalMarksPossible = parseFloat(
          String(assessmentReport.MarksAvailable)
        );
        const percentageScore = parseFloat(
          String(assessmentReport.GradePercent)
        );

        const submissionGrade: InsertSubmissionGrade = {
          submissionId,
          assessmentId: matchingAssessment.id,
          markerId: null,
          totalMarksAwarded,
          totalMarksPossible,
          percentageScore,
          finalGrade: finalGrade, // Mapped grade
          overallSummary: (assessmentReport.MarkerNotes || "").trim() || null,
          skipReasonId: null,
          skippedReason: null,
          malpracticeLevelId: malpracticeLevelId,
          malpracticeNotes: malpracticeNotes,
          wordCount: null,
          isComplete: true,
          completedAt: parseDate(
            assessmentReport.ResultsApproved || assessmentReport.DateInserted
          ),
        };
        await tx.insert(submissionGrades).values(submissionGrade);

        // 9. Create malpractice_enforcements if malpractice level is set
        if (malpracticeLevelId) {
          // Get the matched malpractice level to determine enforcement rules
          const matchedLevel = allMalpracticeLevels.find(
            (l) => l.id === malpracticeLevelId
          );
          if (!matchedLevel) {
            throw new Error(
              `Malpractice level not found: ${malpracticeLevelId}`
            );
          }

          // Count existing attempts for this user/assessment/context
          const existingAttempts = await tx
            .select({ count: sql<number>`count(*)` })
            .from(assignmentSubmissions)
            .where(
              and(
                eq(assignmentSubmissions.lmsUserId, lmsUserId),
                eq(
                  assignmentSubmissions.customAssessmentCode,
                  customAssessmentCode
                ),
                eq(assignmentSubmissions.contextId, contextId),
                gt(assignmentSubmissions.fileCount, 0)
              )
            );

          const attemptCount = Number(existingAttempts[0]?.count || 0);

          // Apply enforcement rules based on malpractice level (same logic as routes.ts)
          const levelText = matchedLevel.levelText.toLowerCase();
          let enforcedMaxAttempts: number | null = null;

          if (levelText.includes("moderate")) {
            // Moderate: Allow all remaining attempts (normal 3-attempt limit)
            enforcedMaxAttempts = 3;
          } else if (levelText.includes("considerable")) {
            // Considerable: Only 1 further attempt allowed
            enforcedMaxAttempts = attemptNumber + 1;
          } else if (levelText.includes("severe")) {
            // Severe: No further attempts allowed
            enforcedMaxAttempts = attemptNumber;
          }

          // Check for existing enforcement
          const existingEnforcement = await tx
            .select()
            .from(malpracticeEnforcements)
            .where(
              and(
                eq(malpracticeEnforcements.lmsUserId, lmsUserId),
                eq(
                  malpracticeEnforcements.customAssessmentCode,
                  customAssessmentCode
                ),
                eq(malpracticeEnforcements.contextId, contextId)
              )
            )
            .limit(1);

          const enforcementData: InsertMalpracticeEnforcement = {
            lmsUserId: lmsUserId,
            customAssessmentCode: customAssessmentCode,
            contextId: contextId,
            contextTitle: courseTitle,
            malpracticeLevelId: malpracticeLevelId,
            submissionId: submissionId,
            attemptNumber: attemptNumber,
            enforcedMaxAttempts: enforcedMaxAttempts,
            ruleAppliedBy: migrationUserId, // Use system admin user for migration
          };

          if (existingEnforcement.length > 0) {
            // Update existing enforcement
            await tx
              .update(malpracticeEnforcements)
              .set({
                ...enforcementData,
                updatedAt: new Date(),
              })
              .where(eq(malpracticeEnforcements.id, existingEnforcement[0].id));
            console.log(`  ✅ Updated malpractice enforcement`);
          } else {
            // Create new enforcement
            await tx.insert(malpracticeEnforcements).values(enforcementData);
            console.log(
              `  ✅ Created malpractice enforcement (max attempts: ${enforcedMaxAttempts})`
            );
          }
        }

        // Add to migrated rows for CSV tracking
        migratedRows.push({
          "Attempt ID": attemptId,
          "Launch ID": launchId,
          "Submission ID": submissionId,
          "Session Record ID": sessionRecordId,
          "User ID": userId, // Use prefixed TIUserId
          "LTI Context ID": contextId,
        });

        console.log(`  ✅ Success: Submission ID ${submissionId}`);
        console.log(`     📊 Total successfully migrated so far: ${successCount + 1}`);
        successCount++;
        processedCount++;
      });
    } catch (error) {
      console.error(
        `  ❌ Failed: ${error instanceof Error ? error.message : String(error)}`
      );

      // Clean up any uploaded Azure files on failure
      if (uploadedBlobNames && uploadedBlobNames.length > 0) {
        console.log(
          `  🗑️  Cleaning up ${uploadedBlobNames.length} uploaded file(s)...`
        );
        for (const blobName of uploadedBlobNames) {
          try {
            await azureService.deleteFile(blobName);
            console.log(`    ✅ Cleaned up: ${blobName}`);
          } catch (cleanupError) {
            console.error(
              `    ⚠️  Failed to cleanup ${blobName}:`,
              cleanupError
            );
          }
        }
      }

      failedCount++;
      processedCount++;
      failedRows.push({
        ...csvRow,
        Error: error instanceof Error ? error.message : String(error),
      });
    }

    // Write to CSV files every BATCH_SIZE attempts to free up memory
    if (processedCount > 0 && processedCount % BATCH_SIZE === 0) {
      console.log(
        `\n💾 Writing batch to CSV files (processed ${processedCount} attempts)...`
      );

      // Write migrated rows
      if (migratedRows.length > 0) {
        writeMigratedRows(migratedRows, migratedCsvPath, isFirstMigratedWrite);
        migratedRows.length = 0; // Clear array to free memory
        isFirstMigratedWrite = false;
      }

      // Write failed rows
      if (failedRows.length > 0) {
        writeFailedRows(failedRows, failedCsvPath, csvHeaders, isFirstFailedWrite);
        failedRows.length = 0; // Clear array to free memory
        isFirstFailedWrite = false;
      }

      console.log(
        `✅ Batch written. Memory freed. Continuing with next batch...\n`
      );
    }
  }

  // Close warehouse connection pool
  if (warehouseDb) {
    await warehouseDb.close();
    console.log("\n✅ Closed Data Warehouse connection pool");
  }

  // Write any remaining rows to CSV files
  console.log("\n📝 Writing final batch to output files...");

  // Write remaining migrated rows
  if (migratedRows.length > 0) {
    writeMigratedRows(migratedRows, migratedCsvPath, isFirstMigratedWrite);
    migratedRows.length = 0; // Clear array
  }

  // Write remaining failed rows
  if (failedRows.length > 0) {
    writeFailedRows(failedRows, failedCsvPath, csvHeaders, isFirstFailedWrite);
    failedRows.length = 0; // Clear array
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Migration Summary");
  console.log("=".repeat(60));
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`📁 Total processed: ${submissionRows.length}`);
  console.log("=".repeat(60));
}

// Run migration when script is executed directly
migrateRogoSubmissions()
  .then(() => {
    console.log("\n✅ Migration completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  });

export { migrateRogoSubmissions };
