# Azure Blob Storage Integration Setup

This document explains how to set up Azure Blob Storage integration for the LTI e-assessment platform.

## Required Azure Secrets

The following environment secrets need to be configured in your Replit project for Azure Blob Storage integration:

### AZURE_STORAGE_CONNECTION_STRING
**Required for Azure Blob Storage file uploads**

This is the connection string for your Azure Storage account. It contains all the necessary information to connect to your storage account securely.

**How to get it:**
1. Log in to the [Azure Portal](https://portal.azure.com)
2. Navigate to your Storage Account
3. In the left menu, click on "Access keys" under "Security + networking"
4. Copy the "Connection string" from either key1 or key2
5. The connection string format looks like:
   ```
   DefaultEndpointsProtocol=https;AccountName=yourstorageaccount;AccountKey=youraccountkey;EndpointSuffix=core.windows.net
   ```

### AZURE_SAS_TOKEN (Optional)
**Optional for enhanced SAS URL generation**

This is a Shared Access Signature (SAS) token that provides additional security for accessing blob storage. It's used for generating secure URLs with specific permissions and expiration times.

**How to get it:**
1. Log in to the [Azure Portal](https://portal.azure.com)
2. Navigate to your Storage Account
3. In the left menu, click on "Shared access signature" under "Security + networking"
4. Configure the permissions (typically "Read" for file access)
5. Set the expiry date and time
6. Click "Generate SAS and connection string"
7. Copy the "SAS token" (starts with `?sv=`)

**What happens without it:**
- SAS URLs will still be generated using the connection string credentials
- The system will automatically fall back to account key-based SAS generation

**What happens without AZURE_STORAGE_CONNECTION_STRING:**
- File uploads will still work but files will be stored locally instead of Azure Blob Storage
- You'll see a warning message: "Azure Blob Storage credentials not found - file uploads will use fallback storage"

## How to Add Secrets in Replit

1. Open your Replit project
2. Click on the "Secrets" tab in the sidebar (🔐 icon)
3. Click "Add new secret"
4. Enter `AZURE_STORAGE_CONNECTION_STRING` as the key
5. Paste your Azure connection string as the value
6. Click "Save"
7. (Optional) Add another secret:
   - Key: `AZURE_SAS_TOKEN`
   - Value: Your SAS token (including the `?` prefix)
   - Click "Save"

## Azure Storage Account Setup

If you don't have an Azure Storage Account yet:

1. **Create Azure Account**: Sign up at [azure.microsoft.com](https://azure.microsoft.com) if you don't have one
2. **Create Storage Account**:
   - Go to Azure Portal → Storage accounts → Create
   - Choose your subscription and resource group
   - Give it a unique name (will be part of your URLs)
   - Choose region closest to your users
   - Performance: Standard is fine for most use cases
   - Redundancy: LRS (Locally-redundant storage) for cost-effective option

3. **Configure Access**:
   - After creation, go to your Storage Account
   - Navigate to "Access keys" and copy the connection string
   - The container `rogoreplacement` will be created automatically when first used

## File Storage Structure

Files uploaded through the LTI tool will be stored with the following structure:

```
Container: rogoreplacement
├── LTI_Uploads/
    ├── {timestamp}_{original_filename}.{extension}
    ├── {timestamp}_{original_filename}.{extension}
    └── ...
```

Each file includes metadata with:
- Student ID
- LTI Launch ID  
- Course Name
- Assignment Title
- Upload Timestamp

## Security Considerations

- The Azure connection string contains sensitive credentials - never commit it to code
- Files are stored in a public blob container by default (accessible via URL)
- Consider implementing signed URLs for private file access in production
- The current implementation uses public read access for simplicity

## Troubleshooting

**Error: "Azure Blob Storage credentials not found"**
- Solution: Add the `AZURE_STORAGE_CONNECTION_STRING` secret

**Error: "Failed to initialize Azure Blob Storage service"**
- Check that your connection string is correctly formatted
- Verify your Azure Storage Account is active
- Check that the storage account key hasn't been regenerated

**Files uploading to fallback storage instead of Azure**
- Verify the secret name is exactly `AZURE_STORAGE_CONNECTION_STRING`
- Check the Replit logs for specific Azure error messages
- Restart the application after adding secrets

## Testing the Integration

1. Set up the Azure secrets as described above
2. Use the LTI demo tools to launch an assignment
3. Upload a file through the LTI interface
4. Check the server logs - you should see: "File uploaded to Azure Blob Storage: [URL]"
5. Verify the file appears in your Azure Storage Account in the `rogoreplacement` container
6. Test the connection using the admin panel's Azure test connection feature

## Cost Considerations

Azure Blob Storage pricing is based on:
- Storage capacity used
- Number of transactions (uploads, downloads)
- Data transfer (outbound data)

For educational use, costs are typically very low. Monitor usage through Azure Cost Management.