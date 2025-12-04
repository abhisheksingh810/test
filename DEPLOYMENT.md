# Azure App Service Deployment Guide

This document explains how to deploy the assessment platform to Azure App Service.

## Prerequisites

- Azure subscription with App Service created
- Bitbucket Pipelines configured with Azure Service Principal credentials
- Environment variables configured in Azure App Service and Bitbucket

## Required Bitbucket Pipelines Environment Variables

Configure these variables in Bitbucket Pipelines → Repository settings → Pipelines → Repository variables:

### Quick Reference: Where to Get Each Value

1. **AZURE_RESOURCE_GROUP_UAT**: 
   - Azure Portal → App Service → Overview → Resource Group name

2. **AZURE_APP_SERVICE_NAME_UAT**: 
   - Azure Portal → App Service → Overview → Name

3. **AZURE_TENANT_ID_UAT**: 
   - Azure Portal → Azure Active Directory → Overview → Tenant ID
   - OR from Azure CLI: `az account show --query tenantId -o tsv`

4. **AZURE_CLIENT_ID_UAT**: See below (requires creating Service Principal)

5. **AZURE_CLIENT_SECRET_UAT**: See below (requires creating Service Principal)

### How to Create Azure Service Principal

**Step-by-step instructions:**

1. **Get your Subscription ID and Resource Group name:**
   - Azure Portal → Subscriptions → Copy your subscription ID
   - Azure Portal → App Service → Overview → Copy the "Resource Group" name

2. **Open Terminal/Command Prompt on your local machine**

3. **Install Azure CLI** (if not already installed):
   - Windows: Download from https://aka.ms/installazurecliwindows
   - Mac: `brew install azure-cli`
   - Linux: `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`

4. **Login to Azure:**
   ```bash
   az login
   ```
   - This will open a browser for you to sign in

