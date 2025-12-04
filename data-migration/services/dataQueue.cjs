const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs').promises;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

class DataQueue {
    constructor(outputDir = null, failedAttemptsFilename = null) {
        this.successfulQueue = [];
        this.failedQueue = [];
        this.worker = null;
        this.isProcessing = false;
        this.saveAfterSuccessful = parseInt(process.env.SAVE_AFTER_SUCCESSFULL_ATTEMPTS) || 100;
        this.saveAfterUnsuccessful = parseInt(process.env.SAVE_AFTER_UNSUCCESSFULL_ATTEMPTS) || 50;
        // Use provided output directory or default to project output (for backward compatibility)
        this.outputDir = outputDir || path.join(process.cwd(), 'output');
        // Use custom failed attempts filename if provided, otherwise default to 'failed_attempts.csv'
        this.failedAttemptsFilename = failedAttemptsFilename || 'failed_attempts.csv';
        
        // Mutex for thread-safe operations
        this.mutex = Promise.resolve();
        
        console.log(`📊 DataQueue initialized - Save after ${this.saveAfterSuccessful} successful, ${this.saveAfterUnsuccessful} unsuccessful attempts`);
    }

    /**
     * Initialize the worker thread for file I/O operations
     */
    async initializeWorker() {
        if (this.worker) {
            return;
        }

        try {
            // Ensure output directory exists
            await fs.mkdir(this.outputDir, { recursive: true });
            
            // Create worker thread
            this.worker = new Worker(__filename, {
                workerData: {
                    outputDir: this.outputDir,
                    saveAfterSuccessful: this.saveAfterSuccessful,
                    saveAfterUnsuccessful: this.saveAfterUnsuccessful,
                    failedAttemptsFilename: this.failedAttemptsFilename
                }
            });

            // Handle worker messages
            this.worker.on('message', (message) => {
                if (message.type === 'saved') {
                    console.log(`✅ Worker saved ${message.successfulCount} successful and ${message.failedCount} failed attempts to CSV`);
                } else if (message.type === 'error') {
                    console.error('❌ Worker error:', message.error);
                }
            });

            this.worker.on('error', (error) => {
                console.error('❌ Worker thread error:', error);
            });

            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`❌ Worker thread exited with code ${code}`);
                }
            });

            console.log('✅ DataQueue worker thread initialized');
        } catch (error) {
            console.error('❌ Failed to initialize DataQueue worker:', error.message);
            throw error;
        }
    }

    /**
     * Execute a function with mutex protection
     * @param {Function} fn - Function to execute
     * @returns {Promise} Result of the function
     */
    async withMutex(fn) {
        this.mutex = this.mutex.then(async () => {
            return await fn();
        });
        return this.mutex;
    }

    /**
     * Add successful attempt data to queue
     * @param {Object} data - Scraped data for successful attempt
     */
    async addSuccessful(data) {
        return this.withMutex(async () => {
            this.successfulQueue.push({
                ...data,
                timestamp: new Date().toISOString(),
                type: 'successful'
            });

            console.log(`📝 Added successful attempt ${data['Attempt ID']} to queue (${this.successfulQueue.length}/${this.saveAfterSuccessful})`);

            // Check if we should save
            if (this.successfulQueue.length >= this.saveAfterSuccessful) {
                await this.flushSuccessful();
            }
        });
    }

    /**
     * Add failed attempt data to queue
     * @param {Object} data - Failed attempt data
     */
    async addFailed(data) {
        return this.withMutex(async () => {
            this.failedQueue.push({
                ...data,
                timestamp: new Date().toISOString(),
                type: 'failed'
            });

            console.log(`📝 Added failed attempt ${data['Attempt ID']} to queue (${this.failedQueue.length}/${this.saveAfterUnsuccessful})`);

            // Check if we should save
            if (this.failedQueue.length >= this.saveAfterUnsuccessful) {
                await this.flushFailed();
            }
        });
    }

    /**
     * Flush successful attempts to worker thread
     */
    async flushSuccessful() {
        if (this.successfulQueue.length === 0) {
            return;
        }

        if (!this.worker) {
            await this.initializeWorker();
        }

        const dataToSave = [...this.successfulQueue];
        this.successfulQueue = [];

        console.log(`🔄 Flushing ${dataToSave.length} successful attempts to CSV`);
        
        this.worker.postMessage({
            type: 'save_successful',
            data: dataToSave
        });
    }

    /**
     * Flush failed attempts to worker thread
     */
    async flushFailed() {
        if (this.failedQueue.length === 0) {
            return;
        }

        if (!this.worker) {
            await this.initializeWorker();
        }

        const dataToSave = [...this.failedQueue];
        this.failedQueue = [];

        console.log(`🔄 Flushing ${dataToSave.length} failed attempts to CSV`);
        
        this.worker.postMessage({
            type: 'save_failed',
            data: dataToSave
        });
    }

    /**
     * Force flush all remaining data
     */
    async flushAll() {
        console.log('🔄 Flushing all remaining data...');
        await this.flushSuccessful();
        await this.flushFailed();
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            successfulQueueSize: this.successfulQueue.length,
            failedQueueSize: this.failedQueue.length,
            saveAfterSuccessful: this.saveAfterSuccessful,
            saveAfterUnsuccessful: this.saveAfterUnsuccessful
        };
    }

    /**
     * Close the worker thread
     */
    async close() {
        if (this.worker) {
            // Flush any remaining data
            await this.flushAll();
            
            // Send close message to worker
            this.worker.postMessage({ type: 'close' });
            
            // Wait for worker to finish
            await new Promise((resolve) => {
                this.worker.on('exit', resolve);
                setTimeout(resolve, 10000); // 10 second timeout
            });
            
            this.worker = null;
            console.log('🔒 DataQueue worker thread closed');
        }
    }
}

