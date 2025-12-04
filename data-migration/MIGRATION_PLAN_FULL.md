# Full Rogo Submission Migration Plan

## Overview
Migrate previously-scraped Rogo submissions with complete marking data from the Data Warehouse (MySQL) to the new PostgreSQL system. This migration includes learner files, marker feedback files, section marks, and overall grades.

## Prerequisites

### Input Files
1. **submission_files.csv** - Contains learner information and file metadata
   - Columns: Membership Number, First Name, Surname, Learner Email, Attempt ID, Unit Code, Assessment ID, Course Title, Attempt Number, Rogo User ID, Rogo User Name, Learner Files Count, Learner File Names, Learner File URLs, Learner Azure Blob Names, Learner Azure Blob URLs, Marker Files Count, Marker File Names, Marker File URLs, Marker Azure Blob Names, Marker Azure Blob URLs, Timestamp, Error

2. **attempt_number_mapping.csv** - Maps Attempt IDs to attempt numbers
   - Columns: Attempt ID, Unit Code, Unit Code Version, Assessment ID, Submission

### Data Sources
- **PostgreSQL Database** (target) - Assessment platform database
- **MySQL Data Warehouse** (source) - Contains marking data
  - Connection string: `DATA_WAREHOUSE_CONNECTION_STRING` environment variable
  - Tables:
    - `Rogo_AssessmentReport` - Overall submission and marker metadata
    - `Rogo_AssessmentReportScores` - Per-question/section scores

### Output Files
- **migrated.csv** - Successful migrations (Attempt ID, Launch ID, Submission ID, Session Record ID, User ID, LTI Context ID)
- **submissions_failed_migration.csv** - Failed rows with full CSV data + Error column

## Key Mappings & Constants

### Constants
- **LMS Instance ID**: `79755547-2e38-493d-8b22-75d268777b4a`
- **Tool Consumer Instance GUID**: `79755547-2e38-493d-8b22-75d268777b4a` (same as LMS Instance ID)

### ID Prefixing Rules
1. **TI IDs**: All `TIUserId` and `TISectionId` values from warehouse must be prefixed with LMS Instance ID:
   - Format: `79755547-2e38-493d-8b22-75d268777b4a::${TIUserId}`
   - Format: `79755547-2e38-493d-8b22-75d268777b4a::${TISectionId}`

2. **userId in lti_launch_sessions**: Must use prefixed `TIUserId`:
   - `userId = 79755547-2e38-493d-8b22-75d268777b4a::${TIUserId}`
   - If `TIUserId` is null, fallback to CSV values

3. **lmsUserId**: Must use prefixed `TIUserId` in all tables:
   - `lti_session_records.lmsUserId = 79755547-2e38-493d-8b22-75d268777b4a::${TIUserId}`
   - `assignment_submissions.lmsUserId = 79755547-2e38-493d-8b22-75d268777b4a::${TIUserId}`
   - Any other tables using LMS user identifier

4. **contextId**: Must use prefixed `TISectionId`:
   - `contextId = 79755547-2e38-493d-8b22-75d268777b4a::${TISectionId}`
   - Format: `ti instance id::TISectionId`
   - If `TISectionId` is null, generate default

5. **toolConsumerInstanceGuid**: Always set to `79755547-2e38-493d-8b22-75d268777b4a` for all records

6. **finalGrade**: Set to `Grade` column from `Rogo_AssessmentReport` table

7. **marking_status**: Set to `'released'` in `submission_marking_assignments` (not `'approval_needed'`)

## Data Warehouse Table Schemas

### Rogo_AssessmentReport
Expected columns (exact names to be confirmed):
- `AttemptId` (INT/VARCHAR) - Primary lookup key
- `TIUserId` (VARCHAR) - Turnitin User ID (GUID format) - **MUST be prefixed before use**
- `TISectionId` (VARCHAR) - Turnitin Section ID (GUID format) - **MUST be prefixed before use**
- `Exercise` (VARCHAR) - Assessment name (e.g., "5HR03 PQ")
- `MarksAchieved` or `MarksAwarded` (DECIMAL/INT) - Total marks awarded
- `MarksAvailable` (DECIMAL/INT) - Total marks possible
- `GradePercent` (DECIMAL) - Percentage score
- `Grade` (VARCHAR) - Final grade label (e.g., "Pass", "Merit") - **Used for finalGrade**
- `MarkerNotes` (TEXT) - Overall feedback/summary
- `ResultsApproved` (DATETIME) - Completion timestamp
- `DateInserted` (DATETIME) - Creation timestamp
- `DateModified` (DATETIME) - Last update timestamp
- Additional marker metadata fields

