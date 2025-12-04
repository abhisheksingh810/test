import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Server } from "http";
import { nanoid } from "nanoid";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  // Dynamic imports for vite - only loaded in development
  // These will only execute in development mode since setupVite is conditionally called
  // Use string-based dynamic import to avoid static analysis issues with esbuild
  
  // Use Function constructor to create a truly dynamic import that esbuild cannot analyze
  const dynamicImport = new Function('specifier', 'return import(specifier)');
  
  const viteModule = await dynamicImport("vite");
  const { createServer: createViteServer, createLogger } = viteModule;
  
  // Import vite.config with error handling (in case it's not available)
  // Use path resolution at runtime to prevent esbuild from statically analyzing this import
  let viteConfig;
  try {
    // Resolve the config path at runtime using file system paths
    // This prevents esbuild from bundling vite.config.ts
    const configPath = path.resolve(thisDir, "..", "vite.config.ts");
    const fileUrl = `file://${configPath}`;
    const viteConfigModule = await dynamicImport(fileUrl);
    viteConfig = viteConfigModule.default || viteConfigModule;
  } catch (error) {
    throw new Error(`Failed to load vite.config: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg: string, options?: any) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        thisDir,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production, when bundled in dist/, we need to resolve the path correctly
  // The dist folder structure is: dist/index.js (server) and dist/public/ (client build)
  // We use process.cwd() to get the project root, then navigate to dist/public
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req: express.Request, res: express.Response) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
