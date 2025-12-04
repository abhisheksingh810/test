# Rogo Submissions Migration

This script migrates submissions from Rogo into the new assessment platform database.

## Prerequisites

1. Ensure you have the required input files in the `data-migration` folder:
   - `rogo_submissions_data.xlsx` - Main submission data
   - `submission_files.csv` - File URLs and metadata (optional - files will be scraped from Rogo if not found)

2. Ensure environment variables are set:
   - `DATABASE_URL` - PostgreSQL connection string
   - `AZURE_STORAGE_CONNECTION_STRING` - Azure Blob Storage connection string
   - `ROGO_URL` - Rogo platform URL (required if scraping files)
   - `ROGO_LOGIN_EMAIL` - Rogo login email (required if scraping files)
   - `ROGO_LOGIN_PASS` - Rogo login password (required if scraping files)
   - `ROGO_ATTEMPT_PAGE_URL` - Base URL for attempt pages (e.g., `https://rogo.example.com/Attempt`) (required if scraping files)

3. Install dependencies:
   ```bash
   npm install
   ```
   
   **Note:** The migration script requires additional dependencies for Rogo scraping:
   - `puppeteer` - For browser automation
   - `exceljs` - For Excel file processing (used by scraper)
   - `axios` - For HTTP requests (used by scraper)
   
   These are automatically installed with `npm install`.

## Running the Migration

```bash
npm run migrate:rogo
```

Or run directly:
```bash
npx tsx data-migration/migrate-rogo-submissions.ts
```

## Output Files

The script generates two output files:

1. **`migrated.csv`** - Successfully migrated submissions with:
   - Attempt ID
   - Launch ID
   - Submission ID
   - Session Record ID

2. **`submissions_failed_migration.csv`** - Failed submissions with:
   - All original columns from Excel
   - Error column with failure reason

## How It Works

1. **Loads data** from Excel and CSV files
2. **Loads assessments** from database to match assessment codes
3. **For each submission**:
   - Validates attempt hasn't been migrated (checks `migrated.csv`)
   - Extracts assessment code from submission name
   - **Checks for files in CSV**:
     - If files exist in CSV: Downloads from URLs and uploads to Azure
     - If files NOT in CSV: **Scrapes files from Rogo** using Puppeteer, then uploads to Azure
   - Creates all database records in a single transaction:
     - `lti_launch_sessions`
     - `lti_session_records`
     - `assignment_submissions`
     - `submission_files`
     - `submission_marking_assignments`
   - Queues Turnitin jobs for all files
4. **Writes output files** with results

## Error Handling

- If a submission fails at any step, it's added to `submissions_failed_migration.csv`
- File download/upload failures cause the submission to fail
- Database transaction failures cause rollback and failure logging
- Turnitin job queuing failures are logged but don't fail the migration

## Resuming Migration

If the script is interrupted, you can rerun it. It will:
- Load existing `migrated.csv` to skip already-migrated attempts
- Continue processing remaining submissions
- Append new results to the CSV files

## Notes

- Files are uploaded to the `rogoreplacement` container in Azure
- Launch sessions expire 1 hour after the original submission time
- File upload timestamps are set to the original submission completion time
- Assessment matching uses exact prefix matching on assessment names

