# Final Rogo Migration Plan

## Overview
Migrate submissions from Rogo to the new system by inserting directly into the database, mimicking the LTI workflow structure.

## Prerequisites & Setup

### Input Files
- `rogo_submissions_data.xlsx` - Main submission data
- `submission_files.csv` - File URLs and metadata

### Output Files
- `submissions_failed_migration.csv` - Failed attempts with full row data + error reason
- `migrated.csv` - Successful migrations: Attempt ID, Launch ID, Submission ID, Session Record ID

### Database State
- Load all assessments from `assessments` table (need both `name` and `code`)
- Maintain in-memory mapping: `attempt_id → { launchId, submissionId, sessionRecordId }`
- Check this mapping before processing each attempt to skip already-migrated ones

## Step-by-Step Process

### Step 1: Load Source Data
1. Parse `rogo_submissions_data.xlsx` into memory
2. Parse `submission_files.csv` into memory
3. Load all assessments from database: `SELECT id, name, code FROM assessments`
4. Initialize attempt mapping: `Map<attemptId, { launchId, submissionId, sessionRecordId }>`
5. Load existing `migrated.csv` (if exists) to populate attempt mapping with already-migrated attempts

### Step 2: Pre-Process Data
For each row in `rogo_submissions_data.xlsx`:
1. Join with `submission_files.csv` on Attempt ID
2. If no matching files found → fail processing, append to failed CSV
3. If attempt_id already in mapping → skip (already migrated)

### Step 3: Process Each Submission

For each submission (inside processing loop):

#### 3.1: Extract and Validate Assessment Code
1. Read "Submission" column (e.g., "5HR03 PQ Attempt 2")
2. Extract prefix: `data = submission.split(" ")`, `casName = data[0] + " " + data[1]`
3. Find assessment where `assessment.name` starts with `casName` (exact prefix match)
4. If multiple matches → use first match
5. If no match → fail processing, append to failed CSV with error "No assessment found matching prefix: {casName}"
6. Store `assessment.code` as `customAssessmentCode`

#### 3.2: Generate Launch ID
- Format: `rogo_${Date.now().toString()}${Math.random().toString(36).substr(2, 9)}`
- Ensure uniqueness (check mapping if needed)

#### 3.3: Parse Context ID
- Format: `{guid1}::{guid2}`
- `toolConsumerInstanceGuid` = part before `::`
- `contextIdSuffix` = part after `::`
- `contextId` = full value (use as-is)

#### 3.4: Prepare All Data (Before Transaction)
Prepare all values for:
- `lti_launch_sessions` record
- `lti_session_records` record
- `assignment_submissions` record
- `submission_files` records (array)
- `submission_marking_assignments` record

**Data Mapping:**

**lti_launch_sessions:**
- `launchId` → Generated launch ID
- `consumerKey` → "MggwgSmGeNMNnsZmZKUP+Q=="
- `userId` → "External User ID" column
- `userEmail` → "Email" column
- `userName` → "Full Name" column
- `courseName` → "Exercise" column
- `returnUrl` → `https://hub.avadolearning.com/learn/lti/consumer/return/${contextIdSuffix}`
- `resourceLinkId` → null
- `contextId` → "LTI Context ID" column (full value)
- `toolConsumerInstanceGuid` → First part of context_id (before `::`)
- `customParams` → JSON string with: `{ cis: "AIS", cas: customAssessmentCode }`
- `ltiMessageType` → "basic-lti-launch-request"
- `contextType` → "CourseSection"
- `contextTitle` → "Exercise" column
- `roles` → "Learner"
- `lisPersonNameGiven` → "First Name" column
- `lisPersonNameFamily` → "Last Name" column
- `lisPersonNameFull` → "Full Name" column
- `lisPersonContactEmailPrimary` → "Email" column
- `toolConsumerInstanceName` → "Avado Learning"
- `customAction` → "exercise_attempt"
- `assignmentTitle` → "Submission Area"
- `customInstructionSet` → "AIS"
- `customAssessmentCode` → Extracted assessment code
- `createdAt` → "Date Time Completed (UTC)" timestamp
- `expiresAt` → **QUESTION: What should this be?** (See questions section)

**lti_session_records:**
- `launchId` → Same generated launch ID
- `lmsUserId` → "External User ID" column
- `consumerName` → "Avado Learning"
- `role` → "Learner"
- `firstName` → "First Name" column
- `lastName` → "Last Name" column
- `fullName` → "Full Name" column
- `email` → "Email" column
- `customAction` → "exercise_attempt"
- `customInstructionSet` → "AIS"
- `customAssessmentCode` → Extracted assessment code
- `contextType` → "CourseSection"
- `contextTitle` → "Exercise" column
- `resourceLinkId` → null or generate
- `resourceLinkTitle` → "Exercise" column or null
- `contextId` → "LTI Context ID" column
- `consumerKey` → "MggwgSmGeNMNnsZmZKUP+Q=="
- `toolConsumerInstanceGuid` → First part of context_id
- `returnUrl` → Same as lti_launch_sessions
- `hasFileSubmission` → "true" (always, since we're migrating completed submissions)
- `sessionExpiry` → Same as expiresAt from lti_launch_sessions
- `createdAt` → "Date Time Completed (UTC)" timestamp

**assignment_submissions:**
- `ltiLaunchId` → Generated launch ID
- `ltiSessionRecordId` → **Will be set after creating lti_session_records record**
- `fileCount` → Count of files from CSV
- `totalFileSize` → Sum of all file sizes, format: "{X.XX}MB"
- `submittedAt` → "Date Time Completed (UTC)" timestamp
- `attemptNumber` → "Attempt" column value (use directly, don't calculate)
- `lmsUserId` → "External User ID" column
- `consumerName` → "Avado Learning"
- `role` → "Learner"
- `firstName` → "First Name" column
- `lastName` → "Last Name" column
- `fullName` → "Full Name" column
- `email` → "Email" column
- `customInstructionSet` → "AIS"
- `customAssessmentCode` → Extracted assessment code
- `customAction` → "exercise_attempt"
- `contextType` → "CourseSection"
- `contextTitle` → "Exercise" column
- `contextId` → "LTI Context ID" column

**submission_files** (for each file in CSV, in order):
- `submissionId` → **Will be set after creating assignment_submissions record**
- `fileName` → "Learner File Names" (original filename)
- `originalFileName` → Same as fileName
- `fileSize` → **Calculate from downloaded file or use from Azure metadata**
- `fileType` → Extract extension from filename (e.g., "docx", "pdf")
- `fileMimeType` → Map file extension to MIME type
- `fileUrl` → **New Azure URL after upload**
- `azureBlobUrl` → Same as fileUrl
- `azureContainerName` → "rogoreplacement" (production container)
- `azureBlobName` → **New blob name in production Azure storage**
- `uploadOrder` → Sequential based on CSV order (1, 2, 3, ...)
- `uploadedAt` → "Date Time Completed (UTC)" or current timestamp?
- `submissionFileType` → "submission"
- `uploadedBy` → "External User ID" column (lmsUserId)

**submission_marking_assignments:**
- `submissionId` → **Will be set after creating assignment_submissions record**
- `assignedMarkerId` → null
- `markingStatus` → "waiting"
- `assignedAt` → Current timestamp or submission timestamp?
- `statusUpdatedAt` → Current timestamp or submission timestamp?
- `statusUpdatedBy` → null

#### 3.5: Handle Files (Before Transaction)
For each file in submission (in CSV order):
1. Download file from URL in CSV (attempt once)
   - If download fails → fail processing, append to failed CSV with error "File download failed: {fileName}"
2. Calculate file size from downloaded buffer
3. Extract file extension for fileType
4. Map extension to MIME type
5. Upload to production Azure Blob Storage (attempt once)
   - If upload fails → fail processing, append to failed CSV with error "File upload failed: {fileName}"
6. Store new Azure URL, blob name for later use in transaction

**Note:** All file operations happen BEFORE the database transaction. If any file operation fails, we don't proceed to database inserts.

#### 3.6: Execute Database Transaction
**Single transaction for each submission:**

1. Insert into `lti_launch_sessions`
   - Capture returned record (for logging, not needed for foreign keys)

2. Insert into `lti_session_records`
   - **Capture returned `id` as `sessionRecordId`** (needed for foreign key)

3. Insert into `assignment_submissions`
   - Use `sessionRecordId` from step 2 as `ltiSessionRecordId`
   - **Capture returned `id` as `submissionId`** (needed for foreign keys)

4. Insert into `submission_files` (for each file)
   - Use `submissionId` from step 3

5. Insert into `submission_marking_assignments`
   - Use `submissionId` from step 3

**If transaction fails:**
- Rollback all changes
- Fail processing, append to failed CSV with database error message

**If transaction succeeds:**
- Update attempt mapping: `attempt_id → { launchId, submissionId, sessionRecordId }`
- Append to `migrated.csv`: Attempt ID, Launch ID, Submission ID, Session Record ID
- Log success to console

#### 3.7: Post-Processing (After All Submissions)
After processing all submissions:
1. Queue Turnitin jobs for all successfully migrated submissions
   - Iterate through all submissions in mapping
   - For each submission, get all files
   - Queue Turnitin submission job for each file

## Logging & Console Output

### Console Logs Should Include:
- "Starting migration..."
- "Loaded X submissions from Excel"
- "Loaded X file records from CSV"
- "Loaded X assessments from database"
- "Processing submission {Attempt ID}..."
- "  → Assessment code: {code}"
- "  → Launch ID: {launchId}"
- "  → Downloading {count} files..."
- "  → Uploading files to Azure..."
- "  → Creating database records..."
- "  → ✅ Success: Submission ID {submissionId}"
- "  → ❌ Failed: {error reason}"
- "Processing complete: {success_count} succeeded, {failed_count} failed"
- "Queuing Turnitin jobs..."

### Error Logging:
- Log all errors with context (Attempt ID, error message)
- Include stack traces for unexpected errors

## Questions for Clarification

### 1. Launch Session Expiry
**Question:** What should `expiresAt` and `sessionExpiry` be set to?

**Context:** 
- Normal LTI sessions expire after 1 hour
- For historical migration data, these sessions are already "completed"
- The system may check expiry in some queries

**Options:**
- A) Set to 1 hour after `createdAt` (matches normal flow, but may be in the past)
- B) Set to far future (e.g., 2099-12-31) so they never expire
- C) Set to current time + 1 hour (treats them as if just created now)
- D) Something else?

**Recommendation:** Option B (far future) - since these are historical records, we don't want them to appear "expired" in any system checks.

### 2. Timestamp for uploadedAt
**Question:** For `submission_files.uploadedAt`, should we use:
- A) "Date Time Completed (UTC)" from Excel (when submission was originally made)
- B) Current timestamp (when migration is running)

**Recommendation:** Option A - preserve original submission timing.

### 3. Timestamp for marking assignment dates
**Question:** For `submission_marking_assignments.assignedAt` and `statusUpdatedAt`, should we use:
- A) "Date Time Completed (UTC)" from Excel
- B) Current timestamp

**Recommendation:** Option A - preserve original timing.

### 4. Resource Link ID
**Question:** What should `resourceLinkId` be set to?
- A) null
- B) Generated value (e.g., `rogo_resource_${attemptId}`)
- C) Extract from somewhere in the data

**Recommendation:** Option A (null) - not required for migration.

### 5. File Size Calculation
**Question:** When calculating file size for `submission_files.fileSize`:
- Should we format it (e.g., "2.5MB") or store raw bytes?
- What format should `totalFileSize` in `assignment_submissions` be?

**From code analysis:** `totalFileSize` is stored as text like "2.50MB", and individual `fileSize` in `submission_files` appears to be text as well.

**Recommendation:** 
- Store file sizes as text with MB format: "{X.XX}MB"
- Calculate from downloaded buffer length in bytes, convert to MB

### 6. MIME Type Mapping
**Question:** Should we create a helper function to map file extensions to MIME types, or is there an existing utility?

**Note:** I saw `getContentType()` function in routes.ts that does this. We should use the same mapping.

### 7. Turnitin Job Queuing
**Question:** After migration, when queueing Turnitin jobs:
- Should we queue immediately after each submission, or batch at the end?
- What happens if Turnitin job queueing fails? Should we log but continue?

**Current plan says:** "After all database entries are created, queue Turnitin jobs"

**Recommendation:** Batch at the end, log failures but don't fail the migration.

### 8. Duplicate Detection Logic
**Question:** For checking if an attempt is already migrated:
- Should we check the database directly, or only rely on the `migrated.csv` file?
- What if `migrated.csv` is out of sync with database?

**Recommendation:** 
- Primary: Check `migrated.csv` file (if exists) at startup
- Secondary: Optionally validate against database if needed
- If `migrated.csv` exists, load it into mapping; if not, start fresh

### 9. Failed CSV Format
**Question:** For `submissions_failed_migration.csv`:
- Should we include all original columns from Excel PLUS an "Error" column?
- Or just the original row data?

**Current requirement:** "append the entire row from rogo_submissions_data.xlsx"

**Clarification needed:** Should we add an "Error" column with the failure reason?

**Recommendation:** Add "Error" column for debugging.

### 10. Batch Size for Processing
**Question:** Should we process submissions:
- A) One at a time (safer, easier rollback)
- B) In batches of N (faster, but more complex error handling)

**Current plan:** One at a time per transaction.

**Recommendation:** Keep one at a time for safety and clear error handling.

## Final Checklist Before Implementation

- [ ] Confirm launch session expiry timing
- [ ] Confirm timestamp preferences (original vs current)
- [ ] Confirm resourceLinkId value
- [ ] Confirm file size format
- [ ] Confirm MIME type mapping approach
- [ ] Confirm Turnitin queuing strategy
- [ ] Confirm duplicate detection approach
- [ ] Confirm failed CSV format (with Error column?)
- [ ] Confirm batch processing approach

## Implementation Order

1. Set up file structure and dependencies
2. Create data loading functions (Excel, CSV, DB)
3. Create assessment matching logic
4. Create file download/upload functions
5. Create database insert functions (with transaction support)
6. Create main processing loop
7. Add logging and error handling
8. Add Turnitin job queuing
9. Test with small subset
10. Run full migration

---

**Please confirm answers to the questions above, and we can proceed with implementation!**

