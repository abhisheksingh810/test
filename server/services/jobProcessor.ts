import { turnitinService } from './turnitinService';
import { wordCountService } from './wordCountService';

interface TurnitinJob {
  type: 'turnitin';
  id: string;
  submissionFileId: string;
  submissionId: string;
  fileName: string;
  fileUrl: string;
  submitterEmail: string;
  submitterId?: string;
  assignmentId?: string;
  courseId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  nextAttempt: Date;
  turnitinSubmissionId?: string;
  error?: string;
}

interface WordCountJob {
  type: 'wordcount';
  id: string;
  submissionId: string;
  fileName: string;
  fileUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  nextAttempt: Date;
  error?: string;
}

type Job = TurnitinJob | WordCountJob;

class JobProcessor {
  private jobs = new Map<string, Job>();
  private isProcessing = false;
  private readonly POLL_INTERVAL = 60000; // 1 minute
  private readonly MAX_ATTEMPTS = 5;
  private readonly RETRY_DELAY = 60000; // 1 minute

  constructor() {
    // Start processing jobs
    this.startProcessing();
  }

  async addTurnitinJob(
    submissionFileId: string,
    submissionId: string,
    fileName: string,
    fileUrl: string,
    submitterEmail: string,
    submitterId?: string,
    assignmentId?: string,
    courseId?: string
  ): Promise<string> {
    const jobId = `turnitin_${submissionFileId}_${Date.now()}`;
    
    const job: TurnitinJob = {
      type: 'turnitin',
      id: jobId,
      submissionFileId,
      submissionId,
      fileName,
      fileUrl,
      submitterEmail,
      submitterId,
      assignmentId,
      courseId,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
      nextAttempt: new Date(Date.now() + 5000) // Start in 5 seconds
    };

    this.jobs.set(jobId, job);
    console.log(`📋 Added Turnitin job: ${jobId} for file: ${fileName}`);
    
    return jobId;
  }

  async addWordCountJob(
    submissionId: string,
    fileName: string,
    fileUrl: string
  ): Promise<string> {
    const jobId = `wordcount_${submissionId}_${Date.now()}`;
    
    const job: WordCountJob = {
      type: 'wordcount',
      id: jobId,
      submissionId,
      fileName,
      fileUrl,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      nextAttempt: new Date(Date.now() + 2000) // Start in 2 seconds
    };

    this.jobs.set(jobId, job);
    console.log(`📋 Added word count job: ${jobId} for file: ${fileName}`);
    
    return jobId;
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('🔄 Starting Turnitin job processor with TCA v1 integration');
    
    const processJobs = async () => {
      try {
        await this.processNextJobs();
      } catch (error) {
        console.error('Job processor error:', error);
      }
      
      setTimeout(processJobs, this.POLL_INTERVAL);
    };

    processJobs();
  }

  private async processNextJobs(): Promise<void> {
    const now = new Date();
    const allJobs = Array.from(this.jobs.values());
    console.log(`🔍 Checking ${allJobs.length} jobs at ${now.toISOString()}`);
    
    const pendingJobs = allJobs
      .filter(job => {
        const isEligible = (job.status === 'pending' || job.status === 'processing') && 
          job.nextAttempt <= now &&
          job.attempts < job.maxAttempts;
        
        if (!isEligible && (job.status === 'pending' || job.status === 'processing')) {
          console.log(`⏳ Job ${job.id} not ready yet. Next attempt: ${job.nextAttempt.toISOString()}, Now: ${now.toISOString()}`);
        }
        
        return isEligible;
      })
      .slice(0, 5); // Process up to 5 jobs at once

    if (pendingJobs.length === 0) {
      console.log(`📭 No jobs ready for processing`);
      return;
    }

    console.log(`🔄 Processing ${pendingJobs.length} Turnitin jobs...`);

    await Promise.all(pendingJobs.map(job => this.processJob(job)));
  }

