# Migration Risk Assessment & Gap Analysis

## Executive Summary

This document identifies potential issues, missing elements, and risks in the Rogo submission migration plan. It addresses system recognition, data integrity, and operational impact concerns.

## Critical Issues & Missing Elements

### 1. **Session Expiry Validation** ⚠️ MEDIUM RISK

**Issue**: The system validates session expiry in `/api/lti/validate-eligibility`:
```typescript
if (new Date() > sessionRecord.sessionExpiry) {
  return res.status(401).json({ message: "LTI session expired" });
}
```

**Current Implementation**: Sets `expiresAt` and `sessionExpiry` to `2099-12-31` (far future)

**Risk**: Low - Far future date should pass validation, but this is a workaround for historical data.

**Recommendation**: ✅ Current approach is acceptable for historical migrations.

---

### 2. **Return URL Construction** ⚠️ MEDIUM RISK

**Issue**: Return URL is constructed from `contextIdSuffix`:
```typescript
const returnUrl = `https://hub.avadolearning.com/learn/lti/consumer/return/${contextIdSuffix}`;
```

**Problem**: If `TISectionId` is null, `contextId` becomes `${LMS_INSTANCE_ID}::${Date.now()}`, and `contextIdSuffix` would be a timestamp, creating an invalid return URL.

**Current Implementation**: Uses `parseContextId(contextId)` which will extract the suffix.

**Risk**: Medium - Invalid return URLs won't break the migration but may cause issues if the system validates them.

**Recommendation**: 
- Add validation: If `TISectionId` is null, use a default suffix or log a warning
- Consider using a placeholder suffix like `"migrated"` instead of timestamp

---

### 3. **User Account Existence** ⚠️ HIGH RISK

**Issue**: The migration uses `lmsUserId` and `userId` with prefixed TI IDs, but:
- No validation that users exist in the `users` table
- Foreign keys in `submission_marking_assignments.statusUpdatedBy` reference `users.id`
- The system may query user data for display

**Current Implementation**: Sets `markerId` and `statusUpdatedBy` to `null` (acceptable), but `userId`/`lmsUserId` are stored as text (no foreign key constraint).

**Risk**: Low - Since `userId`/`lmsUserId` are text fields without foreign key constraints, this should work. However, if the system tries to look up users by these IDs, they won't exist.

**Recommendation**: 
- ✅ Current approach is acceptable (text fields, no FK constraint)
- Consider documenting that migrated submissions may not have associated user accounts
- If user lookup is needed, create placeholder user records or handle missing users gracefully

---

### 4. **Assessment Section Matching Logic** ⚠️ HIGH RISK

**Issue**: Section matching uses `startsWith`:
```typescript
s.questionText?.startsWith(scoreRow.ScoreLabelCorrected)
```

**Problems**:
1. **Ambiguous matches**: If `ScoreLabelCorrected = "Question 1"` and there are sections "Question 1" and "Question 10", it will match "Question 1" first (which is correct, but fragile)
2. **Case sensitivity**: `startsWith` is case-sensitive - "Question 1" won't match "question 1"
3. **Whitespace**: Leading/trailing whitespace could cause mismatches
4. **Partial matches**: "Q1" would match "Q10" incorrectly

**Current Implementation**: Fails entire submission if any score cannot be matched.

**Risk**: High - Could fail valid submissions due to minor text differences.

**Recommendation**:
- Add case-insensitive matching: `s.questionText?.toLowerCase().startsWith(scoreRow.ScoreLabelCorrected.toLowerCase())`
- Trim whitespace: `s.questionText?.trim().toLowerCase().startsWith(scoreRow.ScoreLabelCorrected.trim().toLowerCase())`
- Consider exact match first, then fallback to startsWith
- Add logging for all matches to help debug issues

---

### 5. **Missing Assessment Validation** ⚠️ MEDIUM RISK

**Issue**: The migration finds assessments by prefix + suffix match, but:
- No validation that the assessment is active (`isActive = 'true'`)
- No validation that the assessment has sections
- No validation that assessment sections match the scores

**Current Implementation**: Loads only active assessments, but doesn't validate sections exist.

**Risk**: Medium - Could create submissions for assessments without proper section structure.

**Recommendation**:
- ✅ Already loads only active assessments: `.where(eq(assessments.isActive, 'true'))`
- Add validation: Check that assessment has sections before proceeding
- Add validation: Verify section count matches score count (or at least log a warning)

---

### 6. **File Count Consistency** ⚠️ LOW RISK

**Issue**: The system queries for submissions with `fileCount > 0`:
```typescript
gt(assignmentSubmissions.fileCount, 0)
```

**Current Implementation**: Sets `fileCount` to `uploadedFiles.length` (correct).

**Risk**: Low - Implementation is correct, but edge case: What if all files fail to upload but some succeed? The count might be wrong.

**Recommendation**: ✅ Current implementation is correct - files are uploaded before database insert, so count is accurate.

---

### 7. **Duplicate Migration Prevention** ⚠️ MEDIUM RISK

**Issue**: The migration checks `migrated.csv` to skip already-migrated attempts, but:
- What if `migrated.csv` is deleted or corrupted?
- What if the same attempt is in the CSV multiple times?
- What if database has records but CSV doesn't?

**Current Implementation**: 
- Loads `migrated.csv` at startup
- Checks `attemptMapping.has(attemptId)` before processing

**Risk**: Medium - Could re-migrate submissions if CSV is lost.

**Recommendation**:
- Add database check: Query database for existing submissions by `attemptNumber` + `lmsUserId` + `customAssessmentCode` + `contextId`
- Add unique constraint check: Verify no duplicate `launchId` exists
- Consider adding a migration metadata table to track migrations

---

### 8. **Date Timezone Handling** ⚠️ MEDIUM RISK

**Issue**: Warehouse dates are in MySQL datetime format, but:
- Are they UTC or local time?
- PostgreSQL timestamps with timezone - will conversion be correct?
- Historical dates might be in different timezone than current system

**Current Implementation**: 
```typescript
function parseDate(dateString: string | null | undefined): Date {
  if (!dateString) return new Date();
  return new Date(dateString);
}
```

**Risk**: Medium - If warehouse dates are in local time but system expects UTC, times will be wrong.

**Recommendation**:
- Verify warehouse date format and timezone
- Consider adding timezone conversion if needed
- Document timezone assumptions

---

### 9. **Turnitin Job Queuing** ⚠️ LOW RISK

**Issue**: The original migration script queued Turnitin jobs, but the new script doesn't.

**Current Implementation**: No Turnitin job queuing.

**Risk**: Low - Historical submissions may not need Turnitin processing, but if they do, it won't happen automatically.

**Recommendation**:
- Document decision: Should historical submissions be processed by Turnitin?
- If yes, add Turnitin job queuing after successful migration
- If no, document why (historical data, already processed, etc.)

---

### 10. **Missing Validation: Required Fields** ⚠️ MEDIUM RISK

**Issue**: The system may have validation for required fields that aren't being set:
- `customAssessmentCode` - ✅ Set
- `lmsUserId` - ✅ Set (with fallback)
- `contextId` - ✅ Set (with fallback)
- `email` - ✅ Set from CSV
- `customInstructionSet` - ✅ Set to 'AIS'

**Risk**: Low - Most required fields are set, but some might have business logic validation.

**Recommendation**:
- Review system validation rules
- Test with sample data before full migration
- Add validation logging

---

### 11. **Assessment Code Resolution Edge Cases** ⚠️ MEDIUM RISK

**Issue**: Assessment matching uses:
```typescript
a.name.startsWith(casPrefix) && a.name.endsWith(casSuffix)
```

**Problems**:
1. **Multiple matches**: What if multiple assessments match? (Uses `.find()` - takes first)
2. **Partial matches**: "5HR03 PQ" might match "5HR03 PQ Extended" incorrectly
3. **Case sensitivity**: `startsWith`/`endsWith` are case-sensitive

**Current Implementation**: Uses `.find()` which returns first match.

**Risk**: Medium - Could match wrong assessment if naming is ambiguous.

**Recommendation**:
- Add exact match check first: `a.name === `${casPrefix} ${casSuffix}``
- Then fallback to startsWith/endsWith
- Log all matches for review
- Consider case-insensitive matching

---

### 12. **Context ID Format Validation** ⚠️ LOW RISK

**Issue**: The system may validate `contextId` format. The migration creates:
- `79755547-2e38-493d-8b22-75d268777b4a::${TISectionId}` (if TISectionId exists)
- `79755547-2e38-493d-8b22-75d268777b4a::${Date.now()}` (if TISectionId is null)

**Risk**: Low - Format is consistent, but generated IDs might not match expected pattern.

**Recommendation**: ✅ Current format is acceptable, but consider using a more meaningful suffix for null TISectionId cases.

---

### 13. **Marking Status 'released' Validation** ⚠️ LOW RISK

**Issue**: The migration sets `markingStatus = 'released'`, but:
- Does the system have workflows that expect certain status transitions?
- Will 'released' status allow viewing results?
- Are there any status-dependent queries that might exclude 'released' submissions?

**Current Implementation**: Sets to 'released' for all completed historical submissions.

**Risk**: Low - 'released' is a valid status, but verify system behavior.

**Recommendation**:
- Verify 'released' status allows result viewing
- Check if any queries filter by status and might exclude 'released'
- Consider if 'released' is appropriate for historical data

---

### 14. **File Upload Error Handling** ⚠️ MEDIUM RISK

**Issue**: File uploads happen before database transaction:
- If upload succeeds but database insert fails, files are orphaned in Azure
- If multiple files and one fails, what happens to the others?
- No retry logic for transient failures

**Current Implementation**: 
- Files uploaded before transaction
- If any file fails, entire submission fails
- No cleanup of uploaded files on failure

**Risk**: Medium - Could leave orphaned files in Azure storage.

**Recommendation**:
- Add cleanup logic: If database insert fails, delete uploaded files
- Consider uploading files inside transaction (if possible) or use two-phase commit
- Add retry logic for transient Azure errors

---

### 15. **Data Warehouse Connection Resilience** ⚠️ MEDIUM RISK

**Issue**: MySQL connection to Data Warehouse:
- No connection pooling
- No retry logic for connection failures
- No timeout handling
- Single connection for entire migration

**Current Implementation**: Creates single connection, uses for all queries.

**Risk**: Medium - If connection drops mid-migration, entire process fails.

**Recommendation**:
- Add connection retry logic
- Add query timeout
- Consider connection pooling if migration is long-running
- Add checkpoint/resume capability

---

## System Recognition Concerns

### 1. **LTI Session Validation**

**Will the system recognize migrated sessions?**

✅ **Yes** - The migration creates valid LTI session records with:
- Valid `launchId` (unique)
- Required fields (`lmsUserId`, `customAssessmentCode`, `contextId`)
- Valid `sessionExpiry` (far future)
- `hasFileSubmission = 'true'`

**Potential Issues**:
- Session expiry check will pass (far future date)
- User lookup might fail if users don't exist (but `lmsUserId` is text, no FK constraint)

---

### 2. **Submission Queries**

**Will submissions appear in system queries?**

✅ **Yes** - Submissions will appear because:
- `fileCount > 0` (set correctly)
- `submittedAt` is set (from warehouse)
- All required fields are populated

**Potential Issues**:
- Queries filtering by date range might exclude very old submissions
- Queries filtering by `markingStatus` might behave differently for 'released' status

---

### 3. **Marking Workflow**

**Will marking data be recognized?**

✅ **Yes** - Marking data will be recognized:
- `submission_section_marks` created with valid `sectionId` references
- `submission_grades` created with `isComplete = true`
- `submission_marking_assignments` with `markingStatus = 'released'`

**Potential Issues**:
- If section matching is incorrect, marks might be associated with wrong sections
- If `markerId` is null, system might not display marker information correctly

---

## Operational Impact

### 1. **Database Performance**

**Impact**: Low-Medium
- Large batch inserts might slow down database
- No batching strategy (one transaction per submission)
- Could lock tables during long transactions

**Mitigation**:
- Process in smaller batches
- Add delays between submissions if needed
- Monitor database performance during migration

---

### 2. **Azure Storage Costs**

**Impact**: Low
- Files are re-uploaded to production storage
- Duplicate storage during migration (old + new)
- Consider cleanup of old files after migration

**Mitigation**:
- Plan for storage cost increase
- Schedule cleanup of old files after migration verification

---

### 3. **System Load**

**Impact**: Low
- Migration runs as separate script (not through API)
- No impact on running system
- But database load might affect production if run during business hours

**Mitigation**:
- Run migration during off-peak hours
- Monitor system performance
- Consider read replicas for queries during migration

---

## Missing Elements

### 1. **Rollback Strategy**

**Missing**: No rollback mechanism if migration needs to be undone.

**Recommendation**:
- Create backup before migration
- Document rollback procedure
- Consider adding migration metadata table to track what was migrated

---

### 2. **Verification Script**

**Missing**: No post-migration verification to ensure data integrity.

**Recommendation**:
- Create verification script to:
  - Count migrated submissions
  - Verify file counts match
  - Verify marking data exists
  - Check for orphaned records
  - Validate foreign key relationships

---

### 3. **Progress Tracking**

**Missing**: Limited progress tracking for long-running migrations.

**Recommendation**:
- Add progress logging to file
- Add checkpoint/resume capability
- Add estimated time remaining

---

### 4. **Data Validation**

**Missing**: Limited validation of source data quality.

**Recommendation**:
- Add pre-migration validation:
  - Check CSV file integrity
  - Validate warehouse data availability
  - Check assessment existence
  - Verify file URLs are accessible

---

## Recommendations Summary

### High Priority
1. ✅ **Fix section matching logic** - Add case-insensitive, trimmed matching
2. ✅ **Add assessment section validation** - Verify sections exist before matching
3. ✅ **Add duplicate prevention** - Check database, not just CSV
4. ✅ **Add file cleanup** - Delete uploaded files if database insert fails

### Medium Priority
1. ✅ **Add connection retry logic** - Handle Data Warehouse connection failures
2. ✅ **Add progress tracking** - Better logging and checkpoint capability
3. ✅ **Add verification script** - Post-migration data integrity checks
4. ✅ **Document timezone assumptions** - Clarify date handling

### Low Priority
1. ✅ **Add Turnitin job queuing** - If historical submissions need processing
2. ✅ **Add exact match for assessments** - Before fallback to prefix/suffix
3. ✅ **Add rollback documentation** - Procedure for undoing migration

---

## Testing Recommendations

1. **Small Batch Test**: Run migration on 10-20 submissions first
2. **Verification**: Verify all data appears correctly in system
3. **Query Testing**: Test system queries to ensure submissions appear
4. **Marking Workflow**: Verify marking data displays correctly
5. **File Access**: Verify files can be downloaded
6. **User Experience**: Test viewing results as a learner

---

## Conclusion

The migration plan is **generally sound** but has several areas that need attention:

1. **Section matching logic** needs improvement (case-insensitive, trimmed)
2. **Duplicate prevention** should check database, not just CSV
3. **File cleanup** needed if database insert fails
4. **Verification script** needed to validate migration success
5. **Connection resilience** needed for Data Warehouse

Most issues are **medium risk** and can be mitigated with the recommendations above. The system should recognize migrated data correctly, but thorough testing is recommended before full migration.

