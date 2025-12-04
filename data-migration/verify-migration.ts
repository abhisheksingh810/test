console.log('📦 Loading verification script...');

import "dotenv/config";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../server/db';
import { 
  ltiLaunchSessions,
  ltiSessionRecords,
  assignmentSubmissions,
  submissionFiles,
  submissionMarkingAssignments,
  submissionSectionMarks,
  submissionGrades,
} from '../shared/schema';
import { like, eq, sql } from 'drizzle-orm';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple CSV parser
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
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
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function verifyMigration() {
  console.log('🔍 Starting migration verification...\n');

  const migratedCsvPath = path.join(__dirname, 'migrated.csv');
  
  if (!fs.existsSync(migratedCsvPath)) {
    console.log('❌ migrated.csv not found. Run migration first.');
    process.exit(1);
  }

  // Load migrated.csv
  console.log('📂 Loading migrated.csv...');
  const csvContent = fs.readFileSync(migratedCsvPath, 'utf-8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());
  if (csvLines.length <= 1) {
    console.log('⚠️  No migrated records found in migrated.csv');
    process.exit(0);
  }

  const headers = parseCSVLine(csvLines[0]);
  const migratedRecords: Array<{ 'Attempt ID': string; 'Launch ID': string; 'Submission ID': string }> = [];
  
  for (let i = 1; i < csvLines.length; i++) {
    const values = parseCSVLine(csvLines[i]);
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    if (row['Attempt ID'] && row['Launch ID']) {
      migratedRecords.push({
        'Attempt ID': row['Attempt ID'],
        'Launch ID': row['Launch ID'],
        'Submission ID': row['Submission ID'],
      });
    }
  }

  console.log(`✅ Loaded ${migratedRecords.length} migrated records\n`);

  // Verification checks
  let totalChecked = 0;
  let totalPassed = 0;
  const failures: Array<{ attemptId: string; check: string; issue: string }> = [];

  console.log('🔍 Running verification checks...\n');

  for (const record of migratedRecords) {
    const attemptId = record['Attempt ID'];
    const launchId = record['Launch ID'];
    const submissionId = record['Submission ID'];

    console.log(`[${totalChecked + 1}/${migratedRecords.length}] Checking Attempt ID: ${attemptId}...`);

    let recordPassed = true;

    // Check 1: Launch ID prefix
    if (!launchId.startsWith(`rogo_${attemptId}_`)) {
      failures.push({
        attemptId,
        check: 'Launch ID Prefix',
        issue: `Launch ID "${launchId}" does not start with "rogo_${attemptId}_"`
      });
      recordPassed = false;
    }

    // Check 2: LTI Launch Session exists
    try {
      const [launchSession] = await db
        .select()
        .from(ltiLaunchSessions)
        .where(eq(ltiLaunchSessions.launchId, launchId))
        .limit(1);

      if (!launchSession) {
        failures.push({
          attemptId,
          check: 'LTI Launch Session',
          issue: 'LTI launch session not found in database'
        });
        recordPassed = false;
      } else {
        // Verify toolConsumerInstanceGuid
        if (launchSession.toolConsumerInstanceGuid !== '79755547-2e38-493d-8b22-75d268777b4a') {
          failures.push({
            attemptId,
            check: 'Tool Consumer Instance GUID',
            issue: `Expected "79755547-2e38-493d-8b22-75d268777b4a", got "${launchSession.toolConsumerInstanceGuid}"`
          });
          recordPassed = false;
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'LTI Launch Session Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    // Check 3: LTI Session Record exists
    try {
      const [sessionRecord] = await db
        .select()
        .from(ltiSessionRecords)
        .where(eq(ltiSessionRecords.launchId, launchId))
        .limit(1);

      if (!sessionRecord) {
        failures.push({
          attemptId,
          check: 'LTI Session Record',
          issue: 'LTI session record not found in database'
        });
        recordPassed = false;
      } else {
        // Verify hasFileSubmission
        if (sessionRecord.hasFileSubmission !== 'true') {
          failures.push({
            attemptId,
            check: 'Has File Submission',
            issue: `Expected "true", got "${sessionRecord.hasFileSubmission}"`
          });
          recordPassed = false;
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'LTI Session Record Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    // Check 4: Assignment Submission exists
    try {
      const [submission] = await db
        .select()
        .from(assignmentSubmissions)
        .where(eq(assignmentSubmissions.id, submissionId))
        .limit(1);

      if (!submission) {
        failures.push({
          attemptId,
          check: 'Assignment Submission',
          issue: 'Assignment submission not found in database'
        });
        recordPassed = false;
      } else {
        // Verify fileCount > 0
        if (submission.fileCount === 0) {
          failures.push({
            attemptId,
            check: 'File Count',
            issue: `File count is 0, expected > 0`
          });
          recordPassed = false;
        }

        // Verify lmsUserId format (should be prefixed)
        if (submission.lmsUserId && !submission.lmsUserId.includes('::')) {
          failures.push({
            attemptId,
            check: 'LMS User ID Format',
            issue: `LMS User ID "${submission.lmsUserId}" does not contain "::" separator`
          });
          recordPassed = false;
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'Assignment Submission Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    // Check 5: Submission Files exist
    try {
      const files = await db
        .select()
        .from(submissionFiles)
        .where(eq(submissionFiles.submissionId, submissionId));

      if (files.length === 0) {
        failures.push({
          attemptId,
          check: 'Submission Files',
          issue: 'No submission files found'
        });
        recordPassed = false;
      } else {
        // Verify at least one learner file
        const learnerFiles = files.filter(f => f.submissionFileType === 'submission');
        if (learnerFiles.length === 0) {
          failures.push({
            attemptId,
            check: 'Learner Files',
            issue: 'No learner submission files found'
          });
          recordPassed = false;
        }

        // Verify file URLs are valid
        for (const file of files) {
          if (!file.fileUrl || !file.fileUrl.startsWith('https://')) {
            failures.push({
              attemptId,
              check: 'File URL',
              issue: `Invalid file URL for file "${file.fileName}": ${file.fileUrl}`
            });
            recordPassed = false;
          }
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'Submission Files Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    // Check 6: Marking Assignment exists
    try {
      const [markingAssignment] = await db
        .select()
        .from(submissionMarkingAssignments)
        .where(eq(submissionMarkingAssignments.submissionId, submissionId))
        .limit(1);

      if (!markingAssignment) {
        failures.push({
          attemptId,
          check: 'Marking Assignment',
          issue: 'Marking assignment not found'
        });
        recordPassed = false;
      } else {
        // Verify marking status is 'released'
        if (markingAssignment.markingStatus !== 'released') {
          failures.push({
            attemptId,
            check: 'Marking Status',
            issue: `Expected "released", got "${markingAssignment.markingStatus}"`
          });
          recordPassed = false;
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'Marking Assignment Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    // Check 7: Submission Section Marks exist
    try {
      const sectionMarks = await db
        .select()
        .from(submissionSectionMarks)
        .where(eq(submissionSectionMarks.submissionId, submissionId));

      if (sectionMarks.length === 0) {
        failures.push({
          attemptId,
          check: 'Section Marks',
          issue: 'No section marks found'
        });
        recordPassed = false;
      } else {
        // Verify marks are valid numbers
        for (const mark of sectionMarks) {
          if (mark.marksAwarded === null || mark.marksAwarded === undefined || isNaN(mark.marksAwarded)) {
            failures.push({
              attemptId,
              check: 'Section Marks Validity',
              issue: `Invalid marks awarded for section ${mark.sectionId}: ${mark.marksAwarded}`
            });
            recordPassed = false;
          }
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'Section Marks Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    // Check 8: Submission Grade exists
    try {
      const [grade] = await db
        .select()
        .from(submissionGrades)
        .where(eq(submissionGrades.submissionId, submissionId))
        .limit(1);

      if (!grade) {
        failures.push({
          attemptId,
          check: 'Submission Grade',
          issue: 'Submission grade not found'
        });
        recordPassed = false;
      } else {
        // Verify isComplete is true
        if (!grade.isComplete) {
          failures.push({
            attemptId,
            check: 'Grade Completion',
            issue: 'Grade is not marked as complete'
          });
          recordPassed = false;
        }

        // Verify finalGrade is set
        if (!grade.finalGrade || grade.finalGrade.trim() === '') {
          failures.push({
            attemptId,
            check: 'Final Grade',
            issue: 'Final grade is missing or empty'
          });
          recordPassed = false;
        }

        // Verify marks are valid
        if (grade.totalMarksAwarded === null || grade.totalMarksAwarded === undefined || isNaN(grade.totalMarksAwarded)) {
          failures.push({
            attemptId,
            check: 'Total Marks Awarded',
            issue: `Invalid total marks awarded: ${grade.totalMarksAwarded}`
          });
          recordPassed = false;
        }
      }
    } catch (error) {
      failures.push({
        attemptId,
        check: 'Submission Grade Query',
        issue: `Database error: ${error instanceof Error ? error.message : String(error)}`
      });
      recordPassed = false;
    }

    totalChecked++;
    if (recordPassed) {
      totalPassed++;
      console.log(`  ✅ All checks passed`);
    } else {
      console.log(`  ❌ Some checks failed`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Verification Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${totalPassed}/${totalChecked}`);
  console.log(`❌ Failed: ${totalChecked - totalPassed}/${totalChecked}`);
  console.log(`📁 Total checked: ${totalChecked}`);

  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    failures.forEach(f => {
      console.log(`  - Attempt ID ${f.attemptId}: ${f.check} - ${f.issue}`);
    });

    // Write failures to file
    const failuresPath = path.join(__dirname, 'verification_failures.csv');
    const failuresCsv = [
      'Attempt ID,Check,Issue',
      ...failures.map(f => `${f.attemptId},"${f.check}","${f.issue.replace(/"/g, '""')}"`)
    ].join('\n');
    fs.writeFileSync(failuresPath, failuresCsv, 'utf-8');
    console.log(`\n📝 Failures written to verification_failures.csv`);
  }

  // Count by launch_id prefix
  console.log('\n📊 Count by Launch ID Prefix:');
  const prefixCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(ltiLaunchSessions)
    .where(like(ltiLaunchSessions.launchId, 'rogo_%'));
  
  console.log(`  Total submissions with "rogo_" prefix: ${prefixCount[0]?.count || 0}`);

  console.log('='.repeat(60));

  if (totalPassed === totalChecked) {
    console.log('\n✅ All verifications passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some verifications failed. Review failures above.');
    process.exit(1);
  }
}

// Run verification
verifyMigration()
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  });

export { verifyMigration };