### Rogo_AssessmentReportScores
Expected columns (exact names to be confirmed):
- `AttemptId` (INT/VARCHAR) - Foreign key to Rogo_AssessmentReport
- `ScoreLabelCorrected` (VARCHAR) - Question/section label (matches assessment_sections.questionText)
- `Score` (DECIMAL/INT) - Marks awarded for this section
- `MarkerComment` (TEXT) - Feedback for this section
- `DateInserted` (DATETIME) - Creation timestamp
- `DateModified` (DATETIME) - Last update timestamp

## Migration Steps

### Step 1: Initialize Connections and Load Data

1. **Load CSV files**
   - Parse `submission_files.csv` into memory
   - Parse `attempt_number_mapping.csv` into memory (create lookup map: Attempt ID → Unit Code Version)
   - Load existing `migrated.csv` if exists (skip already migrated attempts)

2. **Initialize database connections**
   - PostgreSQL: Use existing `db` from `server/db`
   - MySQL Data Warehouse: Create connection using `DATA_WAREHOUSE_CONNECTION_STRING`
     ```typescript
     import mysql from 'mysql2/promise';
     const warehouseDb = await mysql.createConnection(process.env.DATA_WAREHOUSE_CONNECTION_STRING);
     ```

3. **Load assessments from PostgreSQL**
   ```sql
   SELECT id, name, code FROM assessments WHERE is_active = 'true'
   ```

### Step 2: Process Each Row in submission_files.csv

For each row in `submission_files.csv`:

#### 2.1: Validate and Lookup Warehouse Data

1. **Extract Attempt ID** (convert to string for consistency)
   ```typescript
   const attemptId = String(csvRow['Attempt ID']);
   ```

2. **Query Rogo_AssessmentReport**
   ```sql
   SELECT * FROM [dbo].[Rogo_AssessmentReport] WHERE AttemptId = ?
   ```
   - If no row found → **FAIL**: "Missing Rogo_AssessmentReport row for Attempt ID: {attemptId}"
   - Store result as `assessmentReport`

3. **Query Rogo_AssessmentReportScores**
   ```sql
   SELECT * FROM [dbo].[Rogo_AssessmentReportScores] WHERE AttemptId = ?
   ```
   - Store results as `assessmentScores` (array)
   - If empty array and marking is expected → **FAIL**: "Missing Rogo_AssessmentReportScores for Attempt ID: {attemptId}"

#### 2.2: Determine Assessment Code

1. **Extract casPrefix from Exercise**
   ```typescript
   const exercise = assessmentReport.Exercise; // e.g., "5HR03 PQ Attempt 2"
   const casParts = exercise.split(" ");
   const casPrefix = casParts[0] + " " + casParts[1]; // e.g., "5HR03 PQ"
   ```
   - If casParts.length < 2 → **FAIL**: "Invalid Exercise format: {exercise}"

2. **Extract casSuffix from attempt_number_mapping.csv**
   ```typescript
   const mappingRow = attemptNumberMapping.get(attemptId);
   const casSuffix = mappingRow?.['Unit Code Version']; // e.g., "25"
   ```
   - If casSuffix is empty/null → **FAIL**: "Missing Unit Code Version for Attempt ID: {attemptId}"

3. **Filter by Unit Code Version**
   ```typescript
   // Only migrate submissions where Unit Code Version starts with '24' or '25'
   if (!casSuffix.startsWith('24') && !casSuffix.startsWith('25')) {
     // Skip this submission (do not fail, just skip)
     continue;
   }
   ```
   - If Unit Code Version does not start with '24' or '25' → **SKIP** (not a failure, just skip processing)

