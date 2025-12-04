const RogoAssessmentScraper = require('./services/rogoAssessmentScraper');
const path = require('path');
const fs = require('fs').promises;

/**
 * Setup console logging to both console and file
 */
function setupLogging(outputDir) {
    const logFilePath = path.join(outputDir, 'console.log');
    
    // Create a write stream for the log file
    const logStream = require('fs').createWriteStream(logFilePath, { flags: 'a' });
    
    // Store original console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    
    // Get timestamp for log entries
    const getTimestamp = () => new Date().toISOString();
    
    // Override console.log
    console.log = (...args) => {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        const logEntry = `[${getTimestamp()}] ${message}\n`;
        logStream.write(logEntry);
        originalLog.apply(console, args);
    };
    
    // Override console.error
    console.error = (...args) => {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        const logEntry = `[${getTimestamp()}] ERROR: ${message}\n`;
        logStream.write(logEntry);
        originalError.apply(console, args);
    };
    
    // Override console.warn
    console.warn = (...args) => {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        const logEntry = `[${getTimestamp()}] WARN: ${message}\n`;
        logStream.write(logEntry);
        originalWarn.apply(console, args);
    };
    
    // Override console.info
    console.info = (...args) => {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        const logEntry = `[${getTimestamp()}] ${message}\n`;
        logStream.write(logEntry);
        originalInfo.apply(console, args);
    };
    
    // Handle process exit to close log stream
    process.on('exit', () => {
        logStream.end();
    });
    
    process.on('SIGINT', () => {
        logStream.end();
        process.exit();
    });
    
    process.on('SIGTERM', () => {
        logStream.end();
        process.exit();
    });
    
    return logFilePath;
}

/**
 * Main script to scrape and process Rogo Assessment Data
 * 
 * This script will:
 * 1. Load data from assets/rogo_prod_assessment_data.xlsx
 * 2. Login to Rogo platform
 * 3. For each record, scrape attempt details including:
 *    - Student details
 *    - Learner submission files
 *    - Marker feedback files
 *    - Turnitin reports
 * 4. Download and upload files to Azure Blob Storage
 * 5. Generate output Excel files with results
 */

async function main() {
    // Initialize scraper to get output directory
    const scraper = new RogoAssessmentScraper();
    
    // Setup logging to file (before any console.log calls)
    const logFilePath = setupLogging(scraper.outputDir);
    console.log(`📝 Console logs will be saved to: ${logFilePath}`);
    
    console.log('🚀 Starting Rogo Assessment Data Scraping...\n');
    console.log("ROGO_URL", process.env.ROGO_URL);
    
    try {
        // Ensure output directory exists for logging
        await scraper.ensureDirectories();
        
        // Check if input file exists
        const inputFilePath = path.join(process.cwd(), 'assets', 'rogo_prod_assessment_data.xlsx');
        
        try {
            await fs.access(inputFilePath);
            console.log(`✅ Input file found: ${inputFilePath}`);
        } catch (error) {
            console.error(`❌ Input file not found: ${inputFilePath}`);
            console.error('Please ensure the file exists in the assets folder.');
            process.exit(1);
        }
        
        // Run the scraping process
        await scraper.run();
        
        console.log('\n🎉 Assessment scraping completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   • Total records processed: ${scraper.timing.attemptTimes.length}`);
        console.log('   • Data saved incrementally to output files during processing');
        
        // Display timing summary
        if (scraper.timing.startTime && scraper.timing.endTime) {
            console.log('\n⏱️  Timing Summary:');
            console.log(`   • Start time: ${scraper.timing.startTime.toISOString()}`);
            console.log(`   • End time: ${scraper.timing.endTime.toISOString()}`);
            console.log(`   • Total processing time: ${scraper.timing.totalTime.toFixed(2)} seconds`);
            console.log(`   • Average time per attempt: ${scraper.timing.averageTime.toFixed(2)} seconds`);
            
            if (scraper.timing.attemptTimes.length > 0) {
                const sortedAttempts = [...scraper.timing.attemptTimes].sort((a, b) => a.duration - b.duration);
                console.log(`   • Fastest attempt: ${sortedAttempts[0].duration.toFixed(2)}s (${sortedAttempts[0].attemptId})`);
                console.log(`   • Slowest attempt: ${sortedAttempts[sortedAttempts.length - 1].duration.toFixed(2)}s (${sortedAttempts[sortedAttempts.length - 1].attemptId})`);
            }
        }
        
        console.log(`\n📁 Output files generated in: ${scraper.outputDir}`);
        console.log('   • scraped_data.csv - Successfully scraped data (incremental CSV)');
        console.log('   • failed_attempts.csv - Failed attempts (incremental CSV)');
        console.log('   • timing_summary.xlsx - Processing timing and performance metrics');
        console.log(`   • console.log - Console output log file`);
        
        console.log(`\n📝 All console logs saved to: ${path.join(scraper.outputDir, 'console.log')}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n💥 Assessment scraping failed:', error.message);
        console.error('\n🔍 Troubleshooting tips:');
        console.error('   • Check your .env file has all required variables');
        console.error('   • Verify your Rogo credentials are correct');
        console.error('   • Ensure the input Excel file exists and has the correct format');
        console.error('   • Check your Azure Storage connection string');
        console.error('   • Verify network connectivity to Rogo platform');
        
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main();
}

module.exports = main;