5. **Get your Subscription ID** (if you don't have it):
   ```bash
   az account show --query id -o tsv
   ```

6. **Create the Service Principal:**
   ```bash
   az ad sp create-for-rbac --name "bitbucket-pipelines-deploy" --role contributor --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/YOUR_RESOURCE_GROUP_NAME
   ```
   Replace:
   - `YOUR_SUBSCRIPTION_ID` with your actual subscription ID
   - `YOUR_RESOURCE_GROUP_NAME` with your actual resource group name

7. **Copy the output** - You'll get JSON like this:
   ```json
   {
     "appId": "12345678-1234-1234-1234-123456789abc",
     "password": "some-long-secret-password",
     "tenant": "87654321-4321-4321-4321-cba987654321"
   }
   ```

8. **Map to Bitbucket Variables:**
   - `appId` → Use as `AZURE_CLIENT_ID_UAT`
   - `password` → Use as `AZURE_CLIENT_SECRET_UAT` (⚠️ Save this! You can't retrieve it later)
   - `tenant` → Use as `AZURE_TENANT_ID_UAT`

9. **Add to Bitbucket Pipelines:**
   - Go to Bitbucket → Your Repository → Settings → Pipelines → Repository variables
   - Click "+ Add variable" for each:
     - `AZURE_CLIENT_ID_UAT` = paste the appId
     - `AZURE_CLIENT_SECRET_UAT` = paste the password (mark as "Secured")
     - `AZURE_TENANT_ID_UAT` = paste the tenant
     - `AZURE_RESOURCE_GROUP_UAT` = paste your resource group name
     - `AZURE_APP_SERVICE_NAME_UAT` = paste your app service name

## Required Azure App Service Configuration

### Application Settings

The following application settings must be configured in your Azure App Service:

1. **SCM_DO_BUILD_DURING_DEPLOYMENT**: Set to `true` (required)
   - This enables Azure to automatically run `npm install` during deployment
   - Location: Azure Portal → App Service → Configuration → Application settings
   - Add new setting: `SCM_DO_BUILD_DURING_DEPLOYMENT = true`

2. **WEBSITE_ENABLE_SYNC_UPDATE_SITE**: Set to `false` (recommended)
   - Prevents deployment timeout errors (504 Gateway Timeout)
   - Location: Azure Portal → App Service → Configuration → Application settings
   - Add new setting: `WEBSITE_ENABLE_SYNC_UPDATE_SITE = false`

3. **WEBSITE_NODE_DEFAULT_VERSION**: Set to `~22` or `~20`
   - Specifies the Node.js version for your app
   - Location: Azure Portal → App Service → Configuration → General settings

4. **Environment Variables** (required):
   - `DATABASE_URL`: PostgreSQL connection string
   - `NODE_ENV`: `production`
   - `PORT`: `8080` (Azure uses this port by default)
   - `AZURE_STORAGE_CONNECTION_STRING`: (optional) Azure Blob Storage connection string
   - `AZURE_SAS_TOKEN`: (optional) Azure Blob Storage SAS token

### How to Configure in Azure Portal

1. Log in to [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service instance
3. Go to **Configuration** → **General settings**:
   - Set **SCM Basic Auth Publishing** to **On**
   - Set **Node version** to **22 LTS** (or your preferred version)
4. Go to **Configuration** → **Application settings**:
   - Click **+ New application setting**
   - Name: `SCM_DO_BUILD_DURING_DEPLOYMENT`
   - Value: `true`
   - Click **OK**
   - Click **+ New application setting** again
   - Name: `WEBSITE_ENABLE_SYNC_UPDATE_SITE`
   - Value: `false`
   - Click **OK**
   - Click **Save** at the top (this will restart your app)

## Deployment Process

The deployment is automated via Bitbucket Pipelines. When you push to the `UAT` branch:

1. **Build Step**: 
   - Installs dependencies
   - Builds the application
   - Creates artifacts (dist/, package.json, package-lock.json, migrations/)

2. **Deploy Step**:
   - Installs Azure CLI
   - Creates a ZIP package with built files (excluding node_modules)
   - Authenticates with Azure using Service Principal
   - Deploys to Azure App Service using Azure CLI
   - Azure automatically runs `npm install --production` due to `SCM_DO_BUILD_DURING_DEPLOYMENT=true`

## How It Works

The deployment pipeline excludes `node_modules` to keep the ZIP file small. Instead:

1. The ZIP contains:
   - Built JavaScript files in `dist/`
   - `package.json` and `package-lock.json`
   - Database migrations in `migrations/`

2. Azure App Service automatically:
   - Detects `package.json` in the deployed files
   - Runs `npm install --production` (due to `SCM_DO_BUILD_DURING_DEPLOYMENT=true`)
   - Installs only production dependencies
   - Starts the application with `npm start`

## Troubleshooting

### Error: "Cannot find package 'drizzle-orm'"

**Cause**: Dependencies not being installed during deployment.

**Solution**: 
1. Verify `SCM_DO_BUILD_DURING_DEPLOYMENT` is set to `true` in App Service Configuration
2. Check that `package.json` and `package-lock.json` are included in the deployment ZIP
3. Review deployment logs in Azure Portal → Deployment Center → Logs

### Error: "504 Gateway Timeout" during ZIP deploy

**Cause**: Azure deployment is taking too long and timing out.

**Solution**:
1. Set `WEBSITE_ENABLE_SYNC_UPDATE_SITE` to `false` in App Service Configuration → Application settings
2. The deployment pipeline now has a 30-minute timeout (1800 seconds)
3. If issues persist, check App Service is not under heavy load
4. Review deployment logs in Azure Portal → Deployment Center

### Error: "Authentication failed" during deployment

**Cause**: Service Principal credentials not configured correctly.

**Solution**:
1. Verify all required environment variables are set in Bitbucket Pipelines:
   - `AZURE_CLIENT_ID_UAT`
   - `AZURE_CLIENT_SECRET_UAT`
   - `AZURE_TENANT_ID_UAT`
   - `AZURE_RESOURCE_GROUP_UAT`
   - `AZURE_APP_SERVICE_NAME_UAT`
2. Check that the Service Principal has the correct permissions (Contributor role on the resource group)
3. Try regenerating the Service Principal if credentials may have expired

### Application fails to start

**Cause**: Missing environment variables or database connection issues.

**Solution**:
1. Check App Service → Logs for specific error messages
2. Verify all required environment variables are set in Configuration
3. Test database connectivity from App Service console (SSH)

## Manual Deployment

If you need to deploy manually:

1. Build the application locally:
   ```bash
   npm install
   npm run build
   ```

2. Create a ZIP package:
   ```bash
   zip -r app.zip . \
     -x "*.git*" \
     -x "*node_modules*" \
     -x "*client/*" \
     -x "*server/*" \
     -x "*shared/*" \
     -x "*.ts" \
     -x "*.md" \
     -x ".replit*" \
     -x "tailwind.config.ts" \
     -x "vite.config.ts" \
     -x "postcss.config.js" \
     -x "tsconfig.json" \
     -x "components.json"
   ```

3. Deploy using Azure CLI:
   ```bash
   az webapp deployment source config-zip \
     --resource-group <resource-group-name> \
     --name <app-service-name> \
     --src app.zip
   ```

## Monitoring Deployment

To monitor deployment status:

1. **Azure Portal**: 
   - Go to App Service → Deployment Center
   - View deployment logs and history

2. **Bitbucket Pipelines**:
   - Go to Pipelines → Recent builds
   - Click on the build to see detailed logs

3. **Application Logs**:
   - Azure Portal → App Service → Log stream
   - Real-time application logs and errors

## Post-Deployment Verification

After deployment, verify the application is running:

1. Check the app is accessible: `https://<your-app-name>.azurewebsites.net`
2. Verify database connections are working
3. Test key functionality (login, file uploads, etc.)
4. Review application logs for any errors

## Important Notes

- The `prestart` script in `package.json` runs `npm install` before each app start
- This ensures dependencies are installed even if Azure's automatic install fails
- In production, with proper configuration (`SCM_DO_BUILD_DURING_DEPLOYMENT=true`), `prestart` should not be needed
- Once you've verified Azure auto-install works correctly, you can safely remove the `prestart` script
- If you remove `prestart`, make absolutely sure `SCM_DO_BUILD_DURING_DEPLOYMENT` is set to `true`

