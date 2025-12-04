# Parallel Migration with Worker Pool Pattern

This document describes the parallel migration implementation for Rogo submissions using Node.js Worker Threads.

## Architecture

### Worker Pool Pattern

The implementation uses a **dynamic work queue** approach:

1. **Main Thread (Coordinator)**
   - Loads all submission data from CSV files
   - Creates a work queue (processing from end/most recent first)
   - Spawns 5 worker threads
   - Distributes work dynamically as workers request it
   - Aggregates results and writes to CSV files periodically
   - Tracks progress across all workers

2. **Worker Threads**
   - Each worker has independent database connections (pool size: 3)
   - Each worker has its own Azure Blob Service instance
   - Workers request work from the main thread when ready
   - Process submissions independently
   - Send results back to main thread
   - Self-contained error handling with file cleanup

### True Parallelization

**YES**, this is true parallelization:

- **CPU Work**: Each worker runs in a separate V8 isolate on different CPU cores
- **I/O Operations**: Multiple workers issue concurrent database queries and Azure uploads
- **Memory**: Each worker has its own memory space (no shared state conflicts)

**Expected Performance**: 3-5x speedup with 5 workers depending on:
- Database connection limits
- Azure SQL Server throttling
- Network bandwidth
- Available CPU cores

## Race Condition Prevention

### 1. CSV File Writes ✅
**Solution**: Single writer pattern
- Only the main thread writes to CSV files
- Workers send results to main thread via messages
- Periodic batch writes every 10 seconds
- No file locking or coordination needed

### 2. Database Connections ✅
**Solution**: Per-worker connection pools
- Each worker creates its own PostgreSQL connection pool (Drizzle)
- Each worker creates its own MSSQL connection pool (Azure SQL)
- Pool size: 3 connections per worker (15 total across 5 workers)
- Thread-safe by design

### 3. Azure Blob Service ✅
**Solution**: Per-worker initialization
- Each worker initializes its own Azure Blob Service instance
- Azure SDK handles concurrent uploads internally
- Blob names include timestamps for uniqueness
- No coordination needed

### 4. Duplicate Migration Detection ✅
**Solution**: Database-level checks
- Workers query database before processing (launch ID pattern check)
- Database transactions ensure atomicity
- Duplicate key violations handled gracefully
- First worker to commit wins (others skip)

### 5. Malpractice Enforcements ✅
**Solution**: Database transactions with upsert logic
- Check for existing enforcement within transaction
- Use UPDATE if exists, INSERT if not
- PostgreSQL row-level locks prevent conflicts
- Transaction isolation prevents race conditions

## File Structure

```
data-migration/
├── migrate-rogo-submissions.ts          # Original sequential migration
├── migrate-rogo-submissions-parallel.ts # New parallel coordinator
├── migration-worker.ts                   # Worker thread script
├── submission_files.csv                 # Input data
├── attempt_number_mapping.csv           # Input mapping
├── migrated.csv                         # Output: successful migrations
└── submissions_failed_migration.csv     # Output: failed migrations
```

## Configuration

### Number of Workers
Default: 5 workers

To change, edit `NUM_WORKERS` in `migrate-rogo-submissions-parallel.ts`:

```typescript
const NUM_WORKERS = 5; // Adjust based on your system
```

### Connection Pool Size
Default: 3 connections per worker

To change, edit the pool configuration in `migration-worker.ts`:

```typescript
warehouseDb.config.pool = {
  max: 3,  // Adjust per worker
  min: 1,
  idleTimeoutMillis: 30000,
};
```

**Total connections** = NUM_WORKERS × pool size per worker
- 5 workers × 3 connections = 15 total MSSQL connections
- PostgreSQL uses default Drizzle pool settings (shared across workers)

### Progress Update Interval
Default: 10 seconds

To change, edit `PROGRESS_UPDATE_INTERVAL` in `migrate-rogo-submissions-parallel.ts`:

```typescript
const PROGRESS_UPDATE_INTERVAL = 10000; // milliseconds
```

### Batch Write Interval
Default: 5 minutes (300 seconds)

To change, edit `BATCH_WRITE_INTERVAL` in `migrate-rogo-submissions-parallel.ts`:

```typescript
const BATCH_WRITE_INTERVAL = 300000; // milliseconds
```

**Note**: Progress updates and CSV writes are independent. You get frequent progress updates (every 10s) without the overhead of frequent disk I/O.

## Running the Migration

### Prerequisites

