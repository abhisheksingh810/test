// Worker thread for processing individual migration submissions
import { parentPort, workerData } from "worker_threads";
import "dotenv/config";
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
import * as fs from "fs";

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
  Grade?: string;
  [key: string]: any;
}

interface WarehouseScore {
  AttemptId: number | string;
  ScoreLabelCorrected: string;
  Score: number;
  MarkerComment: string | null;
  DateInserted: Date | string;
  DateModified: Date | string | null;
  [key: string]: any;
}

interface WorkerData {
  workerId: number;
  allAssessments: Array<{ id: string; name: string; code: string }>;
  allMalpracticeLevels: Array<{ id: string; levelText: string }>;
  migrationUserId: string;
  attemptNumberMapping: Array<[string, AttemptMappingRow]>;
  csvHeaders: string[];
}

interface WorkRequest {
  type: "WORK_REQUEST";
}

interface WorkResult {
  type: "WORK_RESULT";
  workerId: number;
  success: boolean;
  attemptId: string;
  migratedRow?: {
    "Attempt ID": string;
    "Launch ID": string;
    "Submission ID": string;
    "Session Record ID": string;
    "User ID": string;
    "LTI Context ID": string;
  };
  failedRow?: SubmissionFileRow & { Error: string };
}

interface ProgressUpdate {
  type: "PROGRESS";
  workerId: number;
  message: string;
  attemptId: string;
}

// Constants
const LMS_INSTANCE_ID = "79755547-2e38-493d-8b22-75d268777b4a";
const TOOL_CONSUMER_INSTANCE_GUID = "79755547-2e38-493d-8b22-75d268777b4a";

// Shared data from main thread
const {
  workerId,
  allAssessments,
  allMalpracticeLevels,
  migrationUserId,
  attemptNumberMapping: attemptMappingArray,
  csvHeaders,
} = workerData as WorkerData;

// Reconstruct Map from array (Worker threads can't serialize Map)
const attemptNumberMapping = new Map<string, AttemptMappingRow>(
  attemptMappingArray
);

// Worker-specific state
let warehouseDb: mssql.ConnectionPool | null = null;
let azureService: any = null;
let isInitialized = false;

// Helper functions (from original script)
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

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function generateLaunchId(attemptId: string): string {
  return `rogo_${attemptId}_${Date.now().toString()}${Math.random()
    .toString(36)
    .substr(2, 9)}`;
}

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

function mapGrade(grade: string, assessmentCode: string): string {
  const trimmedGrade = grade.trim();

  if (trimmedGrade === "Grade Missed") {
    throw new Error(`Grade is "Grade Missed" - cannot process`);
  }

  const firstChar = assessmentCode.charAt(0);
  if (["3", "4", "5"].includes(firstChar)) {
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
    return trimmedGrade;
  }

  if (firstChar === "7") {
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
    return trimmedGrade;
  }

  return trimmedGrade;
}

function constructContextId(tiSectionId: string): string {
  return tiSectionId;
}

