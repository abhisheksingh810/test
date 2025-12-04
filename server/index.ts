import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { AzureBlobService } from "./services/azureBlobService";
import { runMigrations } from "./migrate";

const app = express();
// Increase payload size limits for file uploads (50MB limit to handle large base64-encoded files)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Connection verification functions (non-blocking)
async function verifyConnections(): Promise<void> {
  // Test database connection with timeout
  try {
    log("Verifying database connection...");
    const dbPromise = db.execute(sql`SELECT 1 as test, current_database() as db`);
    const result = await Promise.race([
      dbPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Database connection timeout")), 5000))
    ]);
    
    if (result && result?.rows && result?.rows?.length > 0 && result?.rows[0]?.test === 1) {
      log(`✓ Database connection successful (${result?.rows[0]?.db})`);
    } else {
      log("⚠ Database connection uncertain, continuing anyway");
    }
  } catch (error) {
    log("⚠ Database connection failed, continuing anyway:");
    log(`Database error: ${error}`);
  }

  // Test Azure Blob Storage connection with timeout
  try {
    log("Verifying Azure Blob Storage connection...");
    
    if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
      log("⚠ AZURE_STORAGE_CONNECTION_STRING not set, skipping verification");
      return;
    }

    const azureBlobService = new AzureBlobService({
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      containerName: 'rogoreplacement'
    });

    const blobPromise = azureBlobService.initializeContainer();
    await Promise.race([
      blobPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Azure Blob Storage timeout")), 5000))
    ]);
    log("✓ Azure Blob Storage connection successful");
  } catch (error) {
    log("⚠ Azure Blob Storage connection failed, continuing anyway:");
    log(`Azure Blob Storage error: ${error}`);
  }

}

(async () => {
  try {
    // Run database migrations first, before starting the server
    await runMigrations();
  } catch (error) {
    log('Failed to run migrations during startup:');
    log(`  ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.NODE_ENV === 'production') {
      log('Exiting due to migration failure in production');
      process.exit(1);
    }
    // In development, continue even if migrations fail
  }
  
  // Verify connections but don't block startup
  verifyConnections().catch(() => {});
  
  log("Starting server...");
  
  // TurnItIn integration ready (immediate submission mode)
  
  const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    // Double-check NODE_ENV to ensure vite is never loaded in production
    console.log("NODE_ENV", process.env.NODE_ENV);
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      await setupVite(app, server);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    // On Windows, use 127.0.0.1 instead of 0.0.0.0 and omit reusePort
    const isWindows = process.platform === 'win32';
    server.listen({
      port,
      host: isWindows ? "127.0.0.1" : "0.0.0.0",
      ...(isWindows ? {} : { reusePort: true }),
    }, () => {
      log(`serving on port ${port}`);
    });
})();