1. Environment variables set (in `.env`):
   ```
   DATABASE_URL=postgresql://...
   DATA_WAREHOUSE_CONNECTION_STRING=Server=...
   AZURE_STORAGE_ACCOUNT_NAME=...
   AZURE_STORAGE_ACCOUNT_KEY=...
   ```

2. Input files in `data-migration/` directory:
   - `submission_files.csv`
   - `attempt_number_mapping.csv`

### Execute

```bash
npm run migrate:parallel
```

Or directly with ts-node:

```bash
npx ts-node --esm data-migration/migrate-rogo-submissions-parallel.ts
```

## Progress Monitoring

The migration outputs progress updates every 10 seconds:

```
================================================================================
📊 Progress Update
================================================================================
✅ Successful: 1250 | ❌ Failed: 12 | ⏭️  Skipped: 438
📝 Total Processed: 1700/30000 (5.7%)
⏱️  Elapsed: 120.5s | Rate: 14.11 submissions/s | ETA: 2006s

🔧 Worker Statistics:
   Worker 0: 340 processed (320 ✅, 20 ❌)
   Worker 1: 342 processed (335 ✅, 7 ❌)
   Worker 2: 338 processed (330 ✅, 8 ❌)
   Worker 3: 340 processed (325 ✅, 15 ❌)
   Worker 4: 340 processed (338 ✅, 2 ❌)
================================================================================
```

## Output Files

### migrated.csv
Contains successfully migrated submissions:
```csv
Attempt ID,Launch ID,Submission ID,Session Record ID,User ID,LTI Context ID
12345,rogo_12345_1733356789abc,sub-uuid,session-uuid,user-id,context-id
...
```

### submissions_failed_migration.csv
Contains failed submissions with error messages:
```csv
Attempt ID,First Name,Surname,...,Error
12346,John,Doe,...,Missing Grade field for Attempt ID: 12346
...
```

## Error Handling

### Worker-Level Errors
- Each worker handles errors independently
- Failed submissions are tracked and written to CSV
- Uploaded Azure blobs are cleaned up on failure
- Worker continues processing after errors

### Fatal Worker Errors
- If a worker crashes, other workers continue
- Failed work items can be retried manually
- Monitor worker exit codes in logs

### Main Thread Errors
- Graceful shutdown of all workers
- Final CSV write before exit
- All worker connections closed properly

## Performance Tuning

### Increase Workers
- More workers = more concurrency
- Diminishing returns after CPU core count
- Watch for database connection limits

### Adjust Pool Size
- Increase if workers spend time waiting for connections
- Decrease if hitting database connection limits
- Monitor with database performance tools

### Batch Write Interval
- Longer interval = less I/O overhead, more memory usage
- Shorter interval = more I/O overhead, less memory usage
- Adjust based on available memory

## Troubleshooting

### Connection Pool Exhaustion
**Symptom**: Workers hanging, timeout errors

**Solution**: Reduce workers or increase pool size per worker

### High Memory Usage
**Symptom**: Node.js out of memory errors

**Solution**: Reduce batch write interval to flush data more frequently

### Database Deadlocks
**Symptom**: Transaction timeout errors

**Solution**: PostgreSQL handles this automatically with row-level locks. If persistent, reduce number of workers.

### Slow Performance
**Symptom**: Rate < 5 submissions/second

**Check**:
- Network latency to Azure SQL
- Network latency to Azure Blob Storage
- Database query performance
- CPU utilization (should be near 100% on multiple cores)

## Comparison: Sequential vs Parallel

### Sequential (Original)
- Single thread processing
- ~3-5 submissions/second
- Time for 30k submissions: ~2-3 hours
- Simple, predictable

### Parallel (Worker Pool)
- 5 worker threads processing
- ~12-20 submissions/second (3-5x faster)
- Time for 30k submissions: ~25-40 minutes
- More complex, highly efficient

## Safety Features

1. ✅ Duplicate detection (database query before processing)
2. ✅ File cleanup on error (Azure blobs deleted)
3. ✅ Transaction rollback on error (database consistency)
4. ✅ Graceful shutdown (all workers closed cleanly)
5. ✅ Progress tracking (can resume from CSV)
6. ✅ Error logging (failed rows with reasons)

## Migration Order

Submissions are processed **from end to start** (most recent first):
- Input CSV has oldest submissions at the top
- Reversed before processing
- Most recent submissions migrated first
- Allows testing with recent data before full migration

