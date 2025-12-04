console.log('📦 Loading file migration script...');

import "dotenv/config";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../server/db';
import { getAzureBlobService, initializeAzureBlobService } from '../server/services/azureBlobService';
import { 
  submissionFiles as submissionFilesTable,
} from '../shared/schema';
import { eq } from 'drizzle-orm';

// Helper function to get content type based on file extension (reused from routes.ts)
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

// Download file from URL
async function downloadFileFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Extract file extension from filename
function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

// Simple CSV parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
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
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim()); // Add last field
  return result;
}

// Main migration function
async function migrateStagingFiles() {
  console.log('🚀 Starting staging files migration...\n');

  // Get current directory (ES module compatible)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = __dirname;
  const csvPath = path.join(dataDir, 'migrated_submission_ids.csv');
  const failedCsvPath = path.join(dataDir, 'failed.csv');
  const successfulCsvPath = path.join(dataDir, 'successful.csv');

  // Load CSV file with submission IDs
  console.log('📂 Loading migrated_submission_ids.csv...');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());
  
  if (csvLines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse CSV - handle both header row and simple list formats
  const headers = parseCSVLine(csvLines[0]);
  const submissionIdColumnIndex = headers.findIndex(h => 
    h.toLowerCase().includes('submission') && h.toLowerCase().includes('id')
  );
  
  // Determine if first line is a header or data
  const hasHeader = submissionIdColumnIndex >= 0 || 
    (headers.length === 1 && headers[0].toLowerCase().includes('submission'));
  
  const startIndex = hasHeader ? 1 : 0;
  
  if (hasHeader && submissionIdColumnIndex === -1) {
    console.log('⚠️  Header detected but no "submission_id" column found, assuming first column contains submission IDs');
  } else if (!hasHeader) {
    console.log('ℹ️  No header detected, assuming first column contains submission IDs');
  }

  const submissionIds: string[] = [];
  for (let i = startIndex; i < csvLines.length; i++) {
    const values = parseCSVLine(csvLines[i]);
    const submissionId = submissionIdColumnIndex >= 0 
      ? values[submissionIdColumnIndex] 
      : values[0];
    if (submissionId && submissionId.trim()) {
      submissionIds.push(submissionId.trim());
    }
  }
  
  console.log(`✅ Loaded ${submissionIds.length} submission IDs from CSV\n`);

  // Initialize Azure Blob Service (production)
  console.log('📂 Initializing Azure Blob Service (production)...');
  await initializeAzureBlobService();
  const azureService = getAzureBlobService();
  console.log('✅ Azure Blob Service initialized\n');

  // Track failed and successful submissions
  const failedSubmissionIds: string[] = [];
  const successfulSubmissionIds: string[] = [];
  let successCount = 0;
  let failedCount = 0;
  let totalFilesProcessed = 0;
  let totalFilesMigrated = 0;

  // Process each submission ID
  for (let i = 0; i < submissionIds.length; i++) {
    const submissionId = submissionIds[i];
    console.log(`\n[${i + 1}/${submissionIds.length}] Processing submission ${submissionId}...`);

    try {
      // Fetch all submission files for this submission
      const files = await db
        .select()
        .from(submissionFilesTable)
        .where(eq(submissionFilesTable.submissionId, submissionId))
        .orderBy(submissionFilesTable.uploadOrder);

      if (files.length === 0) {
        console.log(`  ⚠️  No files found for submission ${submissionId}, skipping...`);
        continue;
      }

      console.log(`  📎 Found ${files.length} file(s) for submission ${submissionId}`);

      let submissionFailed = false;
      let filesMigrated = 0;

      // Process each file
      for (let j = 0; j < files.length; j++) {
        const file = files[j];
        totalFilesProcessed++;

        console.log(`    [${j + 1}/${files.length}] Processing file: ${file.fileName}`);

        // Check if file_url starts with staging URL
        if (!file.fileUrl || !file.fileUrl.startsWith('https://rogoreplacement.blob.core.windows.net')) {
          console.log(`    ⏭️  File URL does not start with staging URL, skipping: ${file.fileUrl}`);
          continue;
        }

        try {
          // Download file from staging URL
          console.log(`    📥 Downloading from staging: ${file.fileUrl}`);
          const fileBuffer = await downloadFileFromUrl(file.fileUrl);
          const fileSizeBytes = fileBuffer.length;
          console.log(`    ✅ Downloaded ${formatFileSize(fileSizeBytes)}`);

          // Extract file extension and determine MIME type
          const fileExtension = getFileExtension(file.fileName);
          const fileMimeType = getContentType(fileExtension);

          // Upload to production Azure Blob Storage
          console.log(`    📤 Uploading to production storage...`);
          const uploadResult = await azureService.uploadFile({
            fileName: file.fileName,
            fileBuffer,
            contentType: fileMimeType,
            metadata: {
              submissionId: submissionId,
              migratedFrom: 'staging',
              originalFileUrl: file.fileUrl,
            },
            folder: 'LTI_Uploads', // Use same folder as regular uploads
          });

          console.log(`    ✅ Uploaded to production: ${uploadResult.blobName}`);

          // Update database record with new URLs
          await db
            .update(submissionFilesTable)
            .set({
              fileUrl: uploadResult.url,
              azureBlobUrl: uploadResult.url,
              azureBlobName: uploadResult.blobName,
              azureContainerName: 'rogoreplacement', // Production container
              fileSize: formatFileSize(fileSizeBytes), // Update file size if needed
            })
            .where(eq(submissionFilesTable.id, file.id));

          console.log(`    ✅ Database record updated`);

          // Call retry Turnitin API
          try {
            const productionCookie = process.env.PRODUCTION_APP_COOKIE;
            if (!productionCookie) {
              console.log(`    ⚠️  PRODUCTION_APP_COOKIE not set, skipping Turnitin retry API call`);
            } else {
              console.log(`    🔄 Calling Turnitin retry API...`);
              const retryUrl = `https://aap.avadolearning.com/api/submissions/${submissionId}/files/${file.id}/retry-turnitin`;
              const response = await fetch(retryUrl, {
                method: 'GET',
                headers: {
                  'cookie': productionCookie,
                },
              });

              if (!response.ok) {
                throw new Error(`API returned status ${response.status}: ${response.statusText}`);
              }

              console.log(`    ✅ Turnitin retry API called successfully`);
            }
          } catch (turnitinError) {
            // Log error but don't fail the migration
            console.error(`    ⚠️  Failed to call Turnitin retry API:`, 
              turnitinError instanceof Error ? turnitinError.message : String(turnitinError));
          }

          filesMigrated++;
          totalFilesMigrated++;

        } catch (fileError) {
          console.error(`    ❌ Failed to migrate file ${file.fileName}:`, 
            fileError instanceof Error ? fileError.message : String(fileError));
          submissionFailed = true;
        }
      }

      if (submissionFailed) {
        console.log(`  ❌ Submission ${submissionId} had file migration failures`);
        failedSubmissionIds.push(submissionId);
        failedCount++;
      } else if (filesMigrated > 0) {
        console.log(`  ✅ Successfully migrated ${filesMigrated} file(s) for submission ${submissionId}`);
        successfulSubmissionIds.push(submissionId);
        successCount++;
      } else {
        console.log(`  ⏭️  No files needed migration for submission ${submissionId}`);
      }

    } catch (error) {
      console.error(`  ❌ Failed to process submission ${submissionId}:`, 
        error instanceof Error ? error.message : String(error));
      failedSubmissionIds.push(submissionId);
      failedCount++;
    }
  }

  // Write failed CSV
  if (failedSubmissionIds.length > 0) {
    console.log('\n📝 Writing failed.csv...');
    const failedCsv = [
      'submission_id',
      ...failedSubmissionIds.map(id => id),
    ].join('\n');
    fs.writeFileSync(failedCsvPath, failedCsv, 'utf-8');
    console.log(`✅ Wrote ${failedSubmissionIds.length} failed submission IDs to failed.csv`);
  }

  // Write successful CSV
  if (successfulSubmissionIds.length > 0) {
    console.log('\n📝 Writing successful.csv...');
    const successfulCsv = [
      'submission_id',
      ...successfulSubmissionIds.map(id => id),
    ].join('\n');
    fs.writeFileSync(successfulCsvPath, successfulCsv, 'utf-8');
    console.log(`✅ Wrote ${successfulSubmissionIds.length} successful submission IDs to successful.csv`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`✅ Successful submissions: ${successCount}`);
  console.log(`❌ Failed submissions: ${failedCount}`);
  console.log(`📁 Total submissions processed: ${submissionIds.length}`);
  console.log(`📄 Total files processed: ${totalFilesProcessed}`);
  console.log(`📄 Total files migrated: ${totalFilesMigrated}`);
  console.log('='.repeat(60));
}

// Run migration when script is executed directly
migrateStagingFiles()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  });

export { migrateStagingFiles };

