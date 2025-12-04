const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const AzureBlobService = require('./azureBlobService.cjs');
const DataQueue = require('./dataQueue.cjs');
require('dotenv').config();

class RogoAssessmentScraper {
    constructor(failedAttemptsFilename = null) {
        this.browser = null;
        this.page = null;
        this.pages = []; // Array to hold multiple pages for parallel processing
        this.azureService = null;
        this.dataQueue = null;
        this.failedAttemptsFilename = failedAttemptsFilename;
        this.config = {
            url: process.env.ROGO_URL,
            email: process.env.ROGO_LOGIN_EMAIL,
            password: process.env.ROGO_LOGIN_PASS,
            attemptPageUrl: process.env.ROGO_ATTEMPT_PAGE_URL,
            headless: process.env.HEADLESS === 'true' || true,
            timeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
            concurrentWorkers: parseInt(process.env.CONCURRENT_WORKERS) || 1,
            sessionRetryDelay: parseInt(process.env.SESSION_RETRY_DELAY) || 5000,
            sessionCheckInterval: parseInt(process.env.SESSION_CHECK_INTERVAL) || 50,
            backupInterval: parseInt(process.env.BACKUP_INTERVAL) || 1000,
            checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL) || 100
        };
        
        // Set up persistent output directory (outside project to survive git pulls)
        // Default: /var/lib/rogo-scraper (Linux standard), fallback to ~/rogo-scraper-data
        this.outputBaseDir = process.env.OUTPUT_DIR || this.getDefaultOutputDirectory();
        this._outputDir = path.join(this.outputBaseDir, 'output');
        this._tempDir = path.join(this.outputBaseDir, 'temp');
        this.checkpointPath = path.join(this._outputDir, '.checkpoint.json');
        
        console.log(this.config);
        console.log(`📁 Output directory: ${this._outputDir}`);
        console.log(`📁 Temp directory: ${this._tempDir}`);
        