  private async processJob(job: Job): Promise<void> {
    const { storage } = await import('../storage');
    
    try {
      job.attempts++;
      
      if (job.type === 'turnitin') {
        if (job.status === 'pending') {
          // Submit file to Turnitin
          await this.submitFileToTurnitin(job, storage);
        } else if (job.status === 'processing') {
          // Check status and get results
          await this.checkTurnitinStatus(job, storage);
        }
      } else if (job.type === 'wordcount') {
        await this.processWordCountJob(job, storage);
      }
      
    } catch (error) {
      console.error(`Job ${job.id} error:`, error);
      job.error = error instanceof Error ? error.message : 'Unknown error';
      
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        if (job.type === 'turnitin') {
          await this.updateSubmissionFileStatus(job.submissionFileId, 'error', storage, job.error);
        }
        console.error(`❌ Job ${job.id} failed permanently after ${job.attempts} attempts`);
      } else {
        // Retry later
        job.nextAttempt = new Date(Date.now() + this.RETRY_DELAY * job.attempts);
        console.log(`⏳ Job ${job.id} will retry in ${this.RETRY_DELAY * job.attempts / 1000} seconds`);
      }
    }
  }

  private async processWordCountJob(job: WordCountJob, storage: any): Promise<void> {
    console.log(`📊 Processing word count for job: ${job.id}`);
    
    const result = await wordCountService.countWordsFromFile(job.fileUrl, job.fileName);
    
    if (result.success) {
      console.log(`✅ Word count completed: ${result.wordCount} words for ${job.fileName}`);
      
      await storage.updateSubmissionGradeWordCount(job.submissionId, result.wordCount);
      
      job.status = 'completed';
      this.jobs.delete(job.id);
    } else {
      throw new Error(result.error || 'Word count failed');
    }
  }

  private async submitFileToTurnitin(job: TurnitinJob, storage: any): Promise<void> {
    console.log(`🔧 Starting TurnItIn submission for job: ${job.id}`);
    
    // Safety check: Skip Turnitin submission for marker feedback files
    const file = await storage.getSubmissionFile(job.submissionFileId);
    if (file && file.submissionFileType === 'feedback') {
      console.log(`⏭️ Skipping TurnItIn submission for marker feedback file: ${job.fileName}`);
      // Mark job as completed/skipped
      job.status = 'completed';
      await this.updateSubmissionFileStatus(
        job.submissionFileId,
        'pending', // Keep as pending since we're not submitting
        storage,
        'Skipped - marker feedback files are not submitted to TurnItIn'
      );
      return;
    }
    
    // Download file from Azure Blob Storage
    const fileBuffer = await this.downloadFile(job.fileUrl);
    
    // Ensure EULA acceptance before creating submission
    console.log(`📋 Ensuring EULA acceptance for user: ${job.submitterEmail}`);
    const eulaAcceptance = await turnitinService.ensureEulaAcceptance(
      storage,
      job.submitterId || job.submitterEmail,
      job.submitterEmail,
      'en-US'
    );
    console.log(`✅ EULA acceptance confirmed for user: ${job.submitterEmail}`);
    
    // Create TCA v1 submission with proper metadata
    const submission = await turnitinService.createSubmission(storage, {
      submitterEmail: job.submitterEmail,
      submitterFirstName: '',
      submitterLastName: '',
      title: `${job.fileName} - Assignment Submission`,
      groupId: job.assignmentId || 'default-assignment',
      groupName: 'Assignment Submission',
      contextId: job.courseId || 'default-course',
      contextName: 'Course Assignment',
      eulaAcceptance: eulaAcceptance
    });
    
    // Upload file to the created submission using TCA v1
    await turnitinService.uploadSubmissionFile(storage, submission.id, fileBuffer, job.fileName);
    
    job.turnitinSubmissionId = submission.id;
    job.status = 'processing';
    job.nextAttempt = new Date(Date.now() + 60000); // Check status in 1 minute
    
    // Update database
    await this.updateSubmissionFileStatus(
      job.submissionFileId, 
      'processing', 
      storage, 
      undefined, 
      submission.id
    );
    
    console.log(`✅ Submitted file to Turnitin: ${submission.id} for job: ${job.id} - will check status in next cycle`);
  }

  private async checkTurnitinStatus(job: TurnitinJob, storage: any): Promise<void> {
    if (!job.turnitinSubmissionId) {
      throw new Error('No Turnitin submission ID available');
    }

    let similarityInfo;
    
    try {
      // Check if similarity report already exists
      similarityInfo = await turnitinService.getSimilarityReportInfo(
        storage, 
        job.turnitinSubmissionId
      );
    } catch (error: any) {
      // If we get a 404, it means no similarity report exists yet - create one
      if (error.message?.includes('404')) {
        console.log(`🔧 Creating similarity report for job: ${job.id}`);
        try {
          await turnitinService.generateSimilarityReport(storage, job.turnitinSubmissionId, {
            addToIndex: true,
            searchRepositories: ['INTERNET', 'SUBMITTED_WORK', 'PUBLICATION', 'CROSSREF', 'CROSSREF_POSTED_CONTENT']
          });
          
          // Schedule next check in 1 minute
          job.nextAttempt = new Date(Date.now() + 60000);
          console.log(`✅ Similarity report generation initiated for job: ${job.id}`);
          return;
        } catch (genError) {
          console.error(`❌ Failed to generate similarity report for job: ${job.id}:`, genError);
          throw genError;
        }
      } else {
        throw error; // Re-throw other errors
      }
    }
    
    if (similarityInfo.status === 'COMPLETE' && similarityInfo.overall_match_percentage !== undefined) {
      // Update database with similarity report results
      await storage.updateSubmissionFile(job.submissionFileId, {
        turnitinStatus: 'complete',
        turnitinSimilarityScore: similarityInfo.overall_match_percentage,
        turnitinProcessedAt: new Date()
      });
      
      // Start PDF generation process
      console.log(`📄 Starting PDF generation for job: ${job.id}`);
      try {
        const pdfResponse = await turnitinService.generateSimilarityReportPdf(
          storage,
          job.turnitinSubmissionId
        );
        
        // Update database with PDF ID and status
        await storage.updateSubmissionFile(job.submissionFileId, {
          turnitinPdfId: pdfResponse.pdf_id,
          turnitinPdfStatus: 'processing'
        });
        
        // Continue polling for PDF completion
        job.nextAttempt = new Date(Date.now() + 60000); // Check PDF status in 1 minute
        console.log(`📄 PDF generation initiated for job: ${job.id}, PDF ID: ${pdfResponse.pdf_id}`);
        
      } catch (pdfError) {
        console.error(`❌ PDF generation failed for job: ${job.id}:`, pdfError);
        // Mark job as completed even if PDF fails
        job.status = 'completed';
        this.jobs.delete(job.id);
      }
      
    } else if (similarityInfo.status === 'PROCESSING') {
      // Still processing similarity report, check again later
      job.nextAttempt = new Date(Date.now() + 60000); // Check again in 1 minute
      console.log(`⏳ Turnitin similarity report still processing job: ${job.id}, status: ${similarityInfo.status}`);
    } else {
      // Handle error or unknown status
      throw new Error(`Turnitin processing failed: ${similarityInfo.status}`);
    }
    
    // Check PDF status if we have a PDF ID
    const fileRecord = await storage.getSubmissionFile(job.submissionFileId);
    if (fileRecord?.turnitinPdfId && fileRecord.turnitinPdfStatus === 'processing') {
      await this.checkPdfStatus(job, storage, fileRecord.turnitinPdfId);
    }
  }

  private async downloadFile(fileUrl: string): Promise<Buffer> {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async updateSubmissionFileStatus(
    fileId: string, 
    status: string, 
    storage: any, 
    error?: string,
    turnitinSubmissionId?: string
  ): Promise<void> {
    const updateData: any = { turnitinStatus: status };
    
    if (error) {
      updateData.turnitinErrorMessage = error;
    }
    
    if (turnitinSubmissionId) {
      updateData.turnitinSubmissionId = turnitinSubmissionId;
    }
    
    await storage.updateSubmissionFile(fileId, updateData);
  }

  // Public methods for monitoring
  getJobStatus(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  getActiveJobs(): Job[] {
    return Array.from(this.jobs.values()).filter(job => 
      job.status === 'pending' || job.status === 'processing'
    );
  }

  getJobCount(): { total: number; pending: number; processing: number; failed: number } {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      failed: jobs.filter(j => j.status === 'failed').length
    };
  }

  private async checkPdfStatus(job: TurnitinJob, storage: any, pdfId: string): Promise<void> {
    try {
      const pdfStatus = await turnitinService.getPdfStatus(
        storage,
        job.turnitinSubmissionId!,
        pdfId
      );
      
      if (pdfStatus.status === 'COMPLETE') {
        console.log(`📄 PDF ready for job: ${job.id}, downloading...`);
        
        try {
          // Download PDF and store in Azure Blob Storage
          const pdfBuffer = await turnitinService.downloadSimilarityReportPdf(
            storage,
            job.turnitinSubmissionId!,
            pdfId
          );
          
          // Store PDF in Azure Blob Storage
          const azureBlobService = require('./azureBlobService').azureBlobService;
          const pdfFileName = `turnitin-report-${job.submissionFileId}-${Date.now()}.pdf`;
          const pdfBlobName = `turnitin-reports/${pdfFileName}`;
          
          await azureBlobService.uploadBuffer(
            pdfBlobName,
            pdfBuffer,
            'application/pdf'
          );
          
          const pdfUrl = `/api/turnitin/pdf/${job.submissionFileId}`;
          
          // Update database with PDF completion
          await storage.updateSubmissionFile(job.submissionFileId, {
            turnitinPdfStatus: 'complete',
            turnitinPdfUrl: pdfUrl,
            turnitinPdfGeneratedAt: new Date()
          });
          
          console.log(`✅ PDF processing completed for job: ${job.id}`);
          
          // Mark job as fully completed
          job.status = 'completed';
          this.jobs.delete(job.id);
          
        } catch (downloadError) {
          console.error(`❌ PDF download failed for job: ${job.id}:`, downloadError);
          
          // Update database with error status
          await storage.updateSubmissionFile(job.submissionFileId, {
            turnitinPdfStatus: 'error'
          });
          
          // Mark job as completed even if PDF download fails
          job.status = 'completed';
          this.jobs.delete(job.id);
        }
        
      } else if (pdfStatus.status === 'PROCESSING') {
        // PDF still processing, continue polling
        job.nextAttempt = new Date(Date.now() + 60000); // Check again in 1 minute
        console.log(`📄 PDF still processing for job: ${job.id}`);
      }
      
    } catch (error) {
      console.error(`❌ PDF status check failed for job: ${job.id}:`, error);
      
      // Update database with error status
      await storage.updateSubmissionFile(job.submissionFileId, {
        turnitinPdfStatus: 'error'
      });
      
      // Mark job as completed even if PDF status check fails
      job.status = 'completed';
      this.jobs.delete(job.id);
    }
  }
}

export const jobProcessor = new JobProcessor();
export type { TurnitinJob, WordCountJob, Job };