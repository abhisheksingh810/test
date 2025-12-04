import {
  BlobServiceClient,
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  SASProtocol,
} from "@azure/storage-blob";

export interface AzureBlobConfig {
  connectionString: string;
  containerName: string;
  sasToken?: string;
}

export interface UploadFileOptions {
  fileName: string;
  fileBuffer: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  folder?: string; // Optional folder prefix (e.g., "LTI_Uploads", "Marker_files")
}

export interface UploadedFileInfo {
  fileName: string;
  blobName: string;
  url: string;
  containerName: string;
  size: number;
}

export class AzureBlobService {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private containerName: string;
  private sasToken?: string;
  private accountName?: string;
  private accountKey?: string;

  constructor(config: AzureBlobConfig) {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(
      config.connectionString
    );
    this.containerName = config.containerName;
    this.containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    this.sasToken = config.sasToken;

    // Extract account name and key from connection string for SAS generation
    const connectionString = config.connectionString;
    const accountNameMatch = connectionString.match(/AccountName=([^;]+)/);
    const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/);

    if (accountNameMatch && accountKeyMatch) {
      this.accountName = accountNameMatch[1];
      this.accountKey = accountKeyMatch[1];
    }
  }

  /**
   * Initialize the container (create if it doesn't exist)
   * Uses private access since public access is not permitted on this storage account
   */
  async initializeContainer(): Promise<void> {
    try {
      // First try to create container with private access (no public access parameter)
      await this.containerClient.createIfNotExists();
      console.log(
        `Container "${this.containerName}" is ready (private access)`
      );
    } catch (error) {
      console.error("Error initializing container:", error);

      // If public access is not permitted, continue anyway - the container may already exist
      if (error.code === "PublicAccessNotPermitted") {
        console.log(
          "Container will use private access (public access not permitted on this storage account)"
        );

        // Check if container exists
        try {
          const exists = await this.containerClient.exists();
          if (exists) {
            console.log(
              `Container "${this.containerName}" exists and is ready`
            );
            return;
          }
        } catch (checkError) {
          console.log("Could not check container existence, proceeding anyway");
        }

        return; // Continue without throwing error
      }

      throw error;
    }
  }

  /**
   * Upload a file to Azure Blob Storage with configurable folder prefix
   * Supports both string and Buffer uploads with automatic content-type detection
   */
  async uploadFile(options: UploadFileOptions): Promise<UploadedFileInfo> {
    const { fileName, fileBuffer, contentType, metadata, folder = "LTI_Uploads" } = options;

    // Generate unique blob name with folder prefix and timestamp
    const timestamp = Date.now();
    const fileExtension = fileName.split(".").pop() || "";
    const baseName = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    const blobName = `${folder}/${timestamp}_${baseName}.${fileExtension}`;

    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Automatic content-type detection based on file extension
      const detectedContentType =
        this.getContentTypeByExtension(fileExtension) ||
        contentType ||
        "application/octet-stream";

      const uploadOptions: any = {
        blobHTTPHeaders: {
          blobContentType: detectedContentType,
        },
      };

      if (metadata) {
        uploadOptions.metadata = metadata;
      }

      const response = await blockBlobClient.upload(
        fileBuffer,
        fileBuffer.length,
        uploadOptions
      );

      if (response._response.status !== 201) {
        throw new Error(`Failed to upload file: ${response._response.status}`);
      }

      const url = blockBlobClient.url;

      return {
        fileName,
        blobName,
        url,
        containerName: this.containerName,
        size: fileBuffer.length,
      };
    } catch (error) {
      console.error("Error uploading file to Azure Blob Storage:", error);
      throw error;
    }
  }

  /**
   * Upload string content as a file
   */
  async uploadString(
    fileName: string,
    content: string,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<UploadedFileInfo> {
    const fileBuffer = Buffer.from(content, "utf-8");
    return this.uploadFile({
      fileName,
      fileBuffer,
      contentType: contentType || "text/plain",
      metadata,
    });
  }

  /**
   * Download file as Buffer
   */
  async downloadFile(blobName: string): Promise<Buffer> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download();

      if (!downloadResponse.readableStreamBody) {
        throw new Error("No readable stream body in download response");
      }

      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error("Error downloading file from Azure Blob Storage:", error);
      throw error;
    }
  }

  /**
   * Download file as text
   */
  async downloadText(blobName: string): Promise<string> {
    const buffer = await this.downloadFile(blobName);
    return buffer.toString("utf-8");
  }

  /**
   * Get content type by file extension
   */
  private getContentTypeByExtension(extension: string): string | null {
    const contentTypes: Record<string, string> = {
      // Documents
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      md: "text/markdown",
      json: "application/json",

      // Images
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      bmp: "image/bmp",
      webp: "image/webp",
      svg: "image/svg+xml",

      // Web
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      xml: "application/xml",

      // Archives
      zip: "application/zip",
      rar: "application/x-rar-compressed",
      "7z": "application/x-7z-compressed",
    };

    return contentTypes[extension.toLowerCase()] || null;
  }

  /**
   * Delete a file from Azure Blob Storage
   */
  async deleteFile(blobName: string): Promise<void> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      console.log(`Blob "${blobName}" deleted successfully`);
    } catch (error) {
      console.error("Error deleting file from Azure Blob Storage:", error);
      throw error;
    }
  }

  /**
   * Get a signed URL for a blob with expiry (for private access)
   */
  async getSignedUrl(
    blobName: string,
    expiryMinutes: number = 60
  ): Promise<string> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // If we have a pre-configured SAS token, use it
      if (this.sasToken) {
        console.log("Using pre-configured SAS token for blob:", blobName);

        // Check if the URL already contains query parameters (SAS token already applied)
        if (blockBlobClient.url.includes("?")) {
          console.log("URL already contains SAS token, returning as-is");
          return blockBlobClient.url;
        }

        console.log(
          "SAS token (first 50 chars):",
          this.sasToken.substring(0, 50) + "..."
        );
        // Decode HTML entities (e.g., &amp; to &)
        let decodedSasToken = this.sasToken
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        // Ensure the SAS token doesn't already have a leading ?
        const cleanSasToken = decodedSasToken.startsWith("?")
          ? decodedSasToken.substring(1)
          : decodedSasToken;
        const finalUrl = `${blockBlobClient.url}?${cleanSasToken}`;
        console.log(
          "Generated URL (decoded):",
          finalUrl.substring(0, 100) + "..."
        );
        return finalUrl;
      }

      console.log(
        "No pre-configured SAS token, generating new one for blob:",
        blobName
      );

      // Generate SAS URL with read permission using account credentials
      if (this.accountName && this.accountKey) {
        console.log("Using account credentials to generate SAS token");
        const sharedKeyCredential = new StorageSharedKeyCredential(
          this.accountName,
          this.accountKey
        );

        const now = new Date();
        const expiresOn = new Date(now.getTime() + expiryMinutes * 60 * 1000);

        const sasQueryParams = generateBlobSASQueryParameters(
          {
            containerName: this.containerName,
            blobName: blobName,
            permissions: BlobSASPermissions.parse("r"), // read permission
            protocol: SASProtocol.Https, // HTTPS only
            startsOn: now, // Add start time
            expiresOn: expiresOn,
          },
          sharedKeyCredential
        );

        return `${blockBlobClient.url}?${sasQueryParams.toString()}`;
      }

      // Fallback to client-generated SAS URL
      console.log("Using client-generated SAS URL fallback");
      const now = new Date();
      const sasUrl = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("r"),
        startsOn: now,
        expiresOn: new Date(now.getTime() + expiryMinutes * 60 * 1000),
      });

      return sasUrl;
    } catch (error) {
      console.error("Error generating signed URL:", error);
      throw error;
    }
  }

  /**
   * Get SAS URL utility for secure client access
   */
  async getSasUrl(
    blobName: string,
    expiryMinutes: number = 60
  ): Promise<string> {
    return this.getSignedUrl(blobName, expiryMinutes);
  }

  /**
   * Check if a blob exists
   */
  async fileExists(blobName: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      console.error("Error checking if file exists:", error);
      return false;
    }
  }

  /**
   * List all files in the LTI_Uploads directory
   */
  async listFiles(
    prefix: string = "LTI_Uploads/"
  ): Promise<
    Array<{ name: string; url: string; size: number; lastModified: Date }>
  > {
    try {
      const files = [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
        const blockBlobClient = this.containerClient.getBlockBlobClient(
          blob.name
        );

        files.push({
          name: blob.name,
          url: blockBlobClient.url,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified || new Date(),
        });
      }

      return files;
    } catch (error) {
      console.error("Error listing files:", error);
      throw error;
    }
  }
}

// Create and export singleton instance
let azureBlobService: AzureBlobService | null = null;

export const getAzureBlobService = (): AzureBlobService => {
  if (!azureBlobService) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const sasToken = process.env.AZURE_SAS_TOKEN;

    if (!connectionString) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING environment variable is required"
      );
    }

    azureBlobService = new AzureBlobService({
      connectionString,
      containerName: "rogoreplacement", // Store files in the rogoreplacement container
      sasToken,
    });
  }
  return azureBlobService;
};

export const initializeAzureBlobService = async (): Promise<void> => {
  const service = getAzureBlobService();
  await service.initializeContainer();
};