        this.scrapedData = [];
        this.failedAttempts = [];
        this.inputData = [];
        this.processedAttempts = new Set(); // Track processed attempts for resume support
        this.workQueue = []; // Queue for work distribution
        this.queueMutex = Promise.resolve(); // Mutex for thread-safe queue operations
        this.activeWorkers = 0; // Track active workers
        this.completedCount = 0; // Track completed attempts
        this.lastBackupTime = null;
    }

    /**
     * Get default output directory based on OS and availability
     * Tries /var/lib/rogo-scraper first (Linux standard), falls back to home directory
     * @returns {string} Default output directory path
     */
    getDefaultOutputDirectory() {
        // Try /var/lib/rogo-scraper first (Linux standard for application data)
        const systemDir = '/var/lib/rogo-scraper';
        try {
            // Check if we can access (or create) the system directory
            const fs = require('fs');
            if (!fs.existsSync(systemDir)) {
                // Try to create it (may require sudo on first run)
                try {
                    fs.mkdirSync(systemDir, { recursive: true });
                } catch (e) {
                    // If can't create (permission denied), use home directory
                    const os = require('os');
                    const homeDir = path.join(os.homedir(), 'rogo-scraper-data');
                    console.log(`⚠️  Cannot create ${systemDir}, using ${homeDir} instead`);
                    return homeDir;
                }
            }
            return systemDir;
        } catch (error) {
            // Fallback to home directory if system directory not accessible
            const os = require('os');
            const homeDir = path.join(os.homedir(), 'rogo-scraper-data');
            console.log(`⚠️  Cannot use ${systemDir}, using ${homeDir} instead`);
            return homeDir;
        }
    }

    /**
     * Ensure output and temp directories exist with proper permissions
     * @returns {Promise<void>}
     */
    async ensureDirectories() {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
            await fs.mkdir(path.join(this.outputDir, 'backups'), { recursive: true });
            await fs.mkdir(this.tempDir, { recursive: true });
            console.log(`✅ Directories created: ${this.outputDir}, ${this.tempDir}`);
        } catch (error) {
            console.error(`❌ Failed to create directories: ${error.message}`);
            throw error;
        }
    }

    get timing() {
        if (!this._timing) {
            this._timing = {
            startTime: null,
            endTime: null,
            attemptTimes: [],
            totalTime: 0,
            averageTime: 0
        };
        }
        return this._timing;
    }

    get outputDir() {
        return this._outputDir || path.join(this.outputBaseDir, 'output');
    }

    get tempDir() {
        return this._tempDir || path.join(this.outputBaseDir, 'temp');
    }

    async init() {
        try {
            console.log('🚀 Initializing Rogo Assessment Scraper...');
            
            // Validate configuration
            this.validateConfig();
            
            // Ensure output directories exist
            await this.ensureDirectories();
            
            // Initialize Data Queue for incremental persistence (pass output directory and optional failed attempts filename)
            this.dataQueue = new DataQueue(this.outputDir, this.failedAttemptsFilename);
            await this.dataQueue.initializeWorker();
            
            // Initialize Azure Blob Service
            this.azureService = new AzureBlobService();
            await this.azureService.initialize();
            
            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            this.page = await this.browser.newPage();
            
            // Set viewport and user agent
            await this.page.setViewport({ width: 1500, height: 768 });
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            // Create pages for parallel processing (one page per worker)
            this.pages = [this.page]; // Start with the main page
            for (let i = 1; i < this.config.concurrentWorkers; i++) {
                const newPage = await this.browser.newPage();
                await newPage.setViewport({ width: 1500, height: 768 });
                await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                this.pages.push(newPage);
            }
            
            console.log(`✅ Initialization completed with ${this.pages.length} workers (${this.config.concurrentWorkers} configured)`);
        } catch (error) {
            console.error('❌ Failed to initialize:', error.message);
            throw error;
        }
    }

    validateConfig() {
        const required = ['ROGO_URL', 'ROGO_LOGIN_EMAIL', 'ROGO_LOGIN_PASS', 'ROGO_ATTEMPT_PAGE_URL'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        console.log('✅ Configuration validated');
    }

    async login() {
        try {
            console.log('🔐 Logging into Rogo...');
            
            // Login on the main page first
            await this.loginOnPage(this.page);
            
            // Copy session to other pages by navigating them to a protected page
            for (let i = 1; i < this.pages.length; i++) {
                const page = this.pages[i];
                try {
                    // Navigate to a protected page to inherit the session
                    await page.goto(this.config.url, { 
                        waitUntil: 'networkidle2',
                        timeout: this.config.timeout 
                    });
                    console.log(`✅ Page ${i + 1} session established`);
                } catch (error) {
                    console.error(`❌ Failed to establish session for page ${i + 1}:`, error.message);
                    throw error;
                }
            }
            
            console.log(`✅ Login successful on all ${this.pages.length} pages`);
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            throw error;
        }
    }

    async loginOnPage(page) {
            // Navigate to login page
        await page.goto(this.config.url, { 
                waitUntil: 'networkidle2',
                timeout: this.config.timeout 
            });

            // Fill login form
        await page.waitForSelector('#InputModels_Input_Username', { timeout: 10000 });
        await page.type('#InputModels_Input_Username', this.config.email, { delay: 100 });
            
        await page.waitForSelector('#InputModels_Input_Password', { timeout: 10000 });
        await page.type('#InputModels_Input_Password', this.config.password, { delay: 100 });
            
            // Click login button
        await page.waitForSelector('button[name="InputModels.Input.Button"]', { timeout: 10000 });
        await page.click('button[name="InputModels.Input.Button"]');
            
            // Wait for navigation
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: this.config.timeout });
    }

    /**
     * Load checkpoint file to resume from previous run
     * @returns {Promise<void>}
     */
    async loadCheckpoint() {
        try {
            const checkpointData = await fs.readFile(this.checkpointPath, 'utf8');
            const checkpoint = JSON.parse(checkpointData);
            
            // Restore processed attempts
            if (checkpoint.processedAttempts && Array.isArray(checkpoint.processedAttempts)) {
                checkpoint.processedAttempts.forEach(id => {
                    this.processedAttempts.add(id);
                });
            }
            
            // Restore timing start time if available
            if (checkpoint.startTime) {
                this.timing.startTime = new Date(checkpoint.startTime);
            }
            
            console.log(`✅ Loaded checkpoint: ${checkpoint.processedAttempts?.length || 0} processed attempts`);
            console.log(`📅 Checkpoint timestamp: ${checkpoint.timestamp || 'N/A'}`);
            
            return checkpoint;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️ No checkpoint file found, starting fresh');
                return null;
            }
            console.error('⚠️ Failed to load checkpoint:', error.message);
            return null;
        }
    }

    /**
     * Save checkpoint file with current progress
     * @returns {Promise<void>}
     */
    async saveCheckpoint() {
        try {
            await this.ensureDirectories();
            
            const checkpoint = {
                timestamp: new Date().toISOString(),
                processedAttempts: Array.from(this.processedAttempts),
                completedCount: this.completedCount,
                startTime: this.timing.startTime ? this.timing.startTime.toISOString() : null,
                totalAttempts: this.inputData.length,
                remainingAttempts: this.inputData.length - this.processedAttempts.size
            };
            
            await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
            console.log(`💾 Checkpoint saved: ${this.processedAttempts.size} processed, ${checkpoint.remainingAttempts} remaining`);
        } catch (error) {
            console.error('⚠️ Failed to save checkpoint:', error.message);
            // Don't throw - checkpoint failure shouldn't stop processing
        }
    }

    /**
     * Create backup of CSV files and checkpoint
     * @returns {Promise<void>}
     */
    async performPeriodicBackup() {
        try {
            const now = new Date();
            
            // Check if enough time has passed since last backup
            if (this.lastBackupTime) {
                const timeSinceLastBackup = now - this.lastBackupTime;
                const backupIntervalMs = this.config.backupInterval * 1000; // Convert to milliseconds
                
                if (timeSinceLastBackup < backupIntervalMs) {
                    return; // Not time for backup yet
                }
            }
            
            console.log('💾 Performing periodic backup...');
            
            await this.ensureDirectories();
            const backupDir = path.join(this.outputDir, 'backups');
            
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
            
            // Backup CSV files
            const csvFiles = ['scraped_data.csv', 'failed_attempts.csv'];
            for (const fileName of csvFiles) {
                const sourcePath = path.join(outputDir, fileName);
                try {
                    await fs.access(sourcePath);
                    const destPath = path.join(backupDir, `${timestamp}_${fileName}`);
                    await fs.copyFile(sourcePath, destPath);
                    console.log(`✅ Backed up ${fileName}`);
                } catch (error) {
                    // File doesn't exist yet, that's fine
                }
            }
            
            // Backup checkpoint
            try {
                await fs.access(this.checkpointPath);
                const checkpointBackupPath = path.join(backupDir, `${timestamp}_checkpoint.json`);
                await fs.copyFile(this.checkpointPath, checkpointBackupPath);
                console.log(`✅ Backed up checkpoint`);
            } catch (error) {
                // Checkpoint doesn't exist yet, that's fine
            }
            
            // Clean up old backups (keep last 10)
            const backupFiles = (await fs.readdir(backupDir))
                .filter(f => f.endsWith('.csv') || f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(backupDir, f),
                    time: 0 // Will be updated
                }));
            
            // Get file stats for sorting
            for (const file of backupFiles) {
                try {
                    const stats = await fs.stat(file.path);
                    file.time = stats.mtimeMs;
                } catch (error) {
                    file.time = 0;
                }
            }
            
            // Sort by time (newest first) and remove old backups
            backupFiles.sort((a, b) => b.time - a.time);
            const backupsToKeep = 10;
            if (backupFiles.length > backupsToKeep) {
                const filesToDelete = backupFiles.slice(backupsToKeep);
                for (const file of filesToDelete) {
                    try {
                        await fs.unlink(file.path);
                        console.log(`🗑️ Removed old backup: ${file.name}`);
                    } catch (error) {
                        console.error(`⚠️ Failed to remove old backup ${file.name}:`, error.message);
                    }
                }
            }
            
            this.lastBackupTime = now;
            console.log(`✅ Backup completed`);
        } catch (error) {
            console.error('⚠️ Failed to perform backup:', error.message);
            // Don't throw - backup failure shouldn't stop processing
        }
    }

    async loadProcessedAttempts() {
        try {
            console.log('🔄 Loading previously processed attempts for resume support...');
            
            await this.ensureDirectories();
            
            // First try to load from checkpoint (faster)
            const checkpoint = await this.loadCheckpoint();
            
            // Also load from CSV files as backup/verification
            // Check for existing successful attempts
            const successfulCsvPath = path.join(this.outputDir, 'scraped_data.csv');
            try {
                const successfulContent = await fs.readFile(successfulCsvPath, 'utf8');
                const lines = successfulContent.trim().split('\n');
                if (lines.length > 1) { // Has data beyond header
                    for (let i = 1; i < lines.length; i++) {
                        // Parse CSV properly (handling quoted fields)
                        const row = this.parseCsvLine(lines[i]);
                        const attemptId = row[4]; // Attempt ID is 5th column
                        if (attemptId) {
                            this.processedAttempts.add(attemptId.trim());
                        }
                    }
                }
            } catch (error) {
                // File doesn't exist or is empty, that's fine
            }
            
            // Check for existing failed attempts
            const failedCsvPath = path.join(this.outputDir, 'failed_attempts.csv');
            try {
                const failedContent = await fs.readFile(failedCsvPath, 'utf8');
                const lines = failedContent.trim().split('\n');
                if (lines.length > 1) { // Has data beyond header
                    for (let i = 1; i < lines.length; i++) {
                        const row = this.parseCsvLine(lines[i]);
                        const attemptId = row[4]; // Attempt ID is 5th column
                        if (attemptId) {
                            this.processedAttempts.add(attemptId.trim());
                        }
                    }
                }
            } catch (error) {
                // File doesn't exist or is empty, that's fine
            }
            
            console.log(`✅ Found ${this.processedAttempts.size} previously processed attempts`);
        } catch (error) {
            console.error('❌ Failed to load processed attempts:', error.message);
            // Don't throw error, just continue without resume support
        }
    }

    /**
     * Simple CSV line parser that handles quoted fields
     * @param {string} line - CSV line
     * @returns {Array<string>} Array of field values
     */
    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current); // Add last field
        return result;
    }

    async loadInputData(filePath) {
        try {
            console.log(`📊 Loading input data from: ${filePath}`);
            
            // Read Excel file
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON
            this.inputData = XLSX.utils.sheet_to_json(worksheet);
            
            console.log(`✅ Loaded ${this.inputData.length} records from input file`);
            
            // Validate required columns
            const requiredColumns = ['Membership Number', 'First Name', 'Surname', 'Learner Email', 'Attempt ID', 'Unit Code', 'Assessment ID'];
            const firstRow = this.inputData[0];
            const missingColumns = requiredColumns.filter(col => !(col in firstRow));
            
            if (missingColumns.length > 0) {
                throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
            }
            
        } catch (error) {
            console.error('❌ Failed to load input data:', error.message);
            throw error;
        }
    }

    /**
     * Check if session is still valid by looking for login page elements
     * @param {Page} page - Puppeteer page instance
     * @returns {Promise<boolean>} True if session is valid, false if expired
     */
    async isSessionValid(page) {
        try {
            // Check if we're on the login page (session expired)
            const loginUsernameField = await page.$('#InputModels_Input_Username');
            if (loginUsernameField) {
                console.log('⚠️ Session expired - detected login page');
                return false;
            }
            
            // Check if we're redirected to login (common pattern)
            const currentUrl = page.url();
            if (currentUrl.includes('/Login') || currentUrl.includes('/Account/Login')) {
                console.log('⚠️ Session expired - redirected to login page');
                return false;
            }
            
            return true;
        } catch (error) {
            console.log(`⚠️ Could not verify session validity: ${error.message}`);
            // On error, assume session might be invalid and re-login to be safe
            return false;
        }
    }

    /**
     * Re-login on a specific page if session has expired
     * @param {Page} page - Puppeteer page instance
     * @param {number} pageIndex - Index of the page (0-based)
     * @returns {Promise<void>}
     */
    async ensureSessionValid(page, pageIndex) {
        const isValid = await this.isSessionValid(page);
        
        if (!isValid) {
            console.log(`🔄 Session expired for page ${pageIndex + 1}, re-logging in...`);
            try {
                await this.loginOnPage(page);
                console.log(`✅ Re-login successful for page ${pageIndex + 1}`);
                
                // Add small delay after login
                await page.waitForTimeout(this.config.sessionRetryDelay);
            } catch (error) {
                console.error(`❌ Re-login failed for page ${pageIndex + 1}:`, error.message);
                throw new Error(`Session re-login failed: ${error.message}`);
            }
        }
    }

    async scrapeAttempt(record, page, pageIndex = 0) {
        const attemptId = record['Attempt ID'];
        const learnerEmail = record['Learner Email'];
        
        console.log(`🔍 Scraping attempt ${attemptId} for ${learnerEmail}...`);
        
        const result = {
            ...record,
            rogoUserId: null,
            rogoUserName: null,
            courseTitle: null,
            attemptNumber: null,
            learnerUploadedFiles: [],
            learnerFilesCount: 0,
            learnerFileNames: '',
            learnerFileUrls: '',
            learnerAzureBlobNames: '',
            learnerAzureBlobUrls: '',
            markerUploadedFiles: [],
            markerFilesCount: 0,
            markerFileNames: '',
            markerFileUrls: '',
            markerAzureBlobNames: '',
            markerAzureBlobUrls: '',
            error: null
        };

        try {
            // Ensure session is valid before attempting to scrape
            await this.ensureSessionValid(page, pageIndex);
            
            // Construct attempt URL
            const attemptUrl = `${this.config.attemptPageUrl}/${attemptId}`;
            console.log(`📍 Navigating to: ${attemptUrl}`);
            
            // Navigate to attempt page
            await page.goto(attemptUrl, { 
                waitUntil: 'networkidle2',
                timeout: this.config.timeout 
            });

            // Check if session expired during navigation (redirected to login)
            const currentUrl = page.url();
            if (currentUrl.includes('error') || currentUrl.includes('not-found')) {
                throw new Error(`Page not found or error loading attempt ${attemptId}`);
            }
            
            // Check if we were redirected to login page (session expired)
            if (currentUrl.includes('/Login') || currentUrl.includes('/Account/Login')) {
                console.log('⚠️ Session expired during navigation, re-logging in...');
                await this.ensureSessionValid(page, pageIndex);
                // Retry navigation after re-login
                await page.goto(attemptUrl, { 
                    waitUntil: 'networkidle2',
                    timeout: this.config.timeout 
                });
            }

            // Track critical elements that must be found
            let criticalElementsMissing = [];

            // Scrape course title and attempt number
            await this.scrapeCourseDetails(result, page);

            // Scrape student details
            const studentDetailsFound = await this.scrapeStudentDetails(result, page);
            if (!studentDetailsFound) {
                criticalElementsMissing.push('Student details link not found');
            }
            
            // Scrape learner submission details (multiple files)
            const learnerSubmissionFound = await this.scrapeLearnerSubmissions(result, page);
            if (!learnerSubmissionFound) {
                criticalElementsMissing.push('Learner submission not found');
            }
            
            // Scrape marker feedback details (multiple files)
            await this.scrapeMarkerFeedbackFiles(result, page);
            
            // If critical elements are missing, mark as failed
            if (criticalElementsMissing.length > 0) {
                const errorMessage = `Critical elements missing: ${criticalElementsMissing.join(', ')}`;
                console.log(`⚠️ Attempt ${attemptId} missing critical elements: ${criticalElementsMissing.join(', ')}`);
                result.error = errorMessage;
                
                // Add to failed attempts queue with all original input fields
                await this.dataQueue.addFailed({
                    'Membership Number': record['Membership Number'],
                    'First Name': record['First Name'],
                    'Surname': record['Surname'],
                    'Learner Email': learnerEmail,
                    'Attempt ID': attemptId,
                    'Unit Code': record['Unit Code'],
                    'Assessment ID': record['Assessment ID'],
                    'Error': errorMessage
                });
            } else {
                console.log(`✅ Successfully scraped attempt ${attemptId}`);
                
                // Add to successful attempts queue
                await this.dataQueue.addSuccessful(result);
            }
            
        } catch (error) {
            console.error(`❌ Failed to scrape attempt ${attemptId}:`, error.message);
            result.error = error.message;
            
            // Add to failed attempts queue with all original input fields
            await this.dataQueue.addFailed({
                'Membership Number': record['Membership Number'],
                'First Name': record['First Name'],
                'Surname': record['Surname'],
                'Learner Email': learnerEmail,
                'Attempt ID': attemptId,
                'Unit Code': record['Unit Code'],
                'Assessment ID': record['Assessment ID'],
                'Error': error.message
            });
        }

        return result;
    }

    async scrapeCourseDetails(result, page) {
        try {
            console.log('📚 Scraping course details...');
            
            // Get course title from h1 element
            const courseTitleElement = await page.$('#h1PageHeading');
            if (courseTitleElement) {
                const courseTitle = await page.evaluate(el => el.textContent.trim(), courseTitleElement);
                result.courseTitle = courseTitle;
                
                // Extract attempt number from course title using regex
                const attemptMatch = courseTitle.match(/Attempt\s+(\d+)/i);
                if (attemptMatch) {
                    result.attemptNumber = parseInt(attemptMatch[1]);
                }
                
                console.log(`✅ Course title: ${courseTitle}`);
                console.log(`✅ Attempt number: ${result.attemptNumber}`);
            } else {
                console.log('⚠️ Course title not found');
            }
        } catch (error) {
            console.error('❌ Failed to scrape course details:', error.message);
        }
    }

    async scrapeStudentDetails(result, page) {
        try {
            console.log('👤 Scraping student details...');
            
            const studentLink = await page.$('#ContentPlaceHolder1_hypStudentDetails');
            if (studentLink) {
                const href = await page.evaluate(el => el.getAttribute('href'), studentLink);
                const anchorText = await page.evaluate(el => el.textContent.trim(), studentLink);
                
                if (href) {
                    // Extract user ID from href like "/Student/12345/John-doe"
                    const match = href.match(/\/Student\/(\d+)\//);
                    if (match) {
                        result.rogoUserId = match[1];
                    }
                }
                
                result.rogoUserName = anchorText;
                
                console.log(`✅ Student details: ID=${result.rogoUserId}, Name=${result.rogoUserName}`);
                return true;
            } else {
                console.log('⚠️ Student details link not found');
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to scrape student details:', error.message);
            return false;
        }
    }

    async scrapeLearnerSubmissions(result, page) {
        try {
            console.log('📝 Scraping learner submissions...');
            
            // Try original UI structure first
            let learnerFiles = await this.scrapeLearnerSubmissionsOriginal(result, page);
            
            // If not found, try the new UI structure
            if (learnerFiles.length === 0) {
                console.log('⚠️ No files found in original location, trying alternative UI structure...');
                learnerFiles = await this.scrapeLearnerSubmissionsAlternative(result, page);
            }
            
            if (learnerFiles.length === 0) {
                console.log('⚠️ No learner files found in either UI structure');
                return false;
            }
            
            console.log(`📁 Found ${learnerFiles.length} learner files`);
            
            // Process all learner files
            for (const file of learnerFiles) {
                try {
                    console.log(`📥 Processing learner file: ${file.fileName}`);
                    
                    // Download and upload file
                    const uploadResult = await this.downloadAndUploadFile(
                        file.fileUrl, 
                        `learner_submission/attempt_${result['Attempt ID']}`, 
                        result, 
                        'learner',
                        file.fileName
                    );
                    
                    // Store file information
                    result.learnerUploadedFiles.push({
                        fileName: file.fileName,
                        fileUrl: file.fileUrl,
                        submittedDate: file.submittedDate,
                        azureBlobName: uploadResult.blobName,
                        azureBlobUrl: uploadResult.url
                    });
                    
                } catch (error) {
                    console.error(`❌ Failed to process learner file ${file.fileName}:`, error.message);
                    // Continue with other files even if one fails
                }
            }
            
            result.learnerFilesCount = result.learnerUploadedFiles.length;
            
            // Create comma-separated arrays
            result.learnerFileNames = result.learnerUploadedFiles.map(file => file.fileName).join(', ');
            result.learnerFileUrls = result.learnerUploadedFiles.map(file => file.fileUrl).join(', ');
            result.learnerAzureBlobNames = result.learnerUploadedFiles.map(file => file.azureBlobName).join(', ');
            result.learnerAzureBlobUrls = result.learnerUploadedFiles.map(file => file.azureBlobUrl).join(', ');
            
            console.log(`✅ Processed ${result.learnerFilesCount} learner files`);
            return true;
            
        } catch (error) {
            console.error('❌ Failed to scrape learner submissions:', error.message);
            return false;
        }
    }

    /**
     * Scrape learner submissions from the original UI structure
     * @param {Object} result - Result object to store data
     * @param {Page} page - Puppeteer page instance
     * @returns {Promise<Array>} Array of learner file objects
     */
    async scrapeLearnerSubmissionsOriginal(result, page) {
        const learnerFiles = [];
        
        // Check if learner submission container exists
        const fileListContainer = await page.$('#ContentPlaceHolder1_flCourseworkFiles_divFileList');
        if (!fileListContainer) {
            return learnerFiles; // Return empty array if container not found
        }
        
        // Find all learner files by looking for elements with pattern tdName_X
        let fileIndex = 0;
        
        while (true) {
            const fileNameElement = await page.$(`#ContentPlaceHolder1_flCourseworkFiles_rptFiles_tdName_${fileIndex}`);
            const downloadLink = await page.$(`#ContentPlaceHolder1_flCourseworkFiles_rptFiles_hypDownload_${fileIndex}`);
            const dateElement = await page.$(`#ContentPlaceHolder1_flCourseworkFiles_rptFiles_tdDate_${fileIndex}`);
        
            if (!fileNameElement || !downloadLink) {
                break; // No more files
            }
            
            // Get file details
            const fileName = await page.evaluate(el => el.textContent.trim(), fileNameElement);
            const fileUrl = await page.evaluate(el => el.getAttribute('href'), downloadLink);
            const submittedDate = dateElement ? await page.evaluate(el => el.textContent.trim(), dateElement) : null;
            
            learnerFiles.push({
                fileName: fileName,
                fileUrl: fileUrl,
                submittedDate: submittedDate,
                index: fileIndex
            });
            
            fileIndex++;
        }
        
        return learnerFiles;
    }

    /**
     * Scrape learner submissions from the alternative UI structure (new UI)
     * Files are in <ul class="uploaded-files-list"> with <li> elements
     * @param {Object} result - Result object to store data
     * @param {Page} page - Puppeteer page instance
     * @returns {Promise<Array>} Array of learner file objects
     */
    async scrapeLearnerSubmissionsAlternative(result, page) {
        const learnerFiles = [];
        
        try {
            // Look for the uploaded-files-list structure
            // This can appear in multiple sections, so we need to search for all instances
            const uploadedFilesLists = await page.$$('ul.uploaded-files-list');
            
            if (uploadedFilesLists.length === 0) {
                return learnerFiles; // Return empty array if no lists found
            }
            
            console.log(`📋 Found ${uploadedFilesLists.length} uploaded-files-list(s) in alternative UI`);
            
            // Process each uploaded-files-list
            for (let listIndex = 0; listIndex < uploadedFilesLists.length; listIndex++) {
                const list = uploadedFilesLists[listIndex];
                
                // Get all <li> elements within this list
                const listItems = await list.$$('li');
                
                for (let itemIndex = 0; itemIndex < listItems.length; itemIndex++) {
                    const listItem = listItems[itemIndex];
                    
                    // Find the file name span and download link within this <li>
                    const fileNameSpan = await listItem.$('span[id*="litUploadedFileName"]');
                    const downloadLink = await listItem.$('a[id*="hypUploadedFileLink"]');
                    
                    if (fileNameSpan && downloadLink) {
                        // Get file details
                        const fileName = await page.evaluate(el => el.textContent.trim(), fileNameSpan);
                        const fileUrl = await page.evaluate(el => el.getAttribute('href'), downloadLink);
                        
                        // Try to find date if available (may not be in this UI structure)
                        const dateElement = await listItem.$('span[id*="Date"], td[id*="Date"]');
                        const submittedDate = dateElement ? await page.evaluate(el => el.textContent.trim(), dateElement) : null;
                        
                        if (fileName && fileUrl) {
                            learnerFiles.push({
                                fileName: fileName,
                                fileUrl: fileUrl,
                                submittedDate: submittedDate,
                                index: learnerFiles.length
                            });
                        }
                    }
                }
            }
            
            console.log(`📁 Found ${learnerFiles.length} files in alternative UI structure`);
            
        } catch (error) {
            console.error('❌ Error scraping alternative UI structure:', error.message);
        }
        
        return learnerFiles;
    }

    async scrapeMarkerFeedbackFiles(result, page) {
        try {
            console.log('📋 Scraping marker feedback files...');
            
            // Check if marker feedback container exists
            const fileListContainer = await page.$('#ContentPlaceHolder1_flMarkerReports_divFileList');
            if (!fileListContainer) {
                console.log('⚠️ Marker feedback container not found');
                return;
            }
            
            // Find all marker files by looking for elements with pattern tdName_X
            const markerFiles = [];
            let fileIndex = 0;
            
            while (true) {
                const fileNameElement = await page.$(`#ContentPlaceHolder1_flMarkerReports_rptFiles_tdName_${fileIndex}`);
                
                if (!fileNameElement) {
                    break; // No more files
                }
                
                // Get file name
                const fileName = await page.evaluate(el => el.textContent.trim(), fileNameElement);
                
                // Get file URL from onclick attribute
                const onclickAttr = await page.evaluate(el => el.getAttribute('onclick'), fileNameElement);
                let fileUrl = null;
                
                if (onclickAttr) {
                    // Extract URL from window.open('https://cdn.rogoserver.com/file/...')
                    const urlMatch = onclickAttr.match(/window\.open\('([^']+)'\)/);
                    if (urlMatch) {
                        fileUrl = urlMatch[1];
                    }
                }
                
                if (fileUrl) {
                    markerFiles.push({
                        fileName: fileName,
                        fileUrl: fileUrl,
                        index: fileIndex
                    });
                }
                
                fileIndex++;
            }
            
            if (markerFiles.length === 0) {
                console.log('⚠️ No marker feedback files found');
                return;
            }
            
            console.log(`📁 Found ${markerFiles.length} marker feedback files`);
            
            // Process all marker files
            for (const file of markerFiles) {
                try {
                    console.log(`📥 Processing marker file: ${file.fileName}`);
                    
                    // Download and upload file
                    const uploadResult = await this.downloadAndUploadFile(
                        file.fileUrl, 
                        `marker_feedback/attempt_${result['Attempt ID']}`, 
                        result, 
                        'marker',
                        file.fileName
                    );
                    
                    // Store file information
                    result.markerUploadedFiles.push({
                        fileName: file.fileName,
                        fileUrl: file.fileUrl,
                        azureBlobName: uploadResult.blobName,
                        azureBlobUrl: uploadResult.url
                    });
                    
                } catch (error) {
                    console.error(`❌ Failed to process marker file ${file.fileName}:`, error.message);
                    // Continue with other files even if one fails
                }
            }
            
            result.markerFilesCount = result.markerUploadedFiles.length;
            
            // Create comma-separated arrays
            result.markerFileNames = result.markerUploadedFiles.map(file => file.fileName).join(', ');
            result.markerFileUrls = result.markerUploadedFiles.map(file => file.fileUrl).join(', ');
            result.markerAzureBlobNames = result.markerUploadedFiles.map(file => file.azureBlobName).join(', ');
            result.markerAzureBlobUrls = result.markerUploadedFiles.map(file => file.azureBlobUrl).join(', ');
            
            console.log(`✅ Processed ${result.markerFilesCount} marker feedback files`);
            
        } catch (error) {
            console.error('❌ Failed to scrape marker feedback files:', error.message);
        }
    }


    async downloadAndUploadFile(fileUrl, folder, result, type, originalFileName = null) {
        let tempFilePath = null;
        try {
            console.log(`📥 Downloading ${type} file: ${fileUrl}`);
            
            // Download file
            const response = await axios({
                method: 'GET',
                url: fileUrl,
                responseType: 'stream',
                timeout: 30000
            });
            
            // Use provided filename or fallback to URL filename
            if (!originalFileName) {
                const urlParts = fileUrl.split('/');
                originalFileName = urlParts[urlParts.length - 1];
            }
            
            // Extract file extension and base name from the filename
            const fileExtension = originalFileName.split('.').pop() || '';
            const baseName = originalFileName.replace(/\.[^/.]+$/, ""); // Remove extension
            
            // Create timestamp-based filename with proper extension
            const timestamp = Date.now();
            const fileName = fileExtension ? `${timestamp}_${baseName}.${fileExtension}` : `${timestamp}_${baseName}`;
            
            console.log(`📝 Using filename: ${originalFileName}`);
            console.log(`📝 Generated filename: ${fileName}`);
            
            // Save to temporary file
            await this.ensureDirectories();
            tempFilePath = path.join(this.tempDir, fileName);
            
            const writer = require('fs').createWriteStream(tempFilePath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            // Upload to Azure Blob Storage
            const blobName = `${folder}/${fileName}`;
            const uploadResult = await this.azureService.uploadFile(tempFilePath, blobName, {
                metadata: {
                    originalUrl: fileUrl,
                    originalFileName: originalFileName,
                    type: type,
                    uploadedAt: new Date().toISOString()
                }
            });
            
            // Clean up temp file after successful upload
            await fs.unlink(tempFilePath);
            tempFilePath = null; // Mark as cleaned up
            
            console.log(`✅ ${type} file uploaded to Azure: ${blobName}`);
            
            return uploadResult;
            
        } catch (error) {
            console.error(`❌ Failed to download/upload ${type} file:`, error.message);
            
            // Always attempt to clean up temp file, even on error
            if (tempFilePath) {
                try {
                    await fs.unlink(tempFilePath);
                    console.log(`🗑️ Cleaned up temporary file: ${tempFilePath}`);
                } catch (cleanupError) {
                    console.error(`⚠️ Failed to clean up temporary file ${tempFilePath}:`, cleanupError.message);
                }
            }
            
            throw error;
        }
    }

    async processAllAttempts() {
        console.log(`🔄 Processing ${this.inputData.length} attempts with ${this.config.concurrentWorkers} parallel workers (true parallelization)...`);
        
        // Record start time (only if not resuming)
        if (!this.timing.startTime) {
        this.timing.startTime = new Date();
        }
        console.log(`⏰ Start time: ${this.timing.startTime.toISOString()}`);
        
        // Filter out already processed attempts
        const unprocessedData = this.inputData.filter(record => 
            !this.processedAttempts.has(record['Attempt ID'])
        );
        
        console.log(`📊 Total attempts: ${this.inputData.length}, Already processed: ${this.processedAttempts.size}, Remaining: ${unprocessedData.length}`);
        
        if (unprocessedData.length === 0) {
            console.log('✅ All attempts have already been processed!');
            // Save final checkpoint
            await this.saveCheckpoint();
            return;
        }
        
        // Initialize work queue with all unprocessed attempts
        this.workQueue = [...unprocessedData];
        // Preserve completedCount if resuming
        const initialCompletedCount = this.completedCount;
        const totalAttempts = this.workQueue.length;
        
        console.log(`📦 Work queue initialized with ${totalAttempts} attempts`);
        console.log(`🚀 Starting ${this.config.concurrentWorkers} parallel workers...`);
        
        // Save initial checkpoint
        await this.saveCheckpoint();
        
        // Start all workers concurrently - each will pull from the queue as work becomes available
        const workerPromises = this.pages.map((page, pageIndex) => 
            this.processWorker(page, pageIndex)
        );
        
        // Wait for all workers to complete
        await Promise.all(workerPromises);
        
        // Record end time and calculate totals
        this.timing.endTime = new Date();
        this.timing.totalTime = (this.timing.endTime - this.timing.startTime) / 1000; // Convert to seconds
        this.timing.averageTime = this.timing.attemptTimes.length > 0 
            ? this.timing.attemptTimes.reduce((sum, attempt) => sum + attempt.duration, 0) / this.timing.attemptTimes.length 
            : 0;
        
        console.log(`\n⏰ End time: ${this.timing.endTime.toISOString()}`);
        console.log(`⏱️  Total processing time: ${this.timing.totalTime.toFixed(2)} seconds`);
        console.log(`📊 Average time per attempt: ${this.timing.averageTime.toFixed(2)} seconds`);
        
        // Flush any remaining data in queues
        console.log('🔄 Flushing remaining data to files...');
        await this.dataQueue.flushAll();
        
        // Save final checkpoint
        await this.saveCheckpoint();
        
        // Perform final backup
        await this.performPeriodicBackup();
        
        // Log final queue statistics
        const finalQueueStats = this.dataQueue.getStats();
        console.log(`✅ Processing completed: ${this.timing.attemptTimes.length} total attempts processed`);
        console.log(`📊 Final queue status - Successful: ${finalQueueStats.successfulQueueSize}, Failed: ${finalQueueStats.failedQueueSize}`);
        
        // Log detailed timing breakdown
        this.logTimingBreakdown();
    }

    /**
     * Thread-safe method to get the next work item from the queue
     * @returns {Promise<Object|null>} The next record to process, or null if queue is empty
     */
    async getNextWork() {
        this.queueMutex = this.queueMutex.then(async () => {
            if (this.workQueue.length > 0) {
                return this.workQueue.shift();
            } else {
                return null;
            }
        });
        return await this.queueMutex;
    }

    /**
     * Worker that continuously pulls work from the queue until empty
     * This enables true parallelization - workers work concurrently and grab next item when available
     * @param {Page} page - Puppeteer page instance for this worker
     * @param {number} workerId - Worker identifier (0-based)
     */
    async processWorker(page, workerId) {
        console.log(`🚀 Worker ${workerId + 1} started`);
        this.activeWorkers++;
        let localCount = 0;
        
        try {
            while (true) {
                // Get next work item from queue (thread-safe)
                const record = await this.getNextWork();
                
                // If no work available, worker is done
                if (!record) {
                    break;
                }
                
            const attemptId = record['Attempt ID'];
            const learnerEmail = record['Learner Email'];
                localCount++;
            
                // Log progress with queue status
                const remaining = this.workQueue.length;
                const completed = this.completedCount;
                console.log(`\n📊 Worker ${workerId + 1} - Processing attempt ${attemptId} (${learnerEmail}) [${localCount} processed, ${remaining} remaining in queue, ${completed} total completed]`);
            
            // Record attempt start time
            const attemptStartTime = new Date();
            
                try {
                    // Process the attempt (with session validation and retry)
                    const result = await this.scrapeAttempt(record, page, workerId);
            
            // Record attempt end time and calculate duration
            const attemptEndTime = new Date();
            const attemptDuration = (attemptEndTime - attemptStartTime) / 1000; // Convert to seconds
            
                    // Store timing data (thread-safe using mutex)
                    this.queueMutex = this.queueMutex.then(async () => {
            this.timing.attemptTimes.push({
                attemptId: attemptId,
                learnerEmail: learnerEmail,
                duration: attemptDuration,
                startTime: attemptStartTime,
                            endTime: attemptEndTime,
                            pageIndex: workerId
                        });
                        this.completedCount++;
                        this.processedAttempts.add(attemptId);
                        
                        // Save checkpoint every N records
                        if (this.completedCount % this.config.checkpointInterval === 0) {
                            await this.saveCheckpoint();
                        }
                    });
                    await this.queueMutex;
                    
                    console.log(`✅ Worker ${workerId + 1} - Attempt ${attemptId} completed in ${attemptDuration.toFixed(2)} seconds`);
                    
                    // Log queue statistics every 50 completed attempts (across all workers)
                    if (this.completedCount % 50 === 0) {
                        const queueStats = this.dataQueue.getStats();
                        console.log(`📊 Progress: ${this.completedCount} completed, ${this.workQueue.length} remaining | Queue Status - Successful: ${queueStats.successfulQueueSize}/${queueStats.saveAfterSuccessful}, Failed: ${queueStats.failedQueueSize}/${queueStats.saveAfterUnsuccessful}`);
                    }
                    
                    // Perform periodic backup
                    await this.performPeriodicBackup();
                    
                } catch (error) {
                    // Error handling is done in scrapeAttempt, but we still update counts
                    this.queueMutex = this.queueMutex.then(async () => {
                        this.completedCount++;
                        this.processedAttempts.add(attemptId);
                    });
                    await this.queueMutex;
                }
                
                // Add small delay between requests to avoid overwhelming the server
                await page.waitForTimeout(1000);
            }
        } finally {
            this.activeWorkers--;
            console.log(`✅ Worker ${workerId + 1} finished after processing ${localCount} attempts`);
        }
    }

    logTimingBreakdown() {
        console.log('\n📈 Detailed Timing Breakdown:');
        console.log('=' .repeat(80));
        
        if (this.timing.attemptTimes.length === 0) {
            console.log('No attempts processed.');
            return;
        }
        
        // Sort attempts by duration (fastest to slowest)
        const sortedAttempts = [...this.timing.attemptTimes].sort((a, b) => a.duration - b.duration);
        
        console.log(`📊 Total Attempts: ${this.timing.attemptTimes.length}`);
        console.log(`⏱️  Total Time: ${this.timing.totalTime.toFixed(2)} seconds`);
        console.log(`📈 Average Time: ${this.timing.averageTime.toFixed(2)} seconds`);
        console.log(`🏃 Fastest Attempt: ${sortedAttempts[0].attemptId} (${sortedAttempts[0].duration.toFixed(2)}s) - ${sortedAttempts[0].learnerEmail}`);
        console.log(`🐌 Slowest Attempt: ${sortedAttempts[sortedAttempts.length - 1].attemptId} (${sortedAttempts[sortedAttempts.length - 1].duration.toFixed(2)}s) - ${sortedAttempts[sortedAttempts.length - 1].learnerEmail}`);
        
        // Calculate median
        const medianIndex = Math.floor(sortedAttempts.length / 2);
        const median = sortedAttempts.length % 2 === 0 
            ? (sortedAttempts[medianIndex - 1].duration + sortedAttempts[medianIndex].duration) / 2
            : sortedAttempts[medianIndex].duration;
        console.log(`📊 Median Time: ${median.toFixed(2)} seconds`);
        
        // Show top 5 slowest attempts
        console.log('\n🐌 Top 5 Slowest Attempts:');
        sortedAttempts.slice(-5).reverse().forEach((attempt, index) => {
            console.log(`   ${index + 1}. Attempt ${attempt.attemptId}: ${attempt.duration.toFixed(2)}s (${attempt.learnerEmail})`);
        });
        
        // Show top 5 fastest attempts
        console.log('\n🏃 Top 5 Fastest Attempts:');
        sortedAttempts.slice(0, 5).forEach((attempt, index) => {
            console.log(`   ${index + 1}. Attempt ${attempt.attemptId}: ${attempt.duration.toFixed(2)}s (${attempt.learnerEmail})`);
        });
        
        console.log('=' .repeat(80));
    }

    async generateOutputFiles() {
        try {
        console.log('📄 Output files are generated incrementally by the queue system...');
        console.log(`📁 Files are automatically saved to: ${this.outputDir}`);
        console.log('   • scraped_data.csv - Successfully scraped data (incremental CSV)');
        console.log('   • failed_attempts.csv - Failed attempts (incremental CSV)');
        console.log('   • timing_summary.xlsx - Processing timing and performance metrics');
            
            // Generate timing summary file
            await this.generateTimingSummary();
            
        } catch (error) {
            console.error('❌ Failed to generate timing summary:', error.message);
            throw error;
        }
    }

    async generateTimingSummary() {
        try {
            console.log('📊 Generating timing summary...');
            
            await this.ensureDirectories();
            const timingFilePath = path.join(this.outputDir, 'timing_summary.xlsx');
            
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Timing Summary');
            
            worksheet.columns = [
                { header: 'Metric', key: 'metric' },
                { header: 'Value', key: 'value' }
            ];
            
            worksheet.addRow({ metric: 'Start Time', value: this.timing.startTime ? this.timing.startTime.toISOString() : 'N/A' });
            worksheet.addRow({ metric: 'End Time', value: this.timing.endTime ? this.timing.endTime.toISOString() : 'N/A' });
            worksheet.addRow({ metric: 'Total Processing Time (seconds)', value: this.timing.totalTime.toFixed(2) });
            worksheet.addRow({ metric: 'Average Time per Attempt (seconds)', value: this.timing.averageTime.toFixed(2) });
            worksheet.addRow({ metric: 'Total Attempts Processed', value: this.timing.attemptTimes.length });
            
            // Add individual attempt timing data
            worksheet.addRow({ metric: '', value: '' }); // Empty row
            worksheet.addRow({ metric: 'Individual Attempt Timings', value: '' });
            worksheet.addRow({ metric: 'Attempt ID', value: 'Duration (seconds)' });
            
            this.timing.attemptTimes.forEach(attempt => {
                worksheet.addRow({ 
                    metric: attempt.attemptId, 
                    value: attempt.duration.toFixed(2) 
                });
            });

            await workbook.xlsx.writeFile(timingFilePath);
            console.log(`✅ Generated timing summary: ${timingFilePath}`);
            
        } catch (error) {
            console.error('❌ Failed to generate timing summary:', error.message);
            throw error;
        }
    }

    async close() {
        try {
            // Close data queue first to ensure all data is saved
            if (this.dataQueue) {
                await this.dataQueue.close();
            }
            
            if (this.browser) {
                await this.browser.close();
                console.log('🔒 Browser closed');
            }
        } catch (error) {
            console.error('❌ Error closing resources:', error.message);
        }
    }

    async run() {
        try {
            await this.init();
            
            // Load input data
            const inputFilePath = path.join(process.cwd(), 'assets', 'rogo_prod_assessment_data.xlsx');
            await this.loadInputData(inputFilePath);
            
            // Load previously processed attempts and checkpoint for resume support
            await this.loadProcessedAttempts();
            
            // Login (after loading checkpoint so we know how many to process)
            await this.login();
            
            // Process all attempts
            await this.processAllAttempts();
            
            // Generate output files
            await this.generateOutputFiles();
            
            console.log('\n🎉 Rogo Assessment Scraping completed successfully!');
            
        } catch (error) {
            console.error('❌ Rogo Assessment Scraping failed:', error.message);
            // Save checkpoint even on error so we can resume
            try {
                await this.saveCheckpoint();
                console.log('💾 Checkpoint saved before exit');
            } catch (checkpointError) {
                console.error('⚠️ Failed to save checkpoint on error:', checkpointError.message);
            }
            throw error;
        } finally {
            await this.close();
        }
    }
}

module.exports = RogoAssessmentScraper;