function parseDate(dateValue: Date | string | null | undefined): Date {
  if (!dateValue) {
    throw new Error("Date value is null or undefined");
  }
  if (dateValue instanceof Date) {
    if (isNaN(dateValue.getTime())) {
      throw new Error(`Invalid Date object`);
    }
    return dateValue;
  }
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateValue}`);
  }
  return date;
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

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

function parseCommaSeparated(value: string): string[] {
  if (!value || value.trim() === "") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/\s+/g, "_");
}

function sendProgress(message: string, attemptId: string): void {
  if (parentPort) {
    parentPort.postMessage({
      type: "PROGRESS",
      workerId,
      message,
      attemptId,
    } as ProgressUpdate);
  }
}

// Initialize worker connections
async function initializeWorker(): Promise<void> {
  if (isInitialized) return;

  try {
    // Initialize Azure SQL Server Data Warehouse connection pool
    const maxRetries = 5;
    const retryDelay = 2000;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        warehouseDb = new mssql.ConnectionPool(
          process.env.DATA_WAREHOUSE_CONNECTION_STRING!
        );

        warehouseDb.config.options = {
          ...warehouseDb.config.options,
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true,
          requestTimeout: 30000,
        };

        // Set pool size to 3 per worker
        warehouseDb.config.pool = {
          max: 3,
          min: 1,
          idleTimeoutMillis: 30000,
        };

        await warehouseDb.connect();

        const testResult = await warehouseDb
          .request()
          .query("SELECT 1 as test");
        if (
          testResult &&
          testResult.recordset &&
          testResult.recordset.length > 0
        ) {
          sendProgress("Connected to Data Warehouse", "INIT");
          break;
        }
      } catch (error) {
        if (warehouseDb && warehouseDb.connected) {
          try {
            await warehouseDb.close();
          } catch (closeError) {
            // Ignore
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
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // Initialize Azure Blob Service
    await initializeAzureBlobService();
    azureService = getAzureBlobService();
    sendProgress("Azure Blob Service initialized", "INIT");

    isInitialized = true;
  } catch (error) {
    throw new Error(
      `Worker ${workerId} initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Process a single submission
