# Quick Start: Parallel Migration

## What Was Implemented

✅ **Worker Pool Pattern** with 5 worker threads for true parallelization  
✅ **Dynamic Work Distribution** - Workers pull from shared queue (most recent first)  
✅ **Race Condition Prevention** - Single writer pattern, per-worker DB connections  
✅ **Connection Pooling** - 3 connections per worker (15 total)  
✅ **Progress Tracking** - Real-time updates every 10 seconds  
✅ **Efficient CSV Writes** - Batch writes every 5 minutes  
✅ **Error Handling** - Independent worker errors with file cleanup  
✅ **True Parallelization** - Worker threads on separate CPU cores  
✅ **Auto-compilation** - Worker script compiled with esbuild at startup  

## Expected Performance

| Metric | Sequential | Parallel (5 workers) |
|--------|-----------|---------------------|
| Speed | 3-5 sub/s | 12-20 sub/s |
| Time for 30k | 2-3 hours | 25-40 minutes |
| CPU Cores Used | 1 | 5 |
| Speedup | 1x | 3-5x |

## Run the Migration

```bash
# Make sure your .env file is configured
npm run migrate:rogo:parallel
```

## What You'll See

```
🚀 Starting parallel Rogo submissions migration with worker pool pattern...
⚙️  Configuration: 5 worker threads

🔧 Compiling worker script...
✅ Worker script compiled successfully

📂 Loading submission_files.csv...
✅ Loaded 30000 submission rows from CSV

📂 Loading attempt_number_mapping.csv...
✅ Loaded 30000 attempt mappings

📂 Loading assessments from database...
✅ Loaded 150 assessments from database

📂 Loading malpractice levels from database...
✅ Loaded 4 malpractice levels from database

📂 Finding system user for migration operations...
✅ Using system user ID: abc-123-def

🔧 Spawning 5 worker threads...
✅ All 5 workers spawned and ready

🚀 Starting migration...

================================================================================
📊 Progress Update
================================================================================
✅ Successful: 1450 | ❌ Failed: 15 | ⏭️  Skipped: 235
📝 Total Processed: 1700/30000 (5.7%)
⏱️  Elapsed: 120.5s | Rate: 14.11 submissions/s | ETA: 2006s

🔧 Worker Statistics:
   Worker 0: 340 processed (330 ✅, 10 ❌)
   Worker 1: 342 processed (338 ✅, 4 ❌)
   Worker 2: 338 processed (335 ✅, 3 ❌)
   Worker 3: 340 processed (332 ✅, 8 ❌)
   Worker 4: 340 processed (338 ✅, 2 ❌)
================================================================================
```

## Files Created

### Input Files (Required)
- `submission_files.csv` - Main submission data
- `attempt_number_mapping.csv` - Attempt number mapping

### Output Files (Generated)
- `migrated.csv` - Successfully migrated submissions
- `submissions_failed_migration.csv` - Failed submissions with errors

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Thread                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Work Queue  │─▶│ Distributor  │─▶│ CSV Writer   │      │
│  │ (Reversed)  │  │              │  │ (Periodic)   │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
│         │                                     ▲              │
└─────────┼─────────────────────────────────────┼─────────────┘
          │ Work Request                        │ Results
          ▼                                     │
┌──────────────────────────────────────────────────────────────┐
│                     Worker Pool                               │
├────────────┬────────────┬────────────┬────────────┬──────────┤
│  Worker 0  │  Worker 1  │  Worker 2  │  Worker 3  │ Worker 4 │
│            │            │            │            │          │
│ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │┌────────┐│
│ │Postgres│ │ │Postgres│ │ │Postgres│ │ │Postgres│ ││Postgres││
│ │Pool(3) │ │ │Pool(3) │ │ │Pool(3) │ │ │Pool(3) │ ││Pool(3) ││
│ └────────┘ │ └────────┘ │ └────────┘ │ └────────┘ │└────────┘│
│            │            │            │            │          │
│ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │┌────────┐│
│ │ MSSQL  │ │ │ MSSQL  │ │ │ MSSQL  │ │ │ MSSQL  │ ││ MSSQL  ││
│ │Pool(3) │ │ │Pool(3) │ │ │Pool(3) │ │ │Pool(3) │ ││Pool(3) ││
│ └────────┘ │ └────────┘ │ └────────┘ │ └────────┘ │└────────┘│
│            │            │            │            │          │
│ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │┌────────┐│
│ │ Azure  │ │ │ Azure  │ │ │ Azure  │ │ │ Azure  │ ││ Azure  ││
│ │ Blob   │ │ │ Blob   │ │ │ Blob   │ │ │ Blob   │ ││ Blob   ││
│ └────────┘ │ └────────┘ │ └────────┘ │ └────────┘ │└────────┘│
└────────────┴────────────┴────────────┴────────────┴──────────┘
```

## Message Flow

```
Main Thread                  Worker Thread
    │                             │
    │◀─── WORK_REQUEST ───────────┤
    │                             │
    ├──── WORK (csvRow) ─────────▶│
    │                             │
    │                             ├─ Process Submission
    │                             ├─ Query Warehouse
    │                             ├─ Upload to Azure
    │                             ├─ Insert to Database
    │                             │
    │◀─── PROGRESS (optional) ────┤
    │                             │
    │◀─── WORK_RESULT ────────────┤
    │                             │
    ├─ Aggregate Results          │
    ├─ Write to CSV (periodic)    │
    │                             │
    │◀─── WORK_REQUEST ───────────┤
    │                             │
    └──── WORK (csvRow) ─────────▶│
