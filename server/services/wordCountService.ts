import * as mammoth from 'mammoth';
import { getAzureBlobService } from './azureBlobService';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface WordCountResult {
  wordCount: number;
  success: boolean;
  error?: string;
}

class WordCountService {
  async countWordsFromFile(fileUrl: string, fileName: string): Promise<WordCountResult> {
    try {
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      
      if (!fileExtension) {
        return {
          wordCount: 0,
          success: false,
          error: 'Unable to determine file extension'
        };
      }

      if (!['pdf', 'docx', 'doc'].includes(fileExtension)) {
        return {
          wordCount: 0,
          success: false,
          error: `Unsupported file type: ${fileExtension}`
        };
      }

      const fileBuffer = await this.downloadFile(fileUrl);
      
      if (fileExtension === 'pdf') {
        return await this.countWordsInPDF(fileBuffer);
      } else if (fileExtension === 'docx' || fileExtension === 'doc') {
        return await this.countWordsInWord(fileBuffer);
      } else {
        return {
          wordCount: 0,
          success: false,
          error: `Unsupported file type: ${fileExtension}`
        };
      }
    } catch (error) {
      console.error('Error counting words:', error);
      return {
        wordCount: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async downloadFile(fileUrl: string): Promise<Buffer> {
    if (fileUrl.startsWith('/uploads/')) {
      const filePath = join(process.cwd(), fileUrl);
      return await readFile(filePath);
    }
    
    const blobName = this.extractBlobNameFromUrl(fileUrl);
    const azureService = getAzureBlobService();
    return await azureService.downloadFile(blobName);
  }

  private extractBlobNameFromUrl(url: string): string {
    const urlParts = url.split('/');
    const containerIndex = urlParts.indexOf('rogoreplacement');
    if (containerIndex !== -1 && containerIndex < urlParts.length - 1) {
      return urlParts.slice(containerIndex + 1).join('/');
    }
    return urlParts[urlParts.length - 1];
  }

  canProcessFile(fileUrl: string, fileName: string): boolean {
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const isSupported = !!fileExtension && ['pdf', 'docx', 'doc'].includes(fileExtension);
    const isAccessible = fileUrl.startsWith('/uploads/') || fileUrl.includes('rogoreplacement');
    return isSupported && isAccessible;
  }

  private async countWordsInPDF(buffer: Buffer): Promise<WordCountResult> {
    try {
      const pdfParseModule = await import('pdf-parse');
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const data = await pdfParse(buffer);
      const text = data.text;
      const wordCount = this.countWords(text);
      
      return {
        wordCount,
        success: true
      };
    } catch (error) {
      console.error('Error parsing PDF:', error);
      return {
        wordCount: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse PDF'
      };
    }
  }

  private async countWordsInWord(buffer: Buffer): Promise<WordCountResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value;
      const wordCount = this.countWords(text);
      
      return {
        wordCount,
        success: true
      };
    } catch (error) {
      console.error('Error parsing Word document:', error);
      return {
        wordCount: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse Word document'
      };
    }
  }

  private countWords(text: string): number {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return 0;
    }
    
    const words = trimmedText.split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }
}

export const wordCountService = new WordCountService();