3. **Search for matching assessment**
   ```typescript
   const matchingAssessment = allAssessments.find(a => 
     a.name.startsWith(casPrefix) && a.name.endsWith(casSuffix)
   );
   ```
   - If not found → **FAIL**: "No assessment found matching prefix '{casPrefix}' and suffix '{casSuffix}'"
   - Store `customAssessmentCode = matchingAssessment.code`

#### 2.3: Extract Attempt Number

From `attempt_number_mapping.csv`:
```typescript
const submissionText = mappingRow['Submission']; // e.g., "Attempt 2"
const attemptNumberMatch = submissionText.match(/Attempt\s+(\d+)/i);
const attemptNumber = attemptNumberMatch ? parseInt(attemptNumberMatch[1]) : null;
```
- If attemptNumber is null → **FAIL**: "Unable to extract attempt number from Submission: {submissionText}"

#### 2.4: Process TI IDs

```typescript
const tiUserId = assessmentReport.TIUserId 
  ? `79755547-2e38-493d-8b22-75d268777b4a::${assessmentReport.TIUserId}`
  : null;
const tiSectionId = assessmentReport.TISectionId
  ? `79755547-2e38-493d-8b22-75d268777b4a::${assessmentReport.TISectionId}`
  : null;
```

#### 2.5: File Transfer

**Learner Files:**
1. Parse comma-separated URLs from `Learner Azure Blob URLs`
2. For each URL:
   - If URL starts with `https://rogoreplacement.blob.core.windows.net`:
     - Download file from URL
     - Upload to production Azure Blob Storage (same logic as unmarked migration)
     - Store new URL and blob name
   - If URL is from different source → **FAIL**: "Unsupported file source: {url}"

**Marker Files:**
1. Parse comma-separated URLs from `Marker Azure Blob URLs`
2. For each URL:
   - If URL starts with `https://rogoreplacement.blob.core.windows.net`:
     - Download file from URL
     - Upload to production Azure Blob Storage
     - Store with `submissionFileType = 'feedback'`
     - Store `uploadedBy = null` (marker ID not available in warehouse)

**Error Handling:**
- If any file download fails → **FAIL**: "File download failed: {fileName}"
- If any file upload fails → **FAIL**: "File upload failed: {fileName}"

#### 2.6: Create Database Records (Single Transaction)

**Transaction Boundary:** All inserts for one submission in a single transaction.