```

## Race Condition Solutions

### Problem 1: CSV File Writes
**Solution**: Single writer pattern - only main thread writes to files

### Problem 2: Database Connections
**Solution**: Each worker has independent connection pools

### Problem 3: Azure Blob Uploads
**Solution**: Each worker has separate Azure service instance

### Problem 4: Duplicate Detection
**Solution**: Database query + transaction ensures atomicity

### Problem 5: Malpractice Enforcement Conflicts
**Solution**: Upsert logic within transaction (UPDATE or INSERT)

## Configuration

Edit `migrate-rogo-submissions-parallel.ts`:

```typescript
const NUM_WORKERS = 5;                      // Number of worker threads
const PROGRESS_UPDATE_INTERVAL = 10000;     // Progress updates (ms)
const BATCH_WRITE_INTERVAL = 300000;        // CSV write interval (ms)
```

Edit `migration-worker.ts`:

```typescript
warehouseDb.config.pool = {
  max: 3,                                 // Connections per worker
  min: 1,
  idleTimeoutMillis: 30000,
};
```

## Monitoring

### Real-time Progress
Updates every 10 seconds showing:
- Success/Failed/Skipped counts
- Processing rate (submissions/second)
- Estimated time remaining
- Per-worker statistics

### Output Files
- Check `migrated.csv` for successful migrations
- Check `submissions_failed_migration.csv` for errors

### Database Monitoring
```sql
-- Check latest migrations
SELECT * FROM assignment_submissions 
WHERE lti_launch_id LIKE 'rogo_%' 
ORDER BY created_at DESC 
LIMIT 100;

-- Count migrations
SELECT COUNT(*) FROM assignment_submissions 
WHERE lti_launch_id LIKE 'rogo_%';
```

## Troubleshooting

### Workers Not Starting
- Check Worker Threads support: `node --version` (v12.11.0+)
- Check TypeScript config: `ts-node` with `--esm` flag
- Check permissions on worker script file

### Slow Performance
- Check database connection latency
- Check Azure SQL Server throttling
- Monitor CPU usage (should be high across multiple cores)
- Consider reducing workers if connection-limited

### High Memory Usage
- Reduce `BATCH_WRITE_INTERVAL` to flush more frequently
- Monitor with: `node --max-old-space-size=8192` (increase if needed)

### Connection Pool Exhausted
- Reduce `NUM_WORKERS`
- Increase pool size per worker
- Check Azure SQL connection limits

## Comparison to Sequential

### Use Parallel When:
✅ Large dataset (10k+ submissions)  
✅ Need faster completion time  
✅ Have multiple CPU cores available  
✅ Database can handle concurrent connections  

### Use Sequential When:
✅ Small dataset (< 1k submissions)  
✅ Debugging specific issues  
✅ Limited database connections  
✅ Single-core environment  

## Safety Features

1. ✅ **Duplicate Prevention**: Database checks before inserting
2. ✅ **File Cleanup**: Azure blobs deleted on error
3. ✅ **Transaction Safety**: Rollback on error
4. ✅ **Graceful Shutdown**: Workers closed cleanly
5. ✅ **Progress Persistence**: Can resume from CSV
6. ✅ **Error Logging**: All errors tracked with reasons

## Next Steps After Migration

1. **Verify Results**
   ```bash
   npm run verify:migration
   ```

2. **Check Failed Migrations**
   - Review `submissions_failed_migration.csv`
   - Fix issues and rerun if needed

3. **Monitor Database**
   - Check for data consistency
   - Verify relationships (submissions → files → grades)

4. **Clean Up**
   - Archive CSV files
   - Document any manual fixes needed
   - Update team on migration status

## Support

For detailed documentation, see:
- `PARALLEL_MIGRATION_README.md` - Full architecture and design
- `migrate-rogo-submissions-parallel.ts` - Main coordinator code
- `migration-worker.ts` - Worker thread implementation