// Worker thread code (runs in separate thread)
if (!isMainThread) {
    const { outputDir, saveAfterSuccessful, saveAfterUnsuccessful, failedAttemptsFilename } = workerData;
    
    // File paths
    const successfulCsvPath = path.join(outputDir, 'scraped_data.csv');
    const failedCsvPath = path.join(outputDir, failedAttemptsFilename || 'failed_attempts.csv');
    
    // CSV writer configurations
    const successfulCsvWriter = createCsvWriter({
        path: successfulCsvPath,
        header: [
            { id: 'Membership Number', title: 'Membership Number' },
            { id: 'First Name', title: 'First Name' },
            { id: 'Surname', title: 'Surname' },
            { id: 'Learner Email', title: 'Learner Email' },
            { id: 'Attempt ID', title: 'Attempt ID' },
            { id: 'Unit Code', title: 'Unit Code' },
            { id: 'Assessment ID', title: 'Assessment ID' },
            { id: 'courseTitle', title: 'Course Title' },
            { id: 'attemptNumber', title: 'Attempt Number' },
            { id: 'rogoUserId', title: 'Rogo User ID' },
            { id: 'rogoUserName', title: 'Rogo User Name' },
            { id: 'learnerFilesCount', title: 'Learner Files Count' },
            { id: 'learnerFileNames', title: 'Learner File Names' },
            { id: 'learnerFileUrls', title: 'Learner File URLs' },
            { id: 'learnerAzureBlobNames', title: 'Learner Azure Blob Names' },
            { id: 'learnerAzureBlobUrls', title: 'Learner Azure Blob URLs' },
            { id: 'markerFilesCount', title: 'Marker Files Count' },
            { id: 'markerFileNames', title: 'Marker File Names' },
            { id: 'markerFileUrls', title: 'Marker File URLs' },
            { id: 'markerAzureBlobNames', title: 'Marker Azure Blob Names' },
            { id: 'markerAzureBlobUrls', title: 'Marker Azure Blob URLs' },
            { id: 'timestamp', title: 'Timestamp' },
            { id: 'error', title: 'Error' }
        ],
        append: true // This is the key - append mode for efficiency
    });

    const failedCsvWriter = createCsvWriter({
        path: failedCsvPath,
        header: [
            { id: 'Membership Number', title: 'Membership Number' },
            { id: 'First Name', title: 'First Name' },
            { id: 'Surname', title: 'Surname' },
            { id: 'Learner Email', title: 'Learner Email' },
            { id: 'Attempt ID', title: 'Attempt ID' },
            { id: 'Unit Code', title: 'Unit Code' },
            { id: 'Assessment ID', title: 'Assessment ID' },
            { id: 'Error', title: 'Error' },
            { id: 'timestamp', title: 'Timestamp' }
        ],
        append: true // This is the key - append mode for efficiency
    });

    /**
     * Initialize CSV files (create headers if files don't exist)
     */
    async function initializeCsvFiles() {
        try {
            // Check if files exist
            const successfulExists = await fs.access(successfulCsvPath).then(() => true).catch(() => false);
            const failedExists = await fs.access(failedCsvPath).then(() => true).catch(() => false);

            if (!successfulExists) {
                // Create successful data CSV with headers by writing header row directly
                const headers = [
                    'Membership Number',
                    'First Name', 
                    'Surname',
                    'Learner Email',
                    'Attempt ID',
                    'Unit Code',
                    'Assessment ID',
                    'Course Title',
                    'Attempt Number',
                    'Rogo User ID',
                    'Rogo User Name',
                    'Learner Files Count',
                    'Learner File Names',
                    'Learner File URLs',
                    'Learner Azure Blob Names',
                    'Learner Azure Blob URLs',
                    'Marker Files Count',
                    'Marker File Names',
                    'Marker File URLs',
                    'Marker Azure Blob Names',
                    'Marker Azure Blob URLs',
                    'Timestamp',
                    'Error'
                ];
                await fs.writeFile(successfulCsvPath, headers.join(',') + '\n', 'utf8');
                console.log('📄 Created new scraped_data.csv file with headers');
            }

            if (!failedExists) {
                // Create failed attempts CSV with headers by writing header row directly
                const headers = [
                    'Membership Number',
                    'First Name',
                    'Surname', 
                    'Learner Email',
                    'Attempt ID',
                    'Unit Code',
                    'Assessment ID',
                    'Error',
                    'Timestamp'
                ];
                await fs.writeFile(failedCsvPath, headers.join(',') + '\n', 'utf8');
                console.log(`📄 Created new ${failedAttemptsFilename || 'failed_attempts.csv'} file with headers`);
            }

            console.log('✅ CSV files initialized');
        } catch (error) {
            console.error('❌ Failed to initialize CSV files:', error.message);
            throw error;
        }
    }

    /**
     * Append data to successful attempts CSV
     */
    async function appendSuccessfulData(data) {
        try {
            await successfulCsvWriter.writeRecords(data);
            console.log(`✅ Appended ${data.length} successful attempts to scraped_data.csv`);
            
        } catch (error) {
            console.error('❌ Failed to append successful data:', error.message);
            throw error;
        }
    }

    /**
     * Append data to failed attempts CSV
     */
    async function appendFailedData(data) {
        try {
            await failedCsvWriter.writeRecords(data);
            console.log(`✅ Appended ${data.length} failed attempts to ${failedAttemptsFilename || 'failed_attempts.csv'}`);
            
        } catch (error) {
            console.error('❌ Failed to append failed data:', error.message);
            throw error;
        }
    }

    // Initialize CSV files on worker start
    initializeCsvFiles().catch(error => {
        console.error('❌ Worker initialization failed:', error);
        process.exit(1);
    });

    // Handle messages from main thread
    parentPort.on('message', async (message) => {
        try {
            switch (message.type) {
                case 'save_successful':
                    await appendSuccessfulData(message.data);
                    parentPort.postMessage({
                        type: 'saved',
                        successfulCount: message.data.length,
                        failedCount: 0
                    });
                    break;

                case 'save_failed':
                    await appendFailedData(message.data);
                    parentPort.postMessage({
                        type: 'saved',
                        successfulCount: 0,
                        failedCount: message.data.length
                    });
                    break;

                case 'close':
                    console.log('🔒 Worker thread closing...');
                    process.exit(0);
                    break;

                default:
                    console.log('⚠️ Unknown message type:', message.type);
            }
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                error: error.message
            });
        }
    });

    // Handle worker errors
    process.on('uncaughtException', (error) => {
        console.error('❌ Worker uncaught exception:', error);
        parentPort.postMessage({
            type: 'error',
            error: error.message
        });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Worker unhandled rejection:', reason);
        parentPort.postMessage({
            type: 'error',
            error: reason.toString()
        });
        process.exit(1);
    });
}

module.exports = DataQueue;