1. **lti_launch_sessions**
   ```typescript
   {
     launchId: generateLaunchId(),
     consumerKey: 'MggwgSmGeNMNnsZmZKUP+Q==',
     userId: tiUserId || csvRow['Rogo User ID'] || csvRow['Learner Email'], // Use prefixed TIUserId
     userEmail: csvRow['Learner Email'],
     userName: `${csvRow['First Name']} ${csvRow['Surname']}`,
     courseName: assessmentReport.Exercise,
     returnUrl: `https://hub.avadolearning.com/learn/lti/consumer/return/${contextIdSuffix}`,
     resourceLinkId: null,
     contextId: constructContextId(tiUserId, tiSectionId), // Use TI IDs if available
     toolConsumerInstanceGuid: extractGuid(contextId),
     customParams: JSON.stringify({ cis: 'AIS', cas: customAssessmentCode }),
     ltiMessageType: 'basic-lti-launch-request',
     contextType: 'CourseSection',
     contextTitle: csvRow['Course Title'] || assessmentReport.Exercise,
     roles: 'Learner',
     lisPersonNameGiven: csvRow['First Name'],
     lisPersonNameFamily: csvRow['Surname'],
     lisPersonNameFull: `${csvRow['First Name']} ${csvRow['Surname']}`,
     lisPersonContactEmailPrimary: csvRow['Learner Email'],
     toolConsumerInstanceName: 'Avado Learning',
     customAction: 'exercise_attempt',
     assignmentTitle: 'Submission Area',
     customInstructionSet: 'AIS',
     customAssessmentCode: customAssessmentCode,
     expiresAt: new Date('2099-12-31'), // Far future for historical records
     createdAt: parseDate(assessmentReport.DateInserted),
   }
   ```

2. **lti_session_records**
   ```typescript
   {
     launchId: launchId, // From step 1
     lmsUserId: tiUserId || csvRow['Rogo User ID'] || csvRow['Learner Email'], // Use prefixed TIUserId
     consumerName: 'Avado Learning',
     role: 'Learner',
     firstName: csvRow['First Name'],
     lastName: csvRow['Surname'],
     fullName: `${csvRow['First Name']} ${csvRow['Surname']}`,
     email: csvRow['Learner Email'],
     customAction: 'exercise_attempt',
     customInstructionSet: 'AIS',
     customAssessmentCode: customAssessmentCode,
     contextType: 'CourseSection',
     contextTitle: csvRow['Course Title'] || assessmentReport.Exercise,
     resourceLinkId: null,
     resourceLinkTitle: csvRow['Course Title'] || assessmentReport.Exercise,
     contextId: tiSectionId || `${LMS_INSTANCE_ID}::${Date.now()}`, // ti instance id::TISectionId
     consumerKey: 'MggwgSmGeNMNnsZmZKUP+Q==',
     toolConsumerInstanceGuid: '79755547-2e38-493d-8b22-75d268777b4a', // Constant
     returnUrl: returnUrl, // From step 1
     hasFileSubmission: 'true',
     sessionExpiry: new Date('2099-12-31'),
     createdAt: parseDate(assessmentReport.DateInserted),
   }
   ```

3. **assignment_submissions**
   ```typescript
   {
     ltiSessionRecordId: sessionRecordId, // From step 2
     ltiLaunchId: launchId,
     fileCount: totalFileCount, // Learner + marker files
     totalFileSize: formatFileSize(totalBytes),
     submittedAt: parseDate(assessmentReport.ResultsApproved || assessmentReport.DateInserted),
     attemptNumber: attemptNumber, // From attempt_number_mapping.csv
     lmsUserId: tiUserId || csvRow['Rogo User ID'] || csvRow['Learner Email'], // Use prefixed TIUserId
     consumerName: 'Avado Learning',
     role: 'Learner',
     firstName: csvRow['First Name'],
     lastName: csvRow['Surname'],
     fullName: `${csvRow['First Name']} ${csvRow['Surname']}`,
     email: csvRow['Learner Email'],
     customInstructionSet: 'AIS',
     customAssessmentCode: customAssessmentCode,
     customAction: 'exercise_attempt',
     contextType: 'CourseSection',
     contextTitle: csvRow['Course Title'] || assessmentReport.Exercise,
     contextId: tiSectionId || `${LMS_INSTANCE_ID}::${Date.now()}`, // ti instance id::TISectionId
     createdAt: parseDate(assessmentReport.DateInserted),
     updatedAt: parseDate(assessmentReport.DateModified || assessmentReport.DateInserted),
   }
   ```

4. **submission_files** (for each learner file)
   ```typescript
   {
     submissionId: submissionId, // From step 3
     fileName: fileName,
     originalFileName: fileName,
     fileSize: formatFileSize(fileBuffer.length),
     fileType: getFileExtension(fileName),
     fileMimeType: getContentType(getFileExtension(fileName)),
     fileUrl: uploadResult.url,
     azureBlobUrl: uploadResult.url,
     azureContainerName: 'rogoreplacement',
     azureBlobName: uploadResult.blobName,
     uploadOrder: orderIndex,
     submissionFileType: 'submission',
     uploadedBy: csvRow['Rogo User ID'] || csvRow['Learner Email'],
     uploadedAt: parseDate(assessmentReport.ResultsApproved || assessmentReport.DateInserted),
   }
   ```

5. **submission_files** (for each marker file)
   ```typescript
   {
     submissionId: submissionId,
     fileName: fileName,
     originalFileName: fileName,
     fileSize: formatFileSize(fileBuffer.length),
     fileType: getFileExtension(fileName),
     fileMimeType: getContentType(getFileExtension(fileName)),
     fileUrl: uploadResult.url,
     azureBlobUrl: uploadResult.url,
     azureContainerName: 'rogoreplacement',
     azureBlobName: uploadResult.blobName,
     uploadOrder: orderIndex, // Continue from learner files
     submissionFileType: 'feedback',
     uploadedBy: null, // Marker ID not available
     uploadedAt: parseDate(assessmentReport.ResultsApproved || assessmentReport.DateInserted),
   }
   ```

6. **submission_marking_assignments**
   ```typescript
   {
     submissionId: submissionId,
     assignedMarkerId: null,
     markingStatus: 'released', // Set to 'released' for completed historical submissions
     statusUpdatedAt: parseDate(assessmentReport.ResultsApproved || assessmentReport.DateModified),
     statusUpdatedBy: null,
     createdAt: parseDate(assessmentReport.DateInserted),
     updatedAt: parseDate(assessmentReport.DateModified || assessmentReport.DateInserted),
   }
   ```

7. **submission_section_marks** (for each score in assessmentScores)
   ```typescript
   // First, get all sections for the assessment
   const sections = await db.select()
     .from(assessmentSections)
     .where(eq(assessmentSections.assessmentId, matchingAssessment.id));
   
   // Validate all scores can be matched BEFORE inserting (fail if any cannot be matched)
   const unmatchedScores: string[] = [];
   for (const scoreRow of assessmentScores) {
     const matchingSection = sections.find(s => 
       s.questionText?.startsWith(scoreRow.ScoreLabelCorrected)
     );
     if (!matchingSection) {
       unmatchedScores.push(scoreRow.ScoreLabelCorrected);
     }
   }
   
   // FAIL if any scores cannot be matched
   if (unmatchedScores.length > 0) {
     throw new Error(`Cannot match ScoreLabelCorrected to assessment sections: ${unmatchedScores.join(', ')}`);
   }
   
   // Insert all section marks (all validated above)
   for (const scoreRow of assessmentScores) {
     const matchingSection = sections.find(s => 
       s.questionText?.startsWith(scoreRow.ScoreLabelCorrected)
     )!; // Safe to use ! since validated above
     
     {
       submissionId: submissionId,
       sectionId: matchingSection.id,
       markerId: null, // Marker ID not available in warehouse
       selectedOptionId: null, // Not available in warehouse
       feedback: scoreRow.MarkerComment || null,
       marksAwarded: parseFloat(scoreRow.Score) || 0,
       markingCriterias: null, // Not available in warehouse
       createdAt: parseDate(scoreRow.DateInserted),
       updatedAt: parseDate(scoreRow.DateModified || scoreRow.DateInserted),
     }
   }
   ```

8. **submission_grades**
   ```typescript
   {
     submissionId: submissionId,
     assessmentId: matchingAssessment.id,
     markerId: null, // Marker ID not available in warehouse
     totalMarksAwarded: parseFloat(assessmentReport.MarksAchieved || assessmentReport.MarksAwarded) || 0,
     totalMarksPossible: parseFloat(assessmentReport.MarksAvailable) || 0,
     percentageScore: parseFloat(assessmentReport.GradePercent) || 0,
     finalGrade: assessmentReport.Grade || null, // Use Grade from Rogo_AssessmentReport
     overallSummary: assessmentReport.MarkerNotes || null,
     skipReasonId: null,
     skippedReason: null,
     malpracticeLevelId: null,
     malpracticeNotes: null,
     wordCount: null, // Not available in warehouse
     isComplete: true, // Marking is complete
     completedAt: parseDate(assessmentReport.ResultsApproved),
     createdAt: parseDate(assessmentReport.DateInserted),
     updatedAt: parseDate(assessmentReport.DateModified || assessmentReport.DateInserted),
   }
   ```

**Transaction Rollback:**
- If any insert fails, rollback entire transaction
- Append CSV row to `submissions_failed_migration.csv` with error message
- Continue to next row

### Step 3: Error Handling and Reporting

**Failure Conditions:**
1. Missing `Rogo_AssessmentReport` row
2. Missing `Rogo_AssessmentReportScores` (if expected)
3. Unable to determine `customAssessmentCode` (missing casPrefix/casSuffix or no matching assessment)
4. **Any `ScoreLabelCorrected` value cannot be matched to an assessment section** (no `assessment_sections.questionText` starts with the value)
5. File download/upload errors
6. Database transaction failures
7. Missing required CSV columns
8. Invalid date formats in warehouse
9. Missing `TIUserId` when required for userId/lmsUserId mapping

**Failed CSV Format:**
- Include all original columns from `submission_files.csv`
- Add `Error` column with failure reason
- Write to `submissions_failed_migration.csv`

**Success Tracking:**
- Write to `migrated.csv`: Attempt ID, Launch ID, Submission ID, Session Record ID, User ID, LTI Context ID

## Date Parsing

Warehouse dates are in format: `2025-11-03 13:05:00.000` or `2025-11-15 01:37:18.873`

```typescript
function parseDate(dateString: string | null | undefined): Date {
  if (!dateString) return new Date();
  // Handle MySQL datetime format
  return new Date(dateString);
}
```

## Behavior Summary

### Migration Filter
- **Unit Code Version Filter**: Only submissions where "Unit Code Version" from `attempt_number_mapping.csv` starts with '24' or '25' are migrated
- Submissions with other Unit Code Versions are skipped (not failed, just not processed)
- This filter is applied early in the processing, before any database operations

### ID Handling
- **All TI IDs must be prefixed**: `TIUserId` and `TISectionId` from warehouse are prefixed with `79755547-2e38-493d-8b22-75d268777b4a::` before use
- **userId in lti_launch_sessions**: Uses prefixed `TIUserId` (fallback to CSV if null)
- **lmsUserId**: Uses prefixed `TIUserId` in all tables (lti_session_records, assignment_submissions, etc.)
- **toolConsumerInstanceGuid**: Always set to constant `79755547-2e38-493d-8b22-75d268777b4a` (not derived from contextId)

### Marking Status
- **marking_status**: Set to `'released'` (not `'approval_needed'`) for all completed historical submissions

### Grade Assignment
- **finalGrade**: Set directly from `Rogo_AssessmentReport.Grade` column (not calculated)

### Failure Conditions
- **Section Matching**: If ANY `ScoreLabelCorrected` value cannot be matched to an assessment section (no `questionText` starts with it), the entire submission fails and is written to `submissions_failed_migration.csv`
- All other failure conditions remain the same (missing warehouse data, assessment code resolution, file errors, etc.)

## Assumptions and Missing Data

### Assumptions
1. All warehouse dates are in UTC
2. `TIUserId` and `TISectionId` are optional (may be null)
3. Marker IDs are not available in warehouse (set to null)
4. `ScoreLabelCorrected` in warehouse matches `questionText` prefix in `assessment_sections`
5. All files from `rogoreplacement.blob.core.windows.net` need to be re-uploaded to production
6. Attempt numbers are correctly extracted from `attempt_number_mapping.csv`

### Missing Data / Questions
1. **Exact column names in warehouse tables** - Need SQL CREATE TABLE statements or sample data
2. **Context ID construction** - How to construct if TI IDs are null?
3. **Turnitin job queuing** - Should we queue Turnitin jobs after migration? (Probably not for historical data)
4. **Rate limiting** - Should we add delays between file downloads/uploads?
5. **Parallelism** - Process one submission at a time or batch?

## Recommendations

1. **Transaction Boundaries:** One transaction per submission (all-or-nothing)
2. **File Processing:** Download and upload all files BEFORE starting database transaction
3. **Error Recovery:** Continue processing remaining rows even if one fails
4. **Logging:** Log all operations with attempt ID for debugging
5. **Verification:** After migration, verify counts match expected numbers
6. **Rate Limiting:** Add 100ms delay between file operations to avoid overwhelming Azure
7. **Parallelism:** Process sequentially (one submission at a time) for safety

## Implementation Checklist

- [ ] Install `mysql2` package for MySQL connection
- [ ] Create MySQL connection utility
- [ ] Implement CSV parsing for both input files
- [ ] Implement warehouse data lookup functions
- [ ] Implement assessment code resolution
- [ ] Implement file download/upload with error handling
- [ ] Implement database transaction with all inserts
- [ ] Implement section matching logic (ScoreLabelCorrected → questionText)
- [ ] Implement date parsing utility
- [ ] Implement error reporting and CSV writing
- [ ] Add comprehensive logging
- [ ] Test with small subset of data
- [ ] Run full migration

