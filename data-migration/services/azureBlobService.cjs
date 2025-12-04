const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class AzureBlobService {
    constructor() {
        this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        console.log("AZURE_STORAGE_CONNECTION_STRING", this.connectionString);
        this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'rogo-data-migration';
        console.log("AZURE_STORAGE_CONTAINER_NAME", this.containerName);
        
        if (!this.connectionString) {
            throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is required');
        }
        
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    }

    /**
     * Initialize the service by ensuring the container exists
     */
    async initialize() {
        try {
            console.log('🔄 Initializing Azure Blob Storage service...');
            
            // Check if container exists, create if it doesn't
            await this.containerClient.createIfNotExists();
            console.log('🚀 Azure Blob Storage service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Azure Blob Storage service:', error.message);
            throw error;
        }
    }

    /**
     * Upload a file to Azure Blob Storage
     * @param {string} filePath - Local file path to upload
     * @param {string} blobName - Name for the blob in storage (optional, defaults to filename)
     * @param {Object} options - Additional upload options
     * @returns {Promise<Object>} Upload result with URL and metadata
     */
    async uploadFile(filePath, blobName = null, options = {}) {
        try {
            console.log(`📤 Uploading file: ${filePath}`);
            
            // Validate file exists
            await fs.access(filePath);
            
            // Use filename if blobName not provided
            if (!blobName) {
                blobName = path.basename(filePath);
            }
            
            // Get blob client
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            // Read file content
            const fileContent = await fs.readFile(filePath);
            
            // Upload options
            const uploadOptions = {
                blobHTTPHeaders: {
                    blobContentType: this.getContentType(filePath),
                    ...options.blobHTTPHeaders
                },
                metadata: {
                    uploadedAt: new Date().toISOString(),
                    originalFileName: path.basename(filePath),
                    ...options.metadata
                },
                ...options
            };
            
            // Upload the file
            const uploadResponse = await blockBlobClient.upload(fileContent, fileContent.length, uploadOptions);
            
            // Get the blob URL
            const blobUrl = blockBlobClient.url;
            
            const result = {
                success: true,
                blobName: blobName,
                url: blobUrl,
                etag: uploadResponse.etag,
                lastModified: uploadResponse.lastModified,
                contentLength: fileContent.length,
                contentType: uploadOptions.blobHTTPHeaders.blobContentType
            };
            
            console.log(`✅ File uploaded successfully: ${blobName}`);
            console.log(`🔗 Blob URL: ${blobUrl}`);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Failed to upload file ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Download a file from Azure Blob Storage
     * @param {string} blobName - Name of the blob to download
     * @param {string} downloadPath - Local path to save the file (optional)
     * @returns {Promise<Object>} Download result with file path and metadata
     */
    async downloadFile(blobName, downloadPath = null) {
        try {
            console.log(`📥 Downloading blob: ${blobName}`);
            
            // Get blob client
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            // Check if blob exists
            const exists = await blockBlobClient.exists();
            if (!exists) {
                throw new Error(`Blob ${blobName} does not exist`);
            }
            
            // Get blob properties
            const properties = await blockBlobClient.getProperties();
            
            // Set download path if not provided
            if (!downloadPath) {
                const fileName = blobName.split('/').pop(); // Get filename from blob path
                downloadPath = path.join(process.cwd(), 'downloads', fileName);
            }
            
            // Ensure download directory exists
            const downloadDir = path.dirname(downloadPath);
            await fs.mkdir(downloadDir, { recursive: true });
            
            // Download the blob
            const downloadResponse = await blockBlobClient.downloadToFile(downloadPath);
            
            const result = {
                success: true,
                blobName: blobName,
                localPath: downloadPath,
                contentLength: properties.contentLength,
                contentType: properties.contentType,
                lastModified: properties.lastModified,
                etag: properties.etag
            };
            
            console.log(`✅ File downloaded successfully: ${downloadPath}`);
            console.log(`📏 File size: ${properties.contentLength} bytes`);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Failed to download blob ${blobName}:`, error.message);
            throw error;
        }
    }

    /**
     * List all blobs in the container
     * @param {string} prefix - Optional prefix to filter blobs
     * @returns {Promise<Array>} Array of blob information
     */
    async listBlobs(prefix = '') {
        try {
            console.log(`📋 Listing blobs with prefix: ${prefix || 'all'}`);
            
            const blobs = [];
            const listOptions = prefix ? { prefix } : {};
            
            for await (const blob of this.containerClient.listBlobsFlat(listOptions)) {
                blobs.push({
                    name: blob.name,
                    url: `${this.containerClient.url}/${blob.name}`,
                    size: blob.properties.contentLength,
                    contentType: blob.properties.contentType,
                    lastModified: blob.properties.lastModified,
                    etag: blob.properties.etag
                });
            }
            
            console.log(`✅ Found ${blobs.length} blobs`);
            return blobs;
            
        } catch (error) {
            console.error('❌ Failed to list blobs:', error.message);
            throw error;
        }
    }

    /**
     * Delete a blob from Azure Blob Storage
     * @param {string} blobName - Name of the blob to delete
     * @returns {Promise<Object>} Delete result
     */
    async deleteBlob(blobName) {
        try {
            console.log(`🗑️ Deleting blob: ${blobName}`);
            
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            // Check if blob exists
            const exists = await blockBlobClient.exists();
            if (!exists) {
                throw new Error(`Blob ${blobName} does not exist`);
            }
            
            // Delete the blob
            const deleteResponse = await blockBlobClient.delete();
            
            const result = {
                success: true,
                blobName: blobName,
                deleteResponse: deleteResponse
            };
            
            console.log(`✅ Blob deleted successfully: ${blobName}`);
            return result;
            
        } catch (error) {
            console.error(`❌ Failed to delete blob ${blobName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get blob properties without downloading
     * @param {string} blobName - Name of the blob
     * @returns {Promise<Object>} Blob properties
     */
    async getBlobProperties(blobName) {
        try {
            console.log(`ℹ️ Getting properties for blob: ${blobName}`);
            
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            // Check if blob exists
            const exists = await blockBlobClient.exists();
            if (!exists) {
                throw new Error(`Blob ${blobName} does not exist`);
            }
            
            const properties = await blockBlobClient.getProperties();
            
            const result = {
                name: blobName,
                url: blockBlobClient.url,
                size: properties.contentLength,
                contentType: properties.contentType,
                lastModified: properties.lastModified,
                etag: properties.etag,
                metadata: properties.metadata
            };
            
            console.log(`✅ Retrieved properties for: ${blobName}`);
            return result;
            
        } catch (error) {
            console.error(`❌ Failed to get properties for blob ${blobName}:`, error.message);
            throw error;
        }
    }

    /**
     * Get the content type based on file extension
     * @param {string} filePath - File path
     * @returns {string} MIME type
     */
    getContentType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.pdf': 'application/pdf',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.xml': 'application/xml'
        };
        
        return contentTypes[ext] || 'application/octet-stream';
    }

    /**
     * Generate a shared access signature (SAS) URL for temporary access
     * @param {string} blobName - Name of the blob
     * @param {number} expiresInMinutes - Minutes until expiration (default: 60)
     * @returns {Promise<string>} SAS URL
     */
    async generateSasUrl(blobName, expiresInMinutes = 60) {
        try {
            console.log(`🔐 Generating SAS URL for: ${blobName}`);
            
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            
            // Check if blob exists
            const exists = await blockBlobClient.exists();
            if (!exists) {
                throw new Error(`Blob ${blobName} does not exist`);
            }
            
            // Generate SAS URL
            const expiresOn = new Date();
            expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);
            
            const sasUrl = await blockBlobClient.generateSasUrl({
                permissions: 'r', // Read permission
                expiresOn: expiresOn
            });
            
            console.log(`✅ SAS URL generated for: ${blobName}`);
            return sasUrl;
            
        } catch (error) {
            console.error(`❌ Failed to generate SAS URL for blob ${blobName}:`, error.message);
            throw error;
        }
    }
}

module.exports = AzureBlobService;