async function processSubmission(
  csvRow: SubmissionFileRow
): Promise<WorkResult> {
  const attemptId = String(csvRow["Attempt ID"] || "");

  if (!attemptId) {
    throw new Error("Missing Attempt ID");
  }

  sendProgress("Processing submission", attemptId);

  let uploadedBlobNames: string[] = [];

  try {
    // Check if already migrated
    const launchIdPattern = `rogo_${attemptId}_%`;
    const existingSubmission = await db
      .select({
        id: assignmentSubmissions.id,
        ltiLaunchId: assignmentSubmissions.ltiLaunchId,
      })
      .from(assignmentSubmissions)
      .where(like(assignmentSubmissions.ltiLaunchId, launchIdPattern))
      .limit(1);

    if (existingSubmission.length > 0) {
      sendProgress(
        `Already migrated (${existingSubmission[0].ltiLaunchId}), skipping`,
        attemptId
      );
      return {
        type: "WORK_RESULT",
        workerId,
        success: true,
        attemptId,
      };
    }

    // Get mapping row
    const mappingRow = attemptNumberMapping.get(attemptId);
    if (!mappingRow) {
      throw new Error(
        `Missing attempt_number_mapping entry for Attempt ID: ${attemptId}`
      );
    }

    // Validate Unit Code Version
    const casSuffix = (mappingRow["Unit Code Version"] || "").trim();
    if (!casSuffix) {
      throw new Error(
        `Missing or empty Unit Code Version for Attempt ID: ${attemptId}`
      );
    }

    // Filter: Only migrate submissions where Unit Code Version starts with '24' or '25'
    if (!casSuffix.startsWith("24") && !casSuffix.startsWith("25")) {
      sendProgress(
        `Skipping - Unit Code Version "${casSuffix}" not 24/25`,
        attemptId
      );
      return {
        type: "WORK_RESULT",
        workerId,
        success: true,
        attemptId,
      };
    }

    // Get submission text
    const submissionText = (mappingRow["Submission"] || "").trim();
    if (!submissionText) {
      throw new Error(
        `Missing or empty Submission field for Attempt ID: ${attemptId}`
      );
    }

    // Query Data Warehouse
    sendProgress("Querying Data Warehouse", attemptId);

    const reportResult = await warehouseDb!
      .request()
      .input("attemptId", mssql.Int, parseInt(attemptId))
      .query(
        "SELECT * FROM [dbo].[Rogo_AssessmentReport] WHERE AttemptId = @attemptId"
      );

    const reportRows = reportResult.recordset as WarehouseAssessmentReport[];

    if (!reportRows || reportRows.length === 0) {
      throw new Error(
        `Missing Rogo_AssessmentReport row for Attempt ID: ${attemptId}`
      );
    }

    const assessmentReport = reportRows[0];

    // Validate required fields
    if (!assessmentReport.Exercise || assessmentReport.Exercise.trim() === "") {
      throw new Error(`Missing or empty Exercise field`);
    }
    if (!assessmentReport.TIUserId || assessmentReport.TIUserId.trim() === "") {
      throw new Error(`Missing or empty TIUserId field`);
    }
    if (
      !assessmentReport.TISectionId ||
      assessmentReport.TISectionId.trim() === ""
    ) {
      throw new Error(`Missing or empty TISectionId field`);
    }
    if (
      assessmentReport.MarksAchieved === null &&
      assessmentReport.MarksAwarded === null
    ) {
      throw new Error(`Missing MarksAchieved/MarksAwarded field`);
    }
    if (
      assessmentReport.MarksAvailable === null ||
      assessmentReport.MarksAvailable === undefined
    ) {
      throw new Error(`Missing MarksAvailable field`);
    }
    if (
      assessmentReport.GradePercent === null ||
      assessmentReport.GradePercent === undefined
    ) {
      throw new Error(`Missing GradePercent field`);
    }
    if (!assessmentReport.DateInserted) {
      throw new Error(`Missing DateInserted field`);
    }
    if (
      !assessmentReport.Grade ||
      (typeof assessmentReport.Grade === "string" &&
        assessmentReport.Grade.trim() === "")
    ) {
      throw new Error(`Missing Grade field`);
    }

    sendProgress(`Found assessment report: ${assessmentReport.Exercise}`, attemptId);

    // Query scores
    const scoreResult = await warehouseDb!
      .request()
      .input("attemptId", mssql.Int, parseInt(attemptId))
      .query(
        "SELECT * FROM [dbo].[Rogo_AssessmentReportScores] WHERE AttemptId = @attemptId"
      );

    const assessmentScores = (scoreResult.recordset as WarehouseScore[]) || [];
    sendProgress(`Found ${assessmentScores.length} score record(s)`, attemptId);

    // Validate scores
    for (const score of assessmentScores) {
      if (
        !score.ScoreLabelCorrected ||
        score.ScoreLabelCorrected.trim() === ""
      ) {
        throw new Error(`Missing ScoreLabelCorrected in score record`);
      }
      if (score.Score === null || score.Score === undefined) {
        throw new Error(`Missing Score in score record`);
      }
    }

    // Determine Assessment Code
    const exercise = assessmentReport.Exercise.trim();
    const casParts = exercise.split(" ");
    if (casParts.length < 2) {
      throw new Error(`Invalid Exercise format: ${exercise}`);
    }
    const casPrefix = `${casParts[0]} ${casParts[1]}`;

    // Validate CSV fields
    const csvFirstName = (csvRow["First Name"] || "").trim();
    const csvSurname = (csvRow["Surname"] || "").trim();
    const csvEmail = (csvRow["Learner Email"] || "").trim();
    if (!csvEmail) {
      throw new Error(`Missing or empty Learner Email`);
    }

    // Find matching assessment
    const matchingAssessments = allAssessments.filter(
      (a) =>
        a.name.trim().startsWith(casPrefix) && a.name.trim().endsWith(casSuffix)
    );

    if (matchingAssessments.length === 0) {
      throw new Error(
        `No assessment found matching prefix "${casPrefix}" and suffix "${casSuffix}"`
      );
    }

    const matchingAssessment = matchingAssessments[0];
    const customAssessmentCode = matchingAssessment.code;
    sendProgress(
      `Found assessment: ${matchingAssessment.name} (${customAssessmentCode})`,
      attemptId
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

    // Process TI IDs
    const tiUserId = `${LMS_INSTANCE_ID}::${assessmentReport.TIUserId.trim()}`;
    const tiSectionId = `${LMS_INSTANCE_ID}::${assessmentReport.TISectionId.trim()}`;
    const userId = tiUserId;
    const lmsUserId = tiUserId;
    const contextId = constructContextId(tiSectionId);
    const { suffix: contextIdSuffix } = parseContextId(contextId);
    const toolConsumerInstanceGuid = TOOL_CONSUMER_INSTANCE_GUID;

    // Process Files
    sendProgress("Processing files", attemptId);

    const learnerFileUrls = parseCommaSeparated(
      csvRow["Learner Azure Blob URLs"] || ""
    );
    const learnerFileNames = parseCommaSeparated(
      csvRow["Learner File Names"] || ""
    );
    const markerFileUrls = parseCommaSeparated(
      csvRow["Marker Azure Blob URLs"] || ""
    );

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
    uploadedBlobNames = [];

    // Process learner files
    for (let j = 0; j < learnerFileUrls.length; j++) {
      const fileUrl = learnerFileUrls[j];
      const fileName = learnerFileNames[j] || `learner_file_${j + 1}`;

      if (
        !fileUrl.startsWith("https://rogoreplacement.blob.core.windows.net")
      ) {
        continue;
      }

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
          uploadedBy: csvRow["Rogo User ID"] || csvRow["Learner Email"] || null,
        });

        uploadedBlobNames.push(uploadResult.blobName);
      } catch (error) {
        // Clean up uploaded files
        for (const blobName of uploadedBlobNames) {
          try {
            await azureService.deleteFile(blobName);
          } catch (cleanupError) {
            // Ignore cleanup errors
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
    const assessmentId = (
      csvRow["Assessment ID"] ||
      customAssessmentCode ||
      ""
    ).trim();
    const baseMarkerFileName = assessmentId
      ? `${assessmentId}_${sanitizeFileName(csvFirstName)}-${sanitizeFileName(
          csvSurname
        )}_feedback`
      : `feedback_${attemptId}`;

    for (let j = 0; j < markerFileUrls.length; j++) {
      const fileUrl = markerFileUrls[j];

      if (
        !fileUrl.startsWith("https://rogoreplacement.blob.core.windows.net")
      ) {
        continue;
      }

      const fileExtension = "docx";
      const markerFileName =
        markerFileUrls.length > 1
          ? `${baseMarkerFileName}_${j + 1}.${fileExtension}`
          : `${baseMarkerFileName}.${fileExtension}`;

      try {
        const fileBuffer = await downloadFileFromUrl(fileUrl);
        totalFileSizeBytes += fileBuffer.length;

        const fileMimeType = getContentType(fileExtension);

        const uploadResult = await azureService.uploadFile({
          fileName: markerFileName,
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
          fileName: markerFileName,
          originalFileName: markerFileName,
          fileSize: formatFileSize(fileBuffer.length),
          fileType: fileExtension,
          fileMimeType,
          fileUrl: uploadResult.url,
          azureBlobUrl: uploadResult.url,
          azureBlobName: uploadResult.blobName,
          uploadOrder: uploadOrder++,
          submissionFileType: "feedback",
          uploadedBy: null,
        });

        uploadedBlobNames.push(uploadResult.blobName);
      } catch (error) {
        // Clean up uploaded files
        for (const blobName of uploadedBlobNames) {
          try {
            await azureService.deleteFile(blobName);
          } catch (cleanupError) {
            // Ignore cleanup errors
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
    sendProgress(
      `Uploaded ${uploadedFiles.length} files (${totalFileSize})`,
      attemptId
    );

    // Create Database Records
    sendProgress("Creating database records", attemptId);

    const launchId = generateLaunchId(attemptId);
    const returnUrl = `https://hub.avadolearning.com/learn/lti/consumer/return/${contextIdSuffix}`;
    const submittedAt = parseDate(
      assessmentReport.ResultsApproved || assessmentReport.DateInserted
    );
    const createdAt = parseDate(assessmentReport.DateInserted);
    const updatedAt = parseDate(
      assessmentReport.DateModified || assessmentReport.DateInserted
    );
    const expiresAt = new Date("2099-12-31");

    const firstName = csvFirstName;
    const surname = csvSurname;
    const fullName =
      `${firstName} ${surname}`.trim() ||
      (csvRow["Rogo User Name"] || "").trim();
    const email = csvEmail;
    const courseTitle =
      (csvRow["Course Title"] || "").trim() || assessmentReport.Exercise;

    let sessionRecordId: string;
    let submissionId: string;

    await db.transaction(async (tx) => {
      // 1. Create lti_launch_sessions
      const ltiLaunchSession: InsertLtiLaunchSession = {
        launchId,
        consumerKey: "MggwgSmGeNMNnsZmZKUP+Q==",
        userId: userId,
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
      sessionRecordId = sessionRecord.id;

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
      const [submissionRecord] = await tx
        .insert(assignmentSubmissions)
        .values({
          ...assignmentSubmission,
          createdAt,
          updatedAt,
        } as any)
        .returning();
      submissionId = submissionRecord.id;

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
        turnitinStatus:
          file.submissionFileType === "submission" ? "complete" : undefined,
      }));
      await tx
        .insert(submissionFilesTable)
        .values(submissionFileRecords as any);

      // 5. Create submission_marking_assignments
      const markingAssignment: InsertSubmissionMarkingAssignment = {
        submissionId,
        assignedMarkerId: null,
        markingStatus: "released",
        statusUpdatedAt: submittedAt,
        statusUpdatedBy: null,
      };
      await tx.insert(submissionMarkingAssignments).values({
        ...markingAssignment,
        createdAt,
        updatedAt: createdAt,
      } as any);

      // 6. Create submission_section_marks
      const sections = await tx
        .select()
        .from(assessmentSections)
        .where(eq(assessmentSections.assessmentId, matchingAssessment.id));

      // Validate all scores can be matched
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

      if (unmatchedScores.length > 0) {
        throw new Error(
          `Cannot match ScoreLabelCorrected to assessment sections: ${unmatchedScores.join(
            ", "
          )}`
        );
      }

      // Insert all section marks
      for (const scoreRow of assessmentScores) {
        const scoreLabel = scoreRow.ScoreLabelCorrected.trim();
        const matchingSection = sections.find((s) => {
          const questionText = (s.questionText || "").trim();
          return questionText.startsWith(scoreLabel);
        })!;

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
      const gradeValue = assessmentReport.Grade;
      if (
        !gradeValue ||
        (typeof gradeValue === "string" && gradeValue.trim() === "")
      ) {
        throw new Error(`Missing or empty Grade field`);
      }
      const warehouseGrade =
        typeof gradeValue === "string"
          ? gradeValue.trim()
          : String(gradeValue).trim();

      if (warehouseGrade === "Grade Missed") {
        throw new Error('Grade is "Grade Missed" - cannot process');
      }

      let finalGrade: string;
      let malpracticeLevelId: string | null = null;
      let malpracticeNotes: string | null = null;

      if (warehouseGrade.toLowerCase().startsWith("malpractice")) {
        const gradeParts = warehouseGrade.split(" ");
        if (gradeParts.length < 2) {
          throw new Error(
            `Invalid malpractice grade format: ${warehouseGrade}`
          );
        }

        const levelText = gradeParts[1];

        const matchingLevels = allMalpracticeLevels.filter(
          (level) => level.levelText.trim() === levelText.trim()
        );

        if (matchingLevels.length === 0) {
          throw new Error(
            `No malpractice level found matching level text: "${levelText}"`
          );
        }

        const matchedLevel = matchingLevels[0];
        malpracticeLevelId = matchedLevel.id;
        malpracticeNotes = warehouseGrade;
        finalGrade = mapGrade("Refer", customAssessmentCode);
      } else {
        finalGrade = mapGrade(warehouseGrade, customAssessmentCode);
      }

      // 8. Create submission_grades
      const totalMarksAwarded = parseFloat(
        String(
          assessmentReport.MarksAchieved || assessmentReport.MarksAwarded
        )
      );
      const totalMarksPossible = parseFloat(
        String(assessmentReport.MarksAvailable)
      );
      const percentageScore = parseFloat(String(assessmentReport.GradePercent));

      const submissionGrade: InsertSubmissionGrade = {
        submissionId,
        assessmentId: matchingAssessment.id,
        markerId: null,
        totalMarksAwarded,
        totalMarksPossible,
        percentageScore,
        finalGrade: finalGrade,
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

      // 9. Create malpractice_enforcements if needed
      if (malpracticeLevelId) {
        const matchedLevel = allMalpracticeLevels.find(
          (l) => l.id === malpracticeLevelId
        );
        if (!matchedLevel) {
          throw new Error(`Malpractice level not found: ${malpracticeLevelId}`);
        }

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

        const levelText = matchedLevel.levelText.toLowerCase();
        let enforcedMaxAttempts: number | null = null;

        if (levelText.includes("moderate")) {
          enforcedMaxAttempts = 3;
        } else if (levelText.includes("considerable")) {
          enforcedMaxAttempts = attemptNumber + 1;
        } else if (levelText.includes("severe")) {
          enforcedMaxAttempts = attemptNumber;
        }

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
          ruleAppliedBy: migrationUserId,
        };

        if (existingEnforcement.length > 0) {
          await tx
            .update(malpracticeEnforcements)
            .set({
              ...enforcementData,
              updatedAt: new Date(),
            })
            .where(eq(malpracticeEnforcements.id, existingEnforcement[0].id));
        } else {
          await tx.insert(malpracticeEnforcements).values(enforcementData);
        }
      }
    });

    sendProgress(`Success - Submission ID: ${submissionId!}`, attemptId);

    return {
      type: "WORK_RESULT",
      workerId,
      success: true,
      attemptId,
      migratedRow: {
        "Attempt ID": attemptId,
        "Launch ID": launchId,
        "Submission ID": submissionId!,
        "Session Record ID": sessionRecordId!,
        "User ID": userId,
        "LTI Context ID": contextId,
      },
    };
  } catch (error) {
    // Clean up uploaded files
    if (uploadedBlobNames && uploadedBlobNames.length > 0) {
      for (const blobName of uploadedBlobNames) {
        try {
          await azureService.deleteFile(blobName);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error);
    sendProgress(`Failed: ${errorMessage}`, attemptId);

    return {
      type: "WORK_RESULT",
      workerId,
      success: false,
      attemptId,
      failedRow: {
        ...csvRow,
        Error: errorMessage,
      },
    };
  }
}

// Main worker loop
async function workerMain(): Promise<void> {
  try {
    // Initialize connections
    await initializeWorker();
    sendProgress("Worker initialized and ready", "INIT");

    // Request work from main thread
    if (parentPort) {
      parentPort.on("message", async (message: any) => {
        if (message.type === "WORK" && message.csvRow) {
          const result = await processSubmission(message.csvRow);
          parentPort!.postMessage(result);

          // Request more work
          parentPort!.postMessage({ type: "WORK_REQUEST", workerId });
        } else if (message.type === "SHUTDOWN") {
          // Clean up connections
          if (warehouseDb) {
            await warehouseDb.close();
          }
          sendProgress("Shutting down", "SHUTDOWN");
          process.exit(0);
        }
      });

      // Initial work request
      parentPort.postMessage({ type: "WORK_REQUEST", workerId } as WorkRequest);
    }
  } catch (error) {
    console.error(
      `Worker ${workerId} fatal error:`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Start worker
workerMain();

