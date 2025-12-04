/**
 * TypeScript adapter for the Rogo scraper
 * Wraps the JavaScript scraper to provide a clean interface for the migration script
 */

import { createRequire } from 'module';
import * as path from 'path';

const require = createRequire(import.meta.url);

// Import the JavaScript scraper (now .cjs for CommonJS compatibility)
const RogoAssessmentScraper = require('./rogoAssessmentScraper.cjs');

export interface ScrapedFile {
  fileName: string;
  fileUrl: string;
  submittedDate: string | null;
  azureBlobName?: string;
  azureBlobUrl?: string;
}

export interface ScrapeAttemptResult {
  success: boolean;
  files: ScrapedFile[];
  error?: string;
}

export class RogoScraperAdapter {
  private scraper: any;
  private initialized: boolean = false;

  constructor() {
    // Initialize the scraper with minimal config
    this.scraper = new RogoAssessmentScraper();
  }

    /**
     * Initialize the scraper (login to Rogo)
     */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('🔐 Initializing Rogo scraper (logging in)...');
    
    try {
      // Use the scraper's init() method which sets up browser, Azure service, and logs in
      await this.scraper.init();
      
      this.initialized = true;
      console.log('✅ Rogo scraper initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Rogo scraper:', error);
      throw error;
    }
  }

  /**
   * Scrape files for a specific attempt ID
   */
  async scrapeAttemptFiles(attemptId: number, learnerEmail: string): Promise<ScrapeAttemptResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`🔍 Scraping files for attempt ${attemptId}...`);

    try {
      // Create a minimal record object for the scraper
      const record = {
        'Attempt ID': attemptId,
        'Learner Email': learnerEmail,
      };

      // Use the first page (index 0)
      const page = this.scraper.pages[0];
      if (!page) {
        throw new Error('No browser page available');
      }

      // Create result object
      const result: any = {
        'Attempt ID': attemptId,
        learnerUploadedFiles: [],
        learnerFilesCount: 0,
      };

      // Navigate to attempt page
      const attemptUrl = `${this.scraper.config.attemptPageUrl}/${attemptId}`;
      await page.goto(attemptUrl, {
        waitUntil: 'networkidle2',
        timeout: this.scraper.config.timeout,
      });

      // Check if session expired
      const currentUrl = page.url();
      if (currentUrl.includes('/Login') || currentUrl.includes('/Account/Login')) {
        console.log('⚠️ Session expired, re-logging in...');
        await this.scraper.ensureSessionValid(page, 0);
        await page.goto(attemptUrl, {
          waitUntil: 'networkidle2',
          timeout: this.scraper.config.timeout,
        });
      }

      // Scrape learner files
      let learnerFiles = await this.scraper.scrapeLearnerSubmissionsOriginal(result, page);
      
      if (learnerFiles.length === 0) {
        learnerFiles = await this.scraper.scrapeLearnerSubmissionsAlternative(result, page);
      }

      if (learnerFiles.length === 0) {
        return {
          success: false,
          files: [],
          error: 'No learner files found',
        };
      }

      console.log(`📁 Found ${learnerFiles.length} learner files`);

      // Return file information (we'll download and upload to production storage in the migration script)
      const processedFiles: ScrapedFile[] = [];
      
      for (const file of learnerFiles) {
        processedFiles.push({
          fileName: file.fileName,
          fileUrl: file.fileUrl, // Original Rogo URL - will be downloaded and uploaded to production storage
          submittedDate: file.submittedDate,
          // No Azure info - files will be uploaded to production storage by migration script
        });
      }

      if (processedFiles.length === 0) {
        return {
          success: false,
          files: [],
          error: 'Failed to process any files',
        };
      }

      return {
        success: true,
        files: processedFiles,
      };
    } catch (error) {
      console.error(`❌ Failed to scrape attempt ${attemptId}:`, error);
      return {
        success: false,
        files: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up resources (close browser)
   */
  async cleanup(): Promise<void> {
    if (this.scraper && this.scraper.browser) {
      console.log('🧹 Cleaning up Rogo scraper...');
      try {
        await this.scraper.browser.close();
        this.initialized = false;
        console.log('✅ Rogo scraper cleaned up');
      } catch (error) {
        console.error('⚠️ Error during cleanup:', error);
      }
    }
  }
}

