import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import cookieParser from "cookie-parser";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import {
  insertUserSchema,
  createUserSchema,
  adminEditUserSchema,
  insertCourseNodeSchema,
  insertAssessmentSchema,
  insertAssessmentSectionSchema,
  insertSectionMarkingOptionSchema,
  insertAssessmentGradeBoundarySchema,
  assessmentGradeBoundaries,
  assignmentSubmissions,
  submissionMarkingAssignments,
  submissionGrades,
  assessments,
  users,
  type UserRole,
  type MarkingStatus,
  roleHierarchy,
} from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { format } from "date-fns";
import { z } from "zod";
import { randomBytes, createHmac } from "crypto";
import { emailService } from "./services/emailService";
import {
  getAzureBlobService,
  initializeAzureBlobService,
} from "./services/azureBlobService";
import { jobProcessor } from "./services/jobProcessor";

// Helper function to get content type based on file extension
function getContentType(fileExtension: string): string {
  const contentTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
  };
  return (
    contentTypes[fileExtension?.toLowerCase()] || "application/octet-stream"
  );
}

// Extend Request interface to include user, apiKey, and viewerSession
interface AuthenticatedRequest extends Request {
  user?: any;
  apiKey?: any;
  viewerSession?: any;
}

// Session middleware
const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: any,
) => {
  const sessionToken =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.cookies?.sessionToken;

  if (!sessionToken) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const session = await storage.getSessionByToken(sessionToken);
  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }

  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  req.user = user;
  next();
};

// API key middleware
const validateApiKey = async (req: AuthenticatedRequest, res: Response, next: any) => {
  const apiKeyValue = req.headers["x-api-key"] as string;
  if (!apiKeyValue) {
    return res.status(401).json({ message: "API key required" });
  }

  // Expected format: identifier.secret
  const [keyIdentifier, secret] = apiKeyValue.split(".");
  if (!keyIdentifier || !secret) {
    return res.status(401).json({ message: "Invalid API key format" });
  }

  const apiKey = await storage.getApiKeyByIdentifier(keyIdentifier);
  if (!apiKey) {
    return res.status(401).json({ message: "Invalid API key" });
  }

  const isValid = await bcrypt.compare(apiKeyValue, apiKey.keyHash);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid API key" });
  }

  if (!apiKey.isActive) {
    return res.status(401).json({ message: "API key is inactive" });
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return res.status(401).json({ message: "API key has expired" });
  }

  // Non-blocking update
  storage.updateApiKeyLastUsedAt(keyIdentifier).catch(console.error);

  req.apiKey = apiKey;
  next();
};

// LTI Viewer middleware - for unauthenticated students viewing results
const validateViewerToken = async (req: AuthenticatedRequest, res: Response, next: any) => {
  const viewerToken = req.query.token as string || req.headers["x-viewer-token"] as string;
  
  if (!viewerToken) {
    return res.status(401).json({ message: "Viewer token required" });
  }

  // Import token verification utilities
  const { hashViewerToken } = await import('./services/ltiViewerTokenService');
  
  // Hash the provided token to look up in database
  const hashedToken = hashViewerToken(viewerToken);
  
  // Look up session by hashed token
  const session = await storage.getLtiViewerSessionByToken(hashedToken);
  
  if (!session) {
    return res.status(401).json({ message: "Invalid viewer token" });
  }

  if (session.expiresAt < new Date()) {
    return res.status(401).json({ message: "Viewer token has expired" });
  }

  // Non-blocking access tracking
  storage.incrementViewerSessionAccess(session.id).catch(console.error);

  // Attach viewer session to request for use in route handlers
  req.viewerSession = session;
  next();
};

// Role-based access control
const requireRole = (...roles: (UserRole | UserRole[])[]) => {
  const requiredRoles = roles.flatMap((role) =>
    Array.isArray(role) ? role : [role],
  );
  return (req: AuthenticatedRequest, res: Response, next: any) => {
    const userRole = req.user?.role as UserRole;
    if (
      !userRole ||
      !requiredRoles.some(
        (role) => roleHierarchy[userRole] >= roleHierarchy[role],
      )
    ) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(cookieParser());

  // Initialize Azure Blob Storage service if credentials are available
  try {
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
      await initializeAzureBlobService();
      console.log("Azure Blob Storage service initialized successfully");
    } else {
      console.warn(
        "Azure Blob Storage credentials not found - file uploads will use fallback storage",
      );
    }
  } catch (error) {
    console.error("Failed to initialize Azure Blob Storage service:", error);
    console.warn("File uploads will use fallback storage");

    // Don't prevent server startup if Azure fails to initialize
    // The fallback storage mechanism will handle file uploads
  }

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update user status to active on successful login if it was pending
      // Also update lastLoginAt timestamp
      const updateData: any = { lastLoginAt: new Date() };
      if (user.status === "pending") {
        updateData.status = "active";
        user.status = "active"; // Update the local object too
      }
      await storage.updateUser(user.id, updateData);
      user.lastLoginAt = updateData.lastLoginAt; // Update the local object too

      // Create session
      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await storage.createSession({
        userId: user.id,
        sessionToken,
        expiresAt,
      });

      res.cookie("sessionToken", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, sessionToken });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: any, res) => {
    try {
      const sessionToken =
        req.headers.authorization?.replace("Bearer ", "") ||
        req.cookies?.sessionToken;
      if (sessionToken) {
        await storage.deleteSession(sessionToken);
      }
      res.clearCookie("sessionToken");
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/me", requireAuth, (req: any, res) => {
    const { password: _, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });

  // Profile management routes
  app.put("/api/profile", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { updateProfileSchema } = await import("@shared/schema");
      const updates = updateProfileSchema.parse(req.body);

      // Hash password if provided
      if (updates.password) {
        const bcrypt = await import("bcrypt");
        updates.password = await bcrypt.hash(updates.password, 10);
      }

      const user = await storage.updateUser(userId, updates);
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/profile/password", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { changePasswordSchema } = await import("@shared/schema");
      const bcrypt = await import("bcrypt");

      const { currentPassword, newPassword } = changePasswordSchema.parse(
        req.body,
      );

      // Verify current password
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!isValidPassword) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      // Update with new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(userId, { password: hashedPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Forgot password routes
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { forgotPasswordSchema } = await import("@shared/schema");
      const { randomBytes } = await import("crypto");

      const { email } = forgotPasswordSchema.parse(req.body);

      // Check if user exists
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        return res.json({
          message:
            "If an account with this email exists, you will receive a password reset link.",
        });
      }

      // Generate reset token
      const resetToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store the token
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
        used: "false",
      });

      // Create reset URL
      const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}`;

      // Send email
      try {
        const { emailService } = await import("./services/emailService");
        const systemSettings = await storage.getAllSystemSettings();
        const emailTemplate =
          await storage.getEmailTemplateByKey("forgot_password");

        if (emailTemplate) {
          await emailService.sendForgotPasswordEmail(
            systemSettings,
            emailTemplate,
            {
              to: email,
              resetUrl,
              userName: user.firstName || user.username,
              platformName: "Avado Assessment Platform",
            },
          );
        }
      } catch (emailError) {
        console.error("Failed to send reset email:", emailError);
        // Continue without failing - token is still valid
      }

      res.json({
        message:
          "If an account with this email exists, you will receive a password reset link.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { resetPasswordSchema } = await import("@shared/schema");
      const bcrypt = await import("bcrypt");

      const { token, newPassword } = resetPasswordSchema.parse(req.body);

      // Find the reset token
      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res
          .status(400)
          .json({ message: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Check if token is already used
      if (resetToken.used === "true") {
        return res
          .status(400)
          .json({ message: "Reset token has already been used" });
      }

      // Get the user
      const user = await storage.getUser(resetToken.userId);
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      // Update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });

      // Mark token as used
      await storage.markPasswordResetTokenAsUsed(token);

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // User management routes
  app.get("/api/users/statistics", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getUserStatistics();
      res.json(stats);
    } catch (error) {
      console.error("Get user statistics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { search, role, status, page = "1", limit = "10" } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      const result = await storage.getAllUsers({
        search: search as string,
        role: role as UserRole,
        status: status as string,
        limit: parseInt(limit as string),
        offset,
      });

      // Remove passwords from response
      const usersWithoutPasswords = result.users.map(
        ({ password, ...user }) => user,
      );

      res.json({
        users: usersWithoutPasswords,
        total: result.total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      });
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/users",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const userData = createUserSchema.parse(req.body);

        // Check if email already exists
        const existingUser = await storage.getUserByEmail(userData.email);
        if (existingUser) {
          return res
            .status(400)
            .json({ message: "A user with this email address already exists" });
        }

        // Prevent admins from creating superadmin accounts
        if (
          userData.role === "superadmin" &&
          (req as any).user.role !== "superadmin"
        ) {
          return res
            .status(403)
            .json({
              message: "Only superadmins can create superadmin accounts",
            });
        }

        // Generate username from email (part before @)
        const username = userData.email
          .split("@")[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

        // Check if generated username already exists, if so add a number
        let finalUsername = username;
        let counter = 1;
        while (await storage.getUserByUsername(finalUsername)) {
          finalUsername = `${username}${counter}`;
          counter++;
        }

        // Generate a temporary password (user will need to reset it)
        const tempPassword = Math.random().toString(36).slice(-12);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        const user = await storage.createUser({
          username: finalUsername,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          status: "pending", // User needs to set up their account
        });

        // Send invitation email
        try {
          const settings = await storage.getAllSystemSettings();
          await emailService.sendInvitationEmail(
            user.email,
            {
              userName: user.username,
              userRole: user.role,
              tempPassword: tempPassword,
              loginUrl: `${req.protocol}://${req.get("host")}/login`,
            },
            settings,
          );

          console.log(`Invitation email sent successfully to ${user.email}`);
        } catch (emailError) {
          console.error("Failed to send invitation email:", emailError);
          // Don't fail the user creation if email fails
        }

        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json({
          ...userWithoutPassword,
          emailSent: true, // Indicate that invitation email was attempted
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid user data", errors: error.errors });
        }
        console.error("Create user error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/users/:id",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { id } = req.params;

        // Validate the request body using adminEditUserSchema
        const validation = adminEditUserSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid input data",
            errors: validation.error.errors,
          });
        }

        const updates = validation.data;

        const existingUser = await storage.getUser(id);
        if (!existingUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Prevent admins from modifying superadmin accounts
        if (
          existingUser.role === "superadmin" &&
          req.user.role !== "superadmin"
        ) {
          return res
            .status(403)
            .json({
              message: "Only superadmins can modify superadmin accounts",
            });
        }

        // Prevent admins from promoting users to superadmin
        if (updates.role === "superadmin" && req.user.role !== "superadmin") {
          return res
            .status(403)
            .json({ message: "Only superadmins can assign superadmin role" });
        }

        // Password changes are not allowed through admin edit
        // Use separate password change endpoints for security

        const user = await storage.updateUser(id, updates);
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/users/:id",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { id } = req.params;

        const existingUser = await storage.getUser(id);
        if (!existingUser) {
          return res.status(404).json({ message: "User not found" });
        }

        // Prevent admins from deleting superadmin accounts
        if (
          existingUser.role === "superadmin" &&
          req.user.role !== "superadmin"
        ) {
          return res
            .status(403)
            .json({
              message: "Only superadmins can delete superadmin accounts",
            });
        }

        // Delete user sessions first
        await storage.deleteUserSessions(id);
        await storage.deleteUser(id);

        res.json({ message: "User deleted successfully" });
      } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // System settings routes
  app.get(
    "/api/settings",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const settings = await storage.getAllSystemSettings();
        res.json(settings);
      } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/settings",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const settings = req.body; // Array of settings

        if (!Array.isArray(settings)) {
          return res.status(400).json({ message: "Settings must be an array" });
        }

        const updatedSettings = [];
        for (const setting of settings) {
          const updated = await storage.upsertSystemSetting({
            ...setting,
            updatedBy: (req as any).user.id,
          });
          updatedSettings.push(updated);
        }

        res.json(updatedSettings);
      } catch (error) {
        console.error("Update settings error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Test TurnItIn connection
  app.post(
    "/api/settings/test-turnitin",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { apiUrl, apiKey } = req.body;

        if (!apiUrl || !apiKey) {
          return res
            .status(400)
            .json({ message: "API URL and API Key are required" });
        }

        // Test connection using TurnItIn's features-enabled endpoint
        let cleanApiUrl = apiUrl.replace(/\/+$/, ""); // Remove trailing slashes

        // Handle different URL formats - check if /api is already in the URL
        let testUrl;
        if (cleanApiUrl.includes("/api/v1")) {
          // URL already has /api/v1, just append the endpoint
          testUrl = `${cleanApiUrl}/features-enabled`;
        } else if (cleanApiUrl.includes("/api")) {
          // URL has /api but not v1, append v1/features-enabled
          testUrl = `${cleanApiUrl}/v1/features-enabled`;
        } else {
          // URL doesn't have /api, add the full path
          testUrl = `${cleanApiUrl}/api/v1/features-enabled`;
        }

        console.log(`Testing TurnItIn connection to: ${testUrl}`);

        const response = await fetch(testUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Turnitin-Integration-Name": "Avado E-Assessment Platform",
            "X-Turnitin-Integration-Version": "1.0.0",
            "Content-Type": "application/json",
          },
        });

        console.log(
          `TurnItIn API response: ${response.status} ${response.statusText}`,
        );

        if (response.ok) {
          const features = await response.json();
          res.json({
            success: true,
            message: "Connection successful",
            features,
          });
        } else {
          const errorText = await response.text();
          console.error(`TurnItIn API error: ${errorText}`);
          // Always return 400 for failed connection tests, not the original status code
          // This ensures the frontend treats it as an error consistently
          res.status(400).json({
            success: false,
            message: `Connection failed: ${response.status} ${response.statusText}`,
            error: errorText,
          });
        }
      } catch (error) {
        console.error("TurnItIn test connection error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to test connection: " + (error as Error).message,
        });
      }
    },
  );

  // Test SMTP connection
  app.post(
    "/api/settings/test-smtp",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { host, port, username, password, fromEmail, fromName, useTls } =
          req.body;

        if (!host || !username || !password) {
          return res
            .status(400)
            .json({
              message: "SMTP Host, Username, and Password are required",
            });
        }

        // Dynamically import nodemailer to avoid issues with ES modules
        const nodemailer = await import("nodemailer");

        console.log(`Testing SMTP connection to: ${host}:${port}`);

        // Create transporter
        const transporter = nodemailer.default.createTransport({
          host: host,
          port: parseInt(port) || 587,
          secure: parseInt(port) === 465, // true for 465, false for other ports
          auth: {
            user: username,
            pass: password,
          },
          tls: useTls
            ? {
                // Do not fail on invalid certs for testing
                rejectUnauthorized: false,
              }
            : undefined,
        });

        // Verify connection
        await transporter.verify();

        // Send a test email if fromEmail is provided
        if (fromEmail) {
          const testEmail = {
            from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
            to: fromEmail, // Send test email to the configured from address
            subject: "HubSpot SMTP Test - Connection Successful",
            text: `This is a test email sent from your e-assessment platform to verify the HubSpot SMTP configuration.\n\nSMTP Server: ${host}:${port}\nUsername: ${username}\nTLS Enabled: ${useTls}\n\nIf you received this email, your SMTP configuration is working correctly.`,
            html: `
            <h2>HubSpot SMTP Test - Connection Successful</h2>
            <p>This is a test email sent from your e-assessment platform to verify the HubSpot SMTP configuration.</p>
            <ul>
              <li><strong>SMTP Server:</strong> ${host}:${port}</li>
              <li><strong>Username:</strong> ${username}</li>
              <li><strong>TLS Enabled:</strong> ${useTls}</li>
            </ul>
            <p><em>If you received this email, your SMTP configuration is working correctly.</em></p>
          `,
          };

          await transporter.sendMail(testEmail);
          console.log("Test email sent successfully");
        }

        res.json({
          success: true,
          message: fromEmail
            ? "Connection successful and test email sent"
            : "Connection successful",
        });
      } catch (error) {
        console.error("SMTP test connection error:", error);
        res.status(400).json({
          success: false,
          message: "SMTP connection failed: " + (error as Error).message,
        });
      }
    },
  );
 
  // Instruction steps routes
  app.get("/api/instruction-steps", async (req, res) => {
    try {
      const steps = await storage.getAllInstructionSteps();
      res.json(steps);
    } catch (error) {
      console.error("Get instruction steps error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get instruction steps for a specific set (by ID or slug)
  app.get("/api/instruction-steps/:setId", async (req, res) => {
    try {
      const { setId } = req.params;

      let steps: any[] = [];

      // Check if it looks like a UUID (instruction set ID)
      if (
        setId.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        )
      ) {
        // Get steps by instruction set ID
        steps = await storage.getInstructionStepsBySet(setId);
      } else {
        // Try to find by slug first
        let instructionSet = await storage.getInstructionSetBySlug(setId);

        // If not found by slug, try by instruction set code
        if (!instructionSet) {
          instructionSet = await storage.getInstructionSetByCode(setId);
        }

        if (instructionSet) {
          steps = await storage.getInstructionStepsBySet(instructionSet.id);
        }
      }

      console.log(
        `📋 Fetched ${steps.length} steps for instruction set: ${setId}`,
      );
      res.json(steps);
    } catch (error) {
      console.error("Get instruction steps by set error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  function validateLtiSignature({
    oauthParams,
    consumerSecret,
    receivedSignature,
    baseUrls,
    httpMethod,
  }: {
    oauthParams: Record<string, string>;
    consumerSecret: string;
    receivedSignature: string;
    baseUrls: string[];
    httpMethod: string;
  }): boolean {
    console.log("\n---------------- LTI Signature Validation ----------------");
    console.log("Received Signature:", receivedSignature);
    console.log("OAuth Params (sorted):", JSON.stringify(oauthParams, null, 2));
    console.log("Base URLs to test:", baseUrls);

    let matchFound = false;

    for (const baseUrl of baseUrls) {
      // Try with standard encoding
      const paramsString = Object.keys(oauthParams)
        .sort()
        .map(
          (key) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`
        )
        .join("&");

      const baseString = [
        httpMethod.toUpperCase(),
        encodeURIComponent(baseUrl),
        encodeURIComponent(paramsString),
      ].join("&");

      const signingKey = `${encodeURIComponent(consumerSecret)}&`;
      const expectedSignature = createHmac("sha1", signingKey)
        .update(baseString)
        .digest("base64");

      console.log("\n--------------------------------------------------");
      console.log("Base URL:", baseUrl);
      console.log("Expected Signature (standard encoding):", expectedSignature);
      console.log(
        "Match:",
        expectedSignature === receivedSignature ? "✅ MATCH" : "❌ NO MATCH"
      );

      if (expectedSignature === receivedSignature) {
        matchFound = true;
        break;
      }

      // Try with RFC 3986 encoding (more strict - encodes more characters)
      const paramsStringRFC3986 = Object.keys(oauthParams)
        .sort()
        .map((key) => {
          const encodedKey = encodeURIComponent(key).replace(/[!'()*]/g, (c) => {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
          });
          const encodedValue = encodeURIComponent(oauthParams[key]).replace(/[!'()*]/g, (c) => {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
          });
          return `${encodedKey}=${encodedValue}`;
        })
        .join("&");

      const baseStringRFC3986 = [
        httpMethod.toUpperCase(),
        encodeURIComponent(baseUrl).replace(/[!'()*]/g, (c) => {
          return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        }),
        encodeURIComponent(paramsStringRFC3986).replace(/[!'()*]/g, (c) => {
          return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        }),
      ].join("&");

      const expectedSignatureRFC3986 = createHmac("sha1", signingKey)
        .update(baseStringRFC3986)
        .digest("base64");

      console.log("Expected Signature (RFC 3986 encoding):", expectedSignatureRFC3986);
      console.log(
        "Match:",
        expectedSignatureRFC3986 === receivedSignature ? "✅ MATCH" : "❌ NO MATCH"
      );

      if (expectedSignatureRFC3986 === receivedSignature) {
        matchFound = true;
        break;
      }
    }

    console.log("--------------------------------------------------");
    console.log("✅ Validation Result:", matchFound ? "PASS" : "FAIL");
    console.log("--------------------------------------------------\n");

    return matchFound;
  }

  // ----------------------------------------------------------------------
  // Main LTI Validation Function
  // ----------------------------------------------------------------------

  function validateLTICredentials(req: any, expectedConsumerSecret: string): boolean {
    const {
      oauth_consumer_key,
      oauth_signature,
      oauth_timestamp,
      oauth_nonce,
      oauth_signature_method,
    } = req.body;

    if (!oauth_consumer_key || !oauth_signature || !oauth_timestamp || !oauth_nonce) {
      console.log("❌ LTI validation failed: missing required OAuth parameters");
      return false;
    }

    if (oauth_signature_method !== "HMAC-SHA1") {
      console.log("❌ LTI validation failed: unsupported signature method");
      return false;
    }

    if (!expectedConsumerSecret || expectedConsumerSecret.length === 0) {
      console.log("❌ LTI validation failed: consumer secret not configured");
      return false;
    }

    try {
      const host = req.get("host");
      const path = req.path;
      const protocol = req.protocol;
      const httpMethod = req.method;

      // Generate URL variations to test
      const baseUrls = [
        `${protocol}://${host}${path}`,
        `https://${host}${path}`,
        `http://${host}${path}`,
      ];

      // If host includes a non-standard port, also try without it
      if (host.includes(':')) {
        const hostWithoutPort = host.split(':')[0];
        baseUrls.push(
          `${protocol}://${hostWithoutPort}${path}`,
          `https://${hostWithoutPort}${path}`,
          `http://${hostWithoutPort}${path}`
        );
      }

      // Remove duplicates
      const uniqueBaseUrls = Array.from(new Set(baseUrls));

      // ✅ CRITICAL: Merge query params with body params
      const params = { ...req.query, ...req.body };
      delete params.oauth_signature;

      // Decode HTML entities but DON'T modify the original values
      // Just create a clean copy for signature verification
      const cleanedParams: Record<string, string> = {};
      Object.keys(params).forEach((key) => {
        if (typeof params[key] === "string") {
          cleanedParams[key] = params[key]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        } else {
          cleanedParams[key] = params[key];
        }
      });

      console.log("\n🔍 Debugging parameter values:");
      console.log("resource_link_title:", cleanedParams.resource_link_title);
      console.log("context_title:", cleanedParams.context_title);

      const isValid = validateLtiSignature({
        oauthParams: cleanedParams,
        consumerSecret: expectedConsumerSecret,
        receivedSignature: oauth_signature,
        baseUrls: uniqueBaseUrls,
        httpMethod,
      });

      if (isValid) {
        console.log(
          `✅ LTI validation successful for consumer: ${oauth_consumer_key}`
        );
        return true;
      }

      console.log("❌ LTI validation failed: signature mismatch with all URL patterns");
      console.log("💡 Hint: Check if special characters in parameter values are causing encoding issues");
      return false;
    } catch (error) {
      console.log("❌ LTI validation failed: signature computation error", error);
      return false;
    }
  }

  // Instruction sets routes
  app.get(
    "/api/instruction-sets",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const sets = await storage.getAllInstructionSets();
        res.json(sets);
      } catch (error) {
        console.error("Get instruction sets error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/instruction-sets",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const setData = req.body;
        const newSet = await storage.createInstructionSet(setData);

        // Create default instruction steps for the new set
        const defaultSteps = [
          {
            instructionSetId: newSet.id,
            stepNumber: "1",
            title: "Welcome to the assessment",
            content:
              "<p>Welcome to your assessment submission portal. Please review the instructions carefully before proceeding with your submission.</p>",
            stepType: "info" as const,
            checkboxItems: [],
            isActive: "true",
          },
          {
            instructionSetId: newSet.id,
            stepNumber: "2",
            title: "How to submit your assessment",
            content:
              "<p>Please ensure your submission meets all requirements:</p><ul><li>File format must be PDF, DOC, or DOCX</li><li>Include your CIPD membership number on the front cover</li><li>Add accurate word count to your front cover</li><li>Check all formatting requirements</li></ul>",
            stepType: "info" as const,
            checkboxItems: [],
            isActive: "true",
          },
          {
            instructionSetId: newSet.id,
            stepNumber: "3",
            title: "Please confirm agreement to the statement(s)",
            content:
              "<p>Before proceeding to upload your assignment, please confirm that you agree to all the following statements:</p>",
            stepType: "checkbox" as const,
            checkboxItems: [
              'I confirm I\'ve read and understood the submission instructions and previous feedback and I answered "Yes" to all questions on the Submission requirements page.',
              "I confirm that my work does not contain any AI generated content.",
              "I confirm that I have added the first 7 digits of my CIPD membership number accurately to my front cover.",
              "I confirm that I have added the accurate word count to my front cover.",
              "I confirm that I have read the assessment regulations and understand that if I am found to have 'copied' from published work without acknowledgment, or from other learner's work, this may be regarded as plagiarism and an assessment offence and leads to failure in the relevant unit and formal disciplinary action in line with the Avado's malpractice policy.",
              "I agree to this work being subjected to scrutiny by textual analysis software.",
              "I understand that my work may be used for future academic/quality assurance purposes in accordance with the provisions of Data Protection legislation.",
              "I understand that the work/evidence submitted for assessment may not be returned to me and that I have retained a copy for my records.",
              "I understand that until such time as the assessment grade has been confirmed through internal quality assurance and CIPD moderation it is not final.",
              "I understand the consequences of malpractice and accept that any violation of this agreement may result in disciplinary action.",
            ],
            isActive: "true",
          },
        ];

        // Create the default steps
        for (const step of defaultSteps) {
          await storage.createInstructionStep(step);
        }

        console.log(
          `✅ Created instruction set "${newSet.name}" with 3 default steps`,
        );
        res.json(newSet);
      } catch (error) {
        console.error("Create instruction set error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/instruction-sets/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const setData = req.body;
        const updatedSet = await storage.updateInstructionSet(id, setData);
        res.json(updatedSet);
      } catch (error) {
        console.error("Update instruction set error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/instruction-sets/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteInstructionSet(id);
        res.json({ message: "Instruction set deleted successfully" });
      } catch (error) {
        console.error("Delete instruction set error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/instruction-steps",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const steps = req.body; // Array of steps

        if (!Array.isArray(steps)) {
          return res.status(400).json({ message: "Steps must be an array" });
        }

        if (steps.length === 0) {
          return res.json([]);
        }

        // Verify all steps belong to the same instruction set
        const instructionSetId = steps[0].instructionSetId;
        if (!instructionSetId) {
          return res
            .status(400)
            .json({ message: "All steps must have an instructionSetId" });
        }

        const invalidSteps = steps.filter(
          (step) => step.instructionSetId !== instructionSetId,
        );
        if (invalidSteps.length > 0) {
          return res
            .status(400)
            .json({
              message: "All steps must belong to the same instruction set",
            });
        }

        console.log(
          `🔧 Processing ${steps.length} instruction steps for set: ${instructionSetId}`,
        );

        // First, delete all existing steps for this instruction set to avoid duplicates
        await storage.deleteInstructionStepsBySet(instructionSetId);

        const updatedSteps = [];
        for (const step of steps) {
          console.log("📝 Creating step:", {
            title: step.title,
            stepType: step.stepType,
            stepNumber: step.stepNumber,
          });

          // Remove the ID field to force creation of new steps
          const { id, createdAt, updatedAt, ...cleanStep } = step;
          const updated = await storage.createInstructionStep(cleanStep);
          updatedSteps.push(updated);
        }

        console.log(
          `✅ Successfully saved ${updatedSteps.length} steps for instruction set: ${instructionSetId}`,
        );
        res.json(updatedSteps);
      } catch (error) {
        console.error("Update instruction steps error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // User instruction agreement routes - for audit tracking
  app.post("/api/user-agreements/step", async (req, res) => {
    try {
      const { ltiLaunchId, instructionSetId, stepId, checkboxIndex } = req.body;

      if (
        !ltiLaunchId ||
        !instructionSetId ||
        !stepId ||
        checkboxIndex === undefined
      ) {
        return res
          .status(400)
          .json({
            message:
              "Missing required fields: ltiLaunchId, instructionSetId, stepId, checkboxIndex",
          });
      }

      // Get or create placeholder assignment submission to link the agreement
      const assignmentSubmission =
        await storage.getOrCreatePlaceholderSubmission(ltiLaunchId);

      // Look up instruction set by code to get the actual UUID
      const instructionSet =
        await storage.getInstructionSetByCode(instructionSetId);
      if (!instructionSet) {
        return res
          .status(404)
          .json({ message: `Instruction set not found: ${instructionSetId}` });
      }
      const actualInstructionSetId = instructionSet.id;

      // Record step agreement timestamp (simplified - no more JSON tracking)
      const agreement = await storage.updateStepAgreement(
        assignmentSubmission.id,
        actualInstructionSetId,
      );

      console.log(
        `📋 Recorded step agreement: ${ltiLaunchId} - step ${stepId} - checkbox ${checkboxIndex}`,
      );
      res.json({ success: true, agreement });
    } catch (error) {
      console.error("Save step agreement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/user-agreements/turnitin", async (req, res) => {
    try {
      const { ltiLaunchId, instructionSetId } = req.body;

      if (!ltiLaunchId || !instructionSetId) {
        return res
          .status(400)
          .json({
            message: "Missing required fields: ltiLaunchId, instructionSetId",
          });
      }

      // Get or create placeholder assignment submission to link the agreement
      const assignmentSubmission =
        await storage.getOrCreatePlaceholderSubmission(ltiLaunchId);

      // Look up instruction set by code to get the actual UUID
      const instructionSet =
        await storage.getInstructionSetByCode(instructionSetId);
      if (!instructionSet) {
        return res
          .status(404)
          .json({ message: `Instruction set not found: ${instructionSetId}` });
      }
      const actualInstructionSetId = instructionSet.id;

      // Record TurnItIn agreement timestamp
      const agreement = await storage.updateTurnitinAgreement(
        assignmentSubmission.id,
        actualInstructionSetId,
      );

      console.log(
        `📋 Recorded TurnItIn agreement: ${ltiLaunchId} - ${instructionSetId}`,
      );
      res.json({ success: true, agreement });
    } catch (error) {
      console.error("Save TurnItIn agreement error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/user-agreements/submission", async (req, res) => {
    try {
      const { ltiLaunchId, instructionSetId } = req.body;

      if (!ltiLaunchId || !instructionSetId) {
        return res
          .status(400)
          .json({
            message: "Missing required fields: ltiLaunchId, instructionSetId",
          });
      }

      // Get or create placeholder assignment submission to link the agreement
      const assignmentSubmission =
        await storage.getOrCreatePlaceholderSubmission(ltiLaunchId);

      // Look up instruction set by code to get the actual UUID
      const instructionSet =
        await storage.getInstructionSetByCode(instructionSetId);
      if (!instructionSet) {
        return res
          .status(404)
          .json({ message: `Instruction set not found: ${instructionSetId}` });
      }
      const actualInstructionSetId = instructionSet.id;

      // Mark final submission timestamp
      const agreement = await storage.markFinalSubmission(
        assignmentSubmission.id,
        actualInstructionSetId,
      );

      console.log(
        `📋 Recorded final submission: ${ltiLaunchId} - ${instructionSetId}`,
      );
      res.json({ success: true, agreement });
    } catch (error) {
      console.error("Mark final submission error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(
    "/api/user-agreements/:ltiLaunchId/:instructionSetId",
    async (req, res) => {
      try {
        const { ltiLaunchId, instructionSetId } = req.params;

        // Get or create placeholder assignment submission
        const assignmentSubmission =
          await storage.getOrCreatePlaceholderSubmission(ltiLaunchId);

        // Look up instruction set by code to get the actual UUID
        const instructionSet =
          await storage.getInstructionSetByCode(instructionSetId);
        if (!instructionSet) {
          return res
            .status(404)
            .json({
              message: `Instruction set not found: ${instructionSetId}`,
            });
        }
        const actualInstructionSetId = instructionSet.id;

        const agreement = await storage.getUserInstructionAgreementBySubmission(
          assignmentSubmission.id,
          actualInstructionSetId,
        );

        if (!agreement) {
          return res.status(404).json({ message: "Agreement not found" });
        }

        res.json(agreement);
      } catch (error) {
        console.error("Get user agreement error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Email template routes
  app.get(
    "/api/email-templates",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const templates = await storage.getAllEmailTemplates();
        res.json(templates);
      } catch (error) {
        console.error("Get email templates error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/email-templates/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const template = await storage.getEmailTemplate(id);

        if (!template) {
          return res.status(404).json({ message: "Email template not found" });
        }

        res.json(template);
      } catch (error) {
        console.error("Get email template error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/email-templates",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const template = await storage.createEmailTemplate(req.body);
        res.json(template);
      } catch (error) {
        console.error("Create email template error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/email-templates/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const template = await storage.updateEmailTemplate(id, req.body);
        res.json(template);
      } catch (error) {
        console.error("Update email template error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/email-templates/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteEmailTemplate(id);
        res.json({ message: "Email template deleted successfully" });
      } catch (error) {
        console.error("Delete email template error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Skip reason routes
  app.get(
    "/api/skip-reasons",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const skipReasons = await storage.getAllSkipReasons();
        res.json(skipReasons);
      } catch (error) {
        console.error("Get skip reasons error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Active skip reasons (must come before :id route)
  app.get(
    "/api/skip-reasons/active",
    requireAuth,
    async (req, res) => {
      try {
        const allSkipReasons = await storage.getAllSkipReasons();
        const activeSkipReasons = allSkipReasons.filter(
          (reason) => reason.isActive === "true",
        );
        res.json(activeSkipReasons);
      } catch (error) {
        console.error("Get active skip reasons error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/skip-reasons/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const skipReason = await storage.getSkipReason(id);

        if (!skipReason) {
          return res.status(404).json({ message: "Skip reason not found" });
        }

        res.json(skipReason);
      } catch (error) {
        console.error("Get skip reason error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/skip-reasons",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const skipReason = await storage.createSkipReason(req.body);
        res.json(skipReason);
      } catch (error) {
        console.error("Create skip reason error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/skip-reasons/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const skipReason = await storage.updateSkipReason(id, req.body);
        res.json(skipReason);
      } catch (error) {
        console.error("Update skip reason error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/skip-reasons/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteSkipReason(id);
        res.json({ message: "Skip reason deleted successfully" });
      } catch (error) {
        console.error("Delete skip reason error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/skip-reasons/reorder",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { orderedIds } = req.body;
        await storage.reorderSkipReasons(orderedIds);
        res.json({ message: "Skip reasons reordered successfully" });
      } catch (error) {
        console.error("Reorder skip reasons error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Malpractice level routes
  app.get(
    "/api/malpractice-levels",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const malpracticeLevels = await storage.getAllMalpracticeLevels();
        res.json(malpracticeLevels);
      } catch (error) {
        console.error("Get malpractice levels error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Active malpractice levels (must come before :id route)
  app.get(
    "/api/malpractice-levels/active",
    requireAuth,
    async (req, res) => {
      try {
        const allMalpracticeLevels = await storage.getAllMalpracticeLevels();
        const activeMalpracticeLevels = allMalpracticeLevels.filter(
          (level) => level.isActive === "true",
        );
        res.json(activeMalpracticeLevels);
      } catch (error) {
        console.error("Get active malpractice levels error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/malpractice-levels/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const malpracticeLevel = await storage.getMalpracticeLevel(id);

        if (!malpracticeLevel) {
          return res.status(404).json({ message: "Malpractice level not found" });
        }

        res.json(malpracticeLevel);
      } catch (error) {
        console.error("Get malpractice level error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/malpractice-levels",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const malpracticeLevel = await storage.createMalpracticeLevel(req.body);
        res.json(malpracticeLevel);
      } catch (error) {
        console.error("Create malpractice level error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/malpractice-levels/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const malpracticeLevel = await storage.updateMalpracticeLevel(id, req.body);
        res.json(malpracticeLevel);
      } catch (error) {
        console.error("Update malpractice level error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/malpractice-levels/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteMalpracticeLevel(id);
        res.json({ message: "Malpractice level deleted successfully" });
      } catch (error) {
        console.error("Delete malpractice level error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/malpractice-levels/reorder",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { orderedIds } = req.body;
        await storage.reorderMalpracticeLevels(orderedIds);
        res.json({ message: "Malpractice levels reordered successfully" });
      } catch (error) {
        console.error("Reorder malpractice levels error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Email sending routes
  app.post(
    "/api/email/send",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { emailService } = await import("./services/emailService");
        const { templateKey, to, customProperties, contactProperties } =
          req.body;

        // Get system settings
        const systemSettings = await storage.getAllSystemSettings();

        // Get email template
        const emailTemplate = await storage.getEmailTemplateByKey(templateKey);
        if (!emailTemplate) {
          return res.status(404).json({ message: "Email template not found" });
        }

        const result = await emailService.sendTransactionalEmail(
          systemSettings,
          emailTemplate,
          {
            to,
            templateKey,
            customProperties,
            contactProperties,
          },
        );

        res.json({ success: true, result });
      } catch (error) {
        console.error("Send email error:", error);
        res.status(500).json({
          success: false,
          message:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  app.post(
    "/api/email/send-invite",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { emailService } = await import("./services/emailService");
        const { email, inviteUrl, inviterName, role, platformName } = req.body;

        // Get system settings
        const systemSettings = await storage.getAllSystemSettings();

        // Get invite user email template
        const emailTemplate =
          await storage.getEmailTemplateByKey("invite_user");
        if (!emailTemplate) {
          return res
            .status(404)
            .json({ message: "Invite user email template not found" });
        }

        const result = await emailService.sendInviteUserEmail(
          systemSettings,
          emailTemplate,
          {
            to: email,
            inviteUrl,
            inviterName,
            role,
            platformName,
          },
        );

        res.json({ success: true, result });
      } catch (error) {
        console.error("Send invite email error:", error);
        res.status(500).json({
          success: false,
          message:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );

  app.post("/api/email/send-forgot-password", requireAuth, async (req, res) => {
    try {
      const { emailService } = await import("./services/emailService");
      const { email, resetUrl, userName, platformName } = req.body;

      // Get system settings
      const systemSettings = await storage.getAllSystemSettings();

      // Get forgot password email template
      const emailTemplate =
        await storage.getEmailTemplateByKey("forgot_password");
      if (!emailTemplate) {
        return res
          .status(404)
          .json({ message: "Forgot password email template not found" });
      }

      const result = await emailService.sendForgotPasswordEmail(
        systemSettings,
        emailTemplate,
        {
          to: email,
          resetUrl,
          userName,
          platformName,
        },
      );

      res.json({ success: true, result });
    } catch (error) {
      console.error("Send forgot password email error:", error);
      res.status(500).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  // Completion message route for file submissions
  app.get("/api/completion-message/:instructionSetCode", async (req, res) => {
    try {
      const { instructionSetCode } = req.params;

      if (!instructionSetCode) {
        return res
          .status(400)
          .json({ message: "Instruction set code is required" });
      }

      const decodedInstructionSetCode = decodeURIComponent(instructionSetCode);
      console.log(
        `🎯 Looking for completion message for instruction set code: ${decodedInstructionSetCode}`,
      );

      // Find the instruction set by instruction set code
      const instructionSet = await storage.getInstructionSetByCode(
        decodedInstructionSetCode,
      );

      if (!instructionSet) {
        console.log(
          `❌ Instruction set not found for instruction set code: ${decodedInstructionSetCode}`,
        );
        return res.status(404).json({ message: "Instruction set not found" });
      }

      console.log(
        `✅ Found instruction set: ${instructionSet.name}, completion message: ${instructionSet.completionMessage ? "exists" : "not set"}, submission title: ${instructionSet.submissionTitle ? "exists" : "not set"}`,
      );

      // Return the completion message and submission title
      res.json({
        message: instructionSet.completionMessage || null,
        submissionTitle: instructionSet.submissionTitle || null,
      });
    } catch (error) {
      console.error("Get completion message error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // LTI Routes
  app.post("/api/lti/launch", async (req, res) => {
    try {
      // Generate a unique launch ID
      const launchId =
        Date.now().toString() + Math.random().toString(36).substr(2, 9);

      // Extract LTI parameters (these would normally come from the LMS)
      const {
        oauth_consumer_key,
        user_id,
        lis_person_contact_email_primary,
        lis_person_name_full,
        lis_person_name_given,
        lis_person_name_family,
        context_title,
        context_type,
        resource_link_title,
        launch_presentation_return_url,
        resource_link_id,
        context_id,
        tool_consumer_instance_guid,
        tool_consumer_instance_name,
        custom_assignment_id,
        custom_action,
        cis, // Custom instruction set parameter
        cas, // Custom assessment code parameter
        lti_message_type,
        roles,
      } = req.body;

      console.log(req.body)

      console.log("LTI Launch parameters:", {
        custom_action,
        cis, // Custom instruction set parameter
        cas, // Custom assessment code parameter
        oauth_consumer_key,
        user_id,
      });

      // Parse URL parameters for additional custom parameters
      const urlParams = new URLSearchParams(req.url?.split("?")[1] || "");
      const urlCustomAction = urlParams.get("custom_action");
      const urlCis = urlParams.get("cis"); // Custom instruction set parameter
      const urlCas = urlParams.get("cas"); // Custom assessment code parameter

      // Use body params first, then fall back to URL params
      const finalCustomAction = custom_action || urlCustomAction;
      const finalCustomInstructionSet = (cis || urlCis)?.trim(); // Custom instruction set parameter
      const finalCustomAssessmentCode = (cas || urlCas)?.trim(); // Custom assessment code parameter

      console.log("Final custom parameters:", {
        finalCustomAction,
        finalCustomInstructionSet,
        finalCustomAssessmentCode,
      });

      // Validate required parameters (cis and cas)
      // These are optional when custom_action is 'result'
      let instructionSet = null;
      let assessment = null;

      // Skip validation if custom_action is 'result'
      if (finalCustomAction !== 'result') {
        // Both parameters are required for proper operation (except for result view)
        if (!finalCustomInstructionSet && !finalCustomAssessmentCode) {
          console.log("Missing required LTI parameters: cis and cas");
          return res.status(400).send(`
            <html>
              <head><title>Missing Required Parameters</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #d32f2f;">Error: Missing Required Parameters</h1>
                <p>Both 'cis' (custom instruction set) and 'cas' (custom assessment code) parameters are required.</p>
                <p>Please configure your LMS to send these parameters with the LTI launch.</p>
              </body>
            </html>
          `);
        }
      }

      // Validate custom instruction set (cis) parameter
      if (finalCustomInstructionSet) {
        // First try by instruction set code, then by ID, then by slug
        instructionSet = await storage.getInstructionSetByCode(
          finalCustomInstructionSet,
        );
        if (!instructionSet) {
          instructionSet = await storage.getInstructionSet(
            finalCustomInstructionSet,
          );
        }
        if (!instructionSet) {
          instructionSet = await storage.getInstructionSetBySlug(
            finalCustomInstructionSet,
          );
        }

        if (!instructionSet) {
          console.log(`Unknown instruction set: ${finalCustomInstructionSet}`);
          return res.status(400).send(`
            <html>
              <head><title>Unknown Instruction Set</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #d32f2f;">Error: Unknown Instruction Set</h1>
                <p>The instruction set "${finalCustomInstructionSet}" was not found.</p>
                <p>Please check the instruction set identifier and try again.</p>
              </body>
            </html>
          `);
        }
      }

      // Validate custom assessment code (cas) parameter
      if (finalCustomAssessmentCode) {
        assessment = await storage.getAssessmentsByCode(
          finalCustomAssessmentCode,
        );

        if (!assessment) {
          console.log(`Unknown assessment code: ${finalCustomAssessmentCode}`);
          return res.status(400).send(`
            <html>
              <head><title>Unknown Assessment Code</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #d32f2f;">Error: Unknown Assessment Code</h1>
                <p>The assessment code "${finalCustomAssessmentCode}" was not found.</p>
                <p>Please check the assessment code and try again.</p>
              </body>
            </html>
          `);
        }
      }

      console.log("Parameter validation successful:", {
        instructionSet: instructionSet
          ? `${instructionSet.name} (${instructionSet.id})`
          : "not provided",
        assessment: assessment
          ? `${assessment.name} (${assessment.code})`
          : "not provided",
      });

      // Get consumer key and secret from settings
      const consumerKeySetting =
        await storage.getSystemSetting("lti_consumer_key");
      const consumerSecretSetting =
        await storage.getSystemSetting("lti_shared_secret");

      // Verify consumer key exists and matches
      if (
        !consumerKeySetting ||
        !consumerSecretSetting ||
        consumerKeySetting.value !== oauth_consumer_key
      ) {
        return res.status(401).json({
          success: false,
          message: "Invalid consumer key",
        });
      }

      // Validate LTI credentials
      if (!validateLTICredentials(req, consumerSecretSetting.value!)) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid LTI credentials - check your consumer key and secret",
        });
      }

      // Create LTI launch session (expires in 1 hour)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const ltiSession = await storage.createLtiLaunchSession({
        launchId,
        consumerKey: oauth_consumer_key,
        userId: user_id,
        userEmail: lis_person_contact_email_primary,
        userName: lis_person_name_full,
        courseName: context_title,
        assignmentTitle: resource_link_title,
        returnUrl: launch_presentation_return_url,
        resourceLinkId: resource_link_id,
        contextId: context_id,
        toolConsumerInstanceGuid: tool_consumer_instance_guid,
        customParams: JSON.stringify({
          custom_assignment_id,
          custom_action: finalCustomAction,
          cis: finalCustomInstructionSet, // Custom instruction set parameter
          cas: finalCustomAssessmentCode, // Custom assessment code parameter
          instruction_set_id: instructionSet?.id,
          assessment_id: assessment?.id,
          assessment_code: assessment?.code,
        }),
        // Additional LTI fields for student tracking
        ltiMessageType: lti_message_type,
        contextType: context_type,
        contextTitle: context_title,
        roles: roles,
        lisPersonNameGiven: lis_person_name_given,
        lisPersonNameFamily: lis_person_name_family,
        lisPersonNameFull: lis_person_name_full,
        lisPersonContactEmailPrimary: lis_person_contact_email_primary,
        toolConsumerInstanceName: tool_consumer_instance_name,
        customAction: finalCustomAction,
        customInstructionSet: finalCustomInstructionSet,
        customAssessmentCode: finalCustomAssessmentCode,
        expiresAt,
      });

      // Create comprehensive session record with all LTI fields extracted during launch (foolproof approach)
      const sessionRecord = await storage.createLtiSessionRecord({
        launchId,
        lmsUserId: user_id,
        consumerName: tool_consumer_instance_name,
        role: roles,
        firstName: lis_person_name_given,
        lastName: lis_person_name_family,
        fullName: lis_person_name_full,
        email: lis_person_contact_email_primary,
        customAction: finalCustomAction,
        customInstructionSet: finalCustomInstructionSet,
        customAssessmentCode: finalCustomAssessmentCode,
        contextType: context_type,
        contextTitle: context_title,
        resourceLinkId: resource_link_id,
        resourceLinkTitle: resource_link_title,
        contextId: context_id,
        consumerKey: oauth_consumer_key,
        toolConsumerInstanceGuid: tool_consumer_instance_guid,
        returnUrl: launch_presentation_return_url,
        hasFileSubmission: "false",
        sessionExpiry: expiresAt,
      });

      console.log(
        "📋 LTI session record created during launch with comprehensive data:",
        {
          sessionRecordId: sessionRecord.id,
          launchId: sessionRecord.launchId,
          extractedFields: {
            lmsUserId: sessionRecord.lmsUserId,
            consumerName: sessionRecord.consumerName,
            role: sessionRecord.role,
            firstName: sessionRecord.firstName,
            lastName: sessionRecord.lastName,
            fullName: sessionRecord.fullName,
            email: sessionRecord.email,
            customAssessmentCode: sessionRecord.customAssessmentCode,
            customAction: sessionRecord.customAction,
            contextType: sessionRecord.contextType,
            contextTitle: sessionRecord.contextTitle,
          },
        },
      );

      // Redirect to assignment page with assessment code parameter
      let redirectUrl;
      if (finalCustomAction === 'result') {
        redirectUrl = `/lti/results/${launchId}`;
      } else {
        redirectUrl = finalCustomAssessmentCode
          ? `/lti/assignment/${launchId}?assessment_code=${finalCustomAssessmentCode}`
          : `/lti/assignment/${launchId}`;
      }

      console.log(`Redirecting to: ${redirectUrl}`);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("LTI launch error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during LTI launch",
      });
    }
  });

  app.get("/api/lti/session/:launchId", async (req, res) => {
    try {
      const { launchId } = req.params;
      const session = await storage.getLtiLaunchSession(launchId);

      if (!session) {
        return res.status(404).json({
          success: false,
          message: "LTI session not found",
        });
      }

      // Check if session has expired
      if (new Date() > session.expiresAt) {
        return res.status(401).json({
          success: false,
          message: "LTI session expired",
        });
      }

      res.json({ success: true, session });
    } catch (error) {
      console.error("Get LTI session error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });

  app.get("/api/lti/results/:launchId", async (req, res) => {
    try {
      const { launchId } = req.params;
      const { page, limit, search } = req.query;

      // Get the session record with user info
      const sessionRecord = await storage.getLtiSessionRecord(launchId);
      if (!sessionRecord) {
        return res.status(404).json({
          success: false,
          message: "LTI session not found",
        });
      }

      // Check if session has expired
      if (new Date() > sessionRecord.sessionExpiry) {
        return res.status(401).json({
          success: false,
          message: "LTI session expired",
        });
      }

      const { lmsUserId } = sessionRecord;

      if (!lmsUserId) {
        return res.status(400).json({
          success: false,
          message: "Invalid session data - missing user ID",
        });
      }

      // Parse pagination parameters
      const pageNum = page ? parseInt(page as string, 10) : 1;
      const limitNum = limit ? parseInt(limit as string, 10) : 10;
      const searchQuery = search as string | undefined;

      // Get paginated and filtered submissions
      const result = await storage.getAllSubmissionsByUserPaginated(lmsUserId, {
        page: pageNum,
        limit: limitNum,
        searchQuery
      });

      // Generate viewer tokens for all submissions (not just released)
      const { generateViewerToken, generateViewerExpiry } = await import('./services/ltiViewerTokenService');
      const submissionsWithTokens = await Promise.all(
        result.submissions.map(async (submission) => {
          try {
            // Generate new viewer token for this viewing session (returns { token, hash })
            const { token: plainToken, hash: hashedToken } = generateViewerToken();
            const expiresAt = generateViewerExpiry(24); // 24 hours
            
            // Store ONLY the hashed token in database
            await storage.createLtiViewerSession({
              submissionId: submission.id,
              viewerToken: hashedToken, // Store ONLY the hash
              launchId: launchId, // Required: Reference to original LTI launch
              lmsUserId: lmsUserId, // Required: LMS user ID
              contextId: sessionRecord.contextId, // Optional: LMS context
              attemptNumber: submission.attemptNumber, // Optional: Attempt number
              expiresAt,
            });

            return {
              ...submission,
              viewerToken: plainToken, // Return plain token to student ONCE
              viewerUrl: `/lti/submission/${submission.id}?token=${plainToken}&launchId=${launchId}`,
            };
          } catch (error) {
            console.error(`Error generating viewer token for submission ${submission.id}:`, error);
            return submission;
          }
        })
      );

      res.json({ 
        success: true, 
        submissions: submissionsWithTokens,
        sessionRecord,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error("Get LTI results error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });

  app.get("/api/lti/validate-eligibility/:launchId", async (req, res) => {
    try {
      const { launchId } = req.params;

      // Get the session record with user info
      const sessionRecord = await storage.getLtiSessionRecord(launchId);
      if (!sessionRecord) {
        return res.status(404).json({
          success: false,
          message: "LTI session not found",
        });
      }

      // Check if session has expired
      if (new Date() > sessionRecord.sessionExpiry) {
        return res.status(401).json({
          success: false,
          message: "LTI session expired",
        });
      }

      const { lmsUserId, customAssessmentCode, contextId } = sessionRecord;

      if (!lmsUserId || !customAssessmentCode || !contextId) {
        return res.status(400).json({
          success: false,
          message: "Invalid session data - missing required fields",
        });
      }

      // Validate submission eligibility
      const eligibilityCheck = await storage.validateSubmissionEligibility(
        lmsUserId,
        customAssessmentCode,
        contextId
      );

      if (!eligibilityCheck.isEligible) {
        return res.status(403).json({
          success: false,
          isEligible: false,
          message: eligibilityCheck.reason,
          blockingType: eligibilityCheck.blockingType,
          details: eligibilityCheck.details
        });
      }

      res.json({ 
        success: true, 
        isEligible: true,
        message: "You are eligible to submit a new attempt"
      });
    } catch (error) {
      console.error("Validate eligibility error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  });

  app.post("/api/lti/submit", async (req, res) => {
    try {
      const { launchId, files } = req.body; // Changed to accept array of files

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files provided for submission",
        });
      }

      console.log("🚀 LTI Multiple File Upload Started:", {
        launchId,
        fileCount: files.length,
        files: files.map((f) => ({
          name: f.fileName,
          size: f.fileSize,
          type: f.fileType,
        })),
      });

      // Get and validate LTI session
      const session = await storage.getLtiLaunchSession(launchId);
      if (!session || new Date() > session.expiresAt) {
        console.log("❌ LTI session validation failed:", {
          sessionExists: !!session,
          expired: session ? new Date() > session.expiresAt : "no session",
          launchId,
        });
        return res.status(401).json({
          success: false,
          message: "Invalid or expired LTI session",
        });
      }

      // Get the comprehensive session record with all extracted LTI data
      const sessionRecord = await storage.getLtiSessionRecord(launchId);
      if (!sessionRecord || new Date() > sessionRecord.sessionExpiry) {
        console.log("❌ LTI session record validation failed:", {
          recordExists: !!sessionRecord,
          expired: sessionRecord
            ? new Date() > sessionRecord.sessionExpiry
            : "no record",
          launchId,
        });
        return res.status(401).json({
          success: false,
          message: "Invalid or expired LTI session record",
        });
      }

      console.log(
        "✅ LTI session record validated, processing multiple files:",
        {
          sessionRecordId: sessionRecord.id,
          launchId: sessionRecord.launchId,
          fileCount: files.length,
          extractedFields: {
            lmsUserId: sessionRecord.lmsUserId,
            consumerName: sessionRecord.consumerName,
            role: sessionRecord.role,
            fullName: sessionRecord.fullName,
            email: sessionRecord.email,
            customAssessmentCode: sessionRecord.customAssessmentCode,
          },
        },
      );

      // Validate required fields
      if (!sessionRecord.lmsUserId || !sessionRecord.customAssessmentCode || !sessionRecord.contextId) {
        console.log("⚠️ Cannot validate submission - missing required fields:", {
          hasLmsUserId: !!sessionRecord.lmsUserId,
          hasCustomAssessmentCode: !!sessionRecord.customAssessmentCode,
          hasContextId: !!sessionRecord.contextId
        });
        return res.status(400).json({
          success: false,
          message: "Invalid session data - cannot validate submission.",
        });
      }

      // Use centralized validation function
      const eligibilityCheck = await storage.validateSubmissionEligibility(
        sessionRecord.lmsUserId,
        sessionRecord.customAssessmentCode,
        sessionRecord.contextId
      );

      if (!eligibilityCheck.isEligible) {
        console.log("❌ Submission blocked:", {
          lmsUserId: sessionRecord.lmsUserId,
          customAssessmentCode: sessionRecord.customAssessmentCode,
          contextId: sessionRecord.contextId,
          reason: eligibilityCheck.reason,
          blockingType: eligibilityCheck.blockingType,
          details: eligibilityCheck.details
        });
        
        return res.status(403).json({
          success: false,
          message: eligibilityCheck.reason,
          blockingType: eligibilityCheck.blockingType,
          ...eligibilityCheck.details
        });
      }

      // Get attempt count for logging
      const attemptCount = await storage.countSubmissionAttempts(
        sessionRecord.lmsUserId,
        sessionRecord.customAssessmentCode,
        sessionRecord.contextId
      );

      console.log(`✅ Submission eligibility validated: ${attemptCount + 1}/3 attempts`);

      // Process and upload all files
      const uploadedFiles = [];
      let totalFileSize = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { fileName, fileSize, fileType, fileData } = file;

        console.log(`🔄 Processing file ${i + 1}/${files.length}: ${fileName}`);

        let azureBlobUrl, azureBlobName, fileUrl;

        try {
          // Convert base64 file data to buffer
          const base64Data = fileData.split(",")[1]; // Remove data:type;base64, prefix
          const fileBuffer = Buffer.from(base64Data, "base64");

          // Get Azure Blob Service and upload file
          const azureService = getAzureBlobService();
          const uploadResult = await azureService.uploadFile({
            fileName,
            fileBuffer,
            contentType: getContentType(fileType),
            metadata: {
              studentId: session.userId || "unknown",
              launchId: launchId,
              courseName: session.courseName || "unknown",
              assignmentTitle: session.assignmentTitle || "unknown",
              uploadOrder: (i + 1).toString(),
              uploadedAt: new Date().toISOString(),
            },
          });

          azureBlobUrl = uploadResult.url;
          azureBlobName = uploadResult.blobName;
          fileUrl = uploadResult.url; // Use Azure URL as the main file URL

          console.log(`✅ File ${i + 1} uploaded to Azure: ${fileName}`);
        } catch (azureError) {
          console.error(
            `❌ Azure upload failed for file ${i + 1}:`,
            azureError,
          );
          // Fallback to local file reference if Azure upload fails
          fileUrl = `/uploads/${Date.now()}-${fileName}`;
          console.log(
            `⚠️ Using local reference for file ${i + 1}: ${fileName}`,
          );
        }

        const fileSizeBytes = parseFloat(fileSize) * 1024 * 1024; // Convert MB to bytes
        totalFileSize += fileSizeBytes;

        uploadedFiles.push({
          fileName,
          originalFileName: fileName,
          fileSize,
          fileType,
          fileMimeType: getContentType(fileType),
          fileUrl,
          azureBlobUrl: azureBlobUrl || null,
          azureBlobName: azureBlobName || null,
          azureContainerName: "rogoreplacement",
          uploadOrder: i + 1,
        });
      }

      // Create main submission record
      const submissionData = {
        ltiSessionRecordId: sessionRecord.id,
        ltiLaunchId: launchId,
        fileCount: files.length,
        totalFileSize: `${(totalFileSize / 1024 / 1024).toFixed(2)}MB`,
        attemptNumber: attemptCount + 1, // Record which attempt this is (1, 2, or 3)
        // Store comprehensive LTI fields from session record
        lmsUserId: sessionRecord.lmsUserId,
        consumerName: sessionRecord.consumerName,
        role: sessionRecord.role,
        firstName: sessionRecord.firstName,
        lastName: sessionRecord.lastName,
        fullName: sessionRecord.fullName,
        email: sessionRecord.email,
        customInstructionSet: sessionRecord.customInstructionSet,
        customAssessmentCode: sessionRecord.customAssessmentCode,
        customAction: sessionRecord.customAction,
        contextType: sessionRecord.contextType,
        contextTitle: sessionRecord.contextTitle,
        contextId: sessionRecord.contextId,
      };

      console.log("📝 Creating submission with multiple files:", {
        fileCount: submissionData.fileCount,
        totalFileSize: submissionData.totalFileSize,
        ltiLaunchId: submissionData.ltiLaunchId,
        extractedFields: {
          lmsUserId: submissionData.lmsUserId,
          consumerName: submissionData.consumerName,
          role: submissionData.role,
          fullName: submissionData.fullName,
          email: submissionData.email,
          customAssessmentCode: submissionData.customAssessmentCode,
          customInstructionSet: sessionRecord.customInstructionSet,
          contextId: sessionRecord.contextId,
        },
      });

      // Check if there's an existing placeholder submission for this launch ID
      const existingSubmission =
        await storage.getAssignmentSubmissionByLtiLaunchId(launchId);

      let submission;
      if (
        existingSubmission &&
        existingSubmission.fileCount === 0
      ) {
        // Update the placeholder submission with actual data
        submission = await storage.updateSubmission(existingSubmission.id, {
          ...submissionData
        });
        console.log(
          "📝 Updated existing placeholder submission:",
          existingSubmission.id,
        );
      } else {
        // Create new submission if no placeholder exists
        submission = await storage.createSubmission(submissionData);
        console.log("📝 Created new submission:", submission.id);
      }

      // Create individual file records
      const submissionFileRecords = uploadedFiles.map((file) => ({
        submissionId: submission.id,
        ...file,
        submissionFileType: "submission" as const, // Learner uploaded files
        uploadedBy: submission.lmsUserId || sessionRecord.lmsUserId, // Store LMS user ID for learners
      }));

      const createdFiles = await storage.createMultipleSubmissionFiles(
        submissionFileRecords,
      );

      // Submit files to TurnItIn immediately (no job processor)
      for (const file of createdFiles) {
        try {
          console.log(`🔄 Submitting file to TurnItIn: ${file.fileName}`);
          await submitFileToTurnitin(file, submission, sessionRecord);
          console.log(
            `✅ TurnItIn submission successful for: ${file.fileName}`,
          );
        } catch (error) {
          console.error(
            `❌ TurnItIn submission failed for ${file.fileName}:`,
            error,
          );
          // Update file with error status but continue processing other files
          await storage.updateSubmissionFile(file.id, {
            turnitinStatus: "error",
            turnitinErrorMessage:
              error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      // Mark the session record as having a file submission for tracking
      await storage.markSessionWithFileSubmission(launchId);

      // Automatically create a marking assignment in "waiting" status
      try {
        const existingMarkingAssignment = await storage.getMarkingAssignment(
          submission.id,
        );
        if (!existingMarkingAssignment) {
          await storage.createMarkingAssignment({
            submissionId: submission.id,
            assignedMarkerId: null, // Unassigned initially
            markingStatus: "waiting",
            statusUpdatedBy: null,
          });
          console.log(
            "📋 Created marking assignment for submission:",
            submission.id,
          );
        }
      } catch (error) {
        console.error("Failed to create marking assignment:", error);
        // Don't fail the submission if marking assignment creation fails
      }

      // Queue word count jobs for all submitted files
      const { wordCountService } = await import('./services/wordCountService');
      for (const file of createdFiles) {
        if (wordCountService.canProcessFile(file.fileUrl, file.fileName)) {
          try {
            await jobProcessor.addWordCountJob(
              submission.id,
              file.fileName,
              file.fileUrl
            );
            console.log(`📊 Queued word count job for: ${file.fileName}`);
          } catch (error) {
            console.error(`Failed to queue word count job for ${file.fileName}:`, error);
            // Don't fail the submission if word count job creation fails
          }
        } else {
          console.log(`⏭️ Skipping word count for ${file.fileName} (unsupported or inaccessible)`);
        }
      }

      console.log("✅ Multi-file submission created successfully:", {
        submissionId: submission.id,
        fileCount: submission.fileCount,
        totalFileSize: submission.totalFileSize,
        individualFiles: createdFiles.length,
        linkedSessionRecordId: submission.ltiSessionRecordId,
        submittedAt: submission.submittedAt,
      });

      // Call Marker Buddy API to save assignment
      if (process.env.MARKER_BUDDY_API_KEY) {
        try {
          fetch(`${process.env.VITE_APP_MARKING_BUDDY_URL}/api/save-assignment`, {
            method: 'POST',
            body: JSON.stringify({
              submissionId: submission.id,
              updateExisting: 0 // 0 only save if not exists, 1 for update if already exists
            }),
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.MARKER_BUDDY_API_KEY,
            },
          });
        } catch (markerBuddyError) {
          console.error('Error calling Marker Buddy API:', markerBuddyError);
          // Continue with submission even if Marker Buddy call fails
        }
      }

      res.json({
        success: true,
        submission,
        files: createdFiles,
        returnUrl: session.returnUrl,
      });
    } catch (error) {
      console.error("LTI multi-file submission error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during submission",
      });
    }
  });

  // Generate LTI viewer token for a submission (admin only)
  app.post("/api/lti/generate-viewer-token/:submissionId", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    try {
      const { submissionId } = req.params;
      
      // Verify submission exists
      const submission = await storage.getSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      // Get the LTI session record for this submission to get required fields
      const sessionRecord = await storage.getLtiSessionRecord(submission.ltiLaunchId);
      if (!sessionRecord) {
        return res.status(400).json({ message: "LTI session not found for this submission" });
      }

      if (!sessionRecord.lmsUserId) {
        return res.status(400).json({ message: "Invalid session data - missing user ID" });
      }

      // Import the token service
      const { generateViewerToken, generateViewerExpiry } = await import('./services/ltiViewerTokenService');

      // Generate a secure viewer token (returns { token, hash })
      const { token: plainToken, hash: hashedToken } = generateViewerToken();
      const expiresAt = generateViewerExpiry(24); // 24 hours expiry

      // Create viewer session in database with HASHED token
      const viewerSession = await storage.createLtiViewerSession({
        submissionId,
        viewerToken: hashedToken, // Store ONLY the hash
        launchId: submission.ltiLaunchId, // Required: Reference to original LTI launch
        lmsUserId: sessionRecord.lmsUserId, // Required: LMS user ID
        contextId: sessionRecord.contextId, // Optional: LMS context
        attemptNumber: submission.attemptNumber, // Optional: Attempt number
        expiresAt,
      });

      res.json({
        success: true,
        viewerToken: plainToken, // Return plain token to admin ONCE
        expiresAt,
        viewerUrl: `/lti/submission/${submissionId}?token=${plainToken}&launchId=${submission.ltiLaunchId}`,
      });
    } catch (error) {
      console.error("Generate viewer token error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // LTI Viewer endpoint - allows students to view their results via token
  app.get("/api/lti/viewer/submission/:submissionId", validateViewerToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { submissionId } = req.params;
      const viewerSession = req.viewerSession;

      // Verify the viewer token is for this submission
      if (viewerSession.submissionId !== submissionId) {
        return res.status(403).json({ message: "Token is not valid for this submission" });
      }

      // Get submission with files
      const { submission, files } = await storage.getSubmissionWithFiles(submissionId);

      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      // Get marking assignment info
      const markingAssignment = await storage.getMarkingAssignment(submissionId);

      // Get assessment data
      let assessment = null;
      let assessmentSections: any[] = [];
      let gradeBoundaries: any[] = [];
      let existingGrade = null;
      let existingSectionMarks: any[] = [];

      if (submission.customAssessmentCode) {
        assessment = await storage.getAssessmentByCode(submission.customAssessmentCode);
        
        if (assessment) {
          assessmentSections = await storage.getAssessmentSections(assessment.id);
          
          // Get marking options for each section
          for (const section of assessmentSections) {
            (section as any).markingOptions = await storage.getSectionMarkingOptions(section.id);
          }

          // Get grade boundaries
          gradeBoundaries = await storage.getAssessmentGradeBoundaries(assessment.id);

          // Get existing marking data
          existingGrade = await storage.getSubmissionGrade(submissionId);
          existingSectionMarks = await storage.getSubmissionSectionMarks(submissionId);
        }
      }

      // Return ONLY the data needed for viewing results
      res.json({
        submission: {
          id: submission.id,
          submittedAt: submission.submittedAt,
          fileCount: submission.fileCount,
          totalFileSize: submission.totalFileSize,
          attemptNumber: submission.attemptNumber,
          lmsUserId: submission.lmsUserId,
          fullName: submission.fullName,
          email: submission.email,
          customAssessmentCode: submission.customAssessmentCode,
        },
        markingStatus: markingAssignment?.markingStatus || null,
        assessment: assessment ? {
          id: assessment.id,
          name: assessment.name,
          code: assessment.code,
          totalMarks: assessment.totalMarks,
        } : null,
        assessmentSections,
        gradeBoundaries,
        grade: existingGrade,
        sectionMarks: existingSectionMarks,
        files: files.map(f => ({
          id: f.id,
          fileName: f.fileName,
          originalFileName: f.originalFileName,
          fileSize: f.fileSize,
          fileType: f.fileType,
          uploadedAt: f.uploadedAt,
        })),
      });
    } catch (error) {
      console.error("LTI viewer error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // LTI Viewer file download endpoint - allows students to download files via token
  app.get("/api/lti/viewer/submission/:submissionId/files/:fileId/download", validateViewerToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { submissionId, fileId } = req.params;
      const viewerSession = req.viewerSession;

      // Verify the viewer token is for this submission
      if (viewerSession.submissionId !== submissionId) {
        return res.status(403).json({ message: "Token is not valid for this submission" });
      }

      // Get submission file
      const file = await storage.getSubmissionFile(fileId);
      if (!file || file.submissionId !== submissionId) {
        return res.status(404).json({ message: "File not found" });
      }

      // If file is stored in Azure Blob Storage, download via server proxy
      if (file.azureBlobName) {
        try {
          const azureService = getAzureBlobService();
          console.log("Downloading file via viewer token:", file.azureBlobName);

          // Download file directly from Azure to server
          const fileBuffer = await azureService.downloadFile(file.azureBlobName);

          // Set appropriate headers for file download
          res.setHeader("Content-Type", file.fileType || "application/octet-stream");
          res.setHeader("Content-Disposition", `attachment; filename="${file.originalFileName || file.fileName}"`);
          res.setHeader("Content-Length", fileBuffer.length.toString());

          // Send the file buffer to client
          res.send(fileBuffer);
        } catch (downloadError) {
          console.error("Error downloading file from Azure:", downloadError);
          res.status(500).json({ message: "Error downloading file" });
        }
      } else {
        // Fallback for files not stored in Azure (if any)
        res.status(404).json({ message: "File not available for download" });
      }
    } catch (error) {
      console.error("Viewer download file error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Turnitin API endpoints
  app.get("/api/turnitin/status/:fileId", requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;

      // Get submission file with Turnitin data
      const file = await storage.getSubmissionFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      res.json({
        fileId: file.id,
        fileName: file.fileName,
        turnitinStatus: file.turnitinStatus,
        turnitinSubmissionId: file.turnitinSubmissionId,
        turnitinSimilarityScore: file.turnitinSimilarityScore,

        turnitinProcessedAt: file.turnitinProcessedAt,
        turnitinErrorMessage: file.turnitinErrorMessage,
        // PDF status information
        turnitinPdfId: file.turnitinPdfId,
        turnitinPdfStatus: file.turnitinPdfStatus || "pending",
        turnitinPdfUrl: file.turnitinPdfUrl,
        turnitinPdfGeneratedAt: file.turnitinPdfGeneratedAt,
      });
    } catch (error) {
      console.error("Get Turnitin status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/turnitin/report/:fileId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { fileId } = req.params;

      // Get submission file
      const file = await storage.getSubmissionFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      if (!file.turnitinSubmissionId) {
        return res
          .status(400)
          .json({ message: "No Turnitin submission found for this file" });
      }

      if (file.turnitinStatus !== "complete") {
        return res.status(400).json({
          message: "Turnitin processing not complete yet",
          status: file.turnitinStatus,
        });
      }

      // Always generate a fresh viewer URL since they expire in less than 1 minute
      const { turnitinService } = await import("./services/turnitinService");
      const viewerData = await turnitinService.createViewerUrl(
        storage,
        file.turnitinSubmissionId,
        {
          userId: req.user?.id || "unknown",
          locale: "en-US",
          permissionSet: "INSTRUCTOR",
        },
      );

      res.json({
        reportUrl: viewerData.viewer_url,
        similarityScore: file.turnitinSimilarityScore,
      });
    } catch (error) {
      console.error("Get Turnitin report error:", error);
      res.status(500).json({ message: "Failed to get Turnitin report" });
    }
  });

  // New endpoint for PDF similarity report download
  app.get("/api/turnitin/pdf/:fileId", requireAuth, async (req, res) => {
    try {
      const { fileId } = req.params;

      // Get submission file
      const file = await storage.getSubmissionFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      if (!file.turnitinSubmissionId) {
        return res
          .status(400)
          .json({ message: "No Turnitin submission found for this file" });
      }

      if (file.turnitinStatus !== "complete") {
        return res.status(400).json({
          message: "Turnitin processing not complete yet",
          status: file.turnitinStatus,
        });
      }

      if (file.turnitinPdfStatus !== "complete" || !file.turnitinPdfUrl) {
        return res.status(400).json({
          message: "PDF report not ready yet",
          pdfStatus: file.turnitinPdfStatus || "pending",
        });
      }

      // Get the PDF from Azure Blob Storage and stream it
      const azureBlobService =
        require("./services/azureBlobService").azureBlobService;
      const pdfFileName = `turnitin-report-${fileId}-*.pdf`;
      const pdfBlobName = `turnitin-reports/turnitin-report-${fileId}-*.pdf`;

      try {
        // Find the PDF blob by pattern
        const blobs = await azureBlobService.listBlobs("turnitin-reports/");
        const pdfBlob = blobs.find((blob: any) =>
          blob.name.includes(`turnitin-report-${fileId}`),
        );

        if (!pdfBlob) {
          return res.status(404).json({ message: "PDF report file not found" });
        }

        // Get the PDF buffer from Azure
        const pdfBuffer = await azureBlobService.downloadBuffer(pdfBlob.name);

        // Set appropriate headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="turnitin-similarity-report-${fileId}.pdf"`,
        );
        res.setHeader("Content-Length", pdfBuffer.length.toString());

        // Send the PDF
        res.send(pdfBuffer);
      } catch (blobError) {
        console.error("Error retrieving PDF from blob storage:", blobError);
        return res
          .status(500)
          .json({ message: "Failed to retrieve PDF report" });
      }
    } catch (error) {
      console.error("Get Turnitin PDF error:", error);
      res.status(500).json({ message: "Failed to get Turnitin PDF report" });
    }
  });

  // Helper function to submit a single file to TurnItIn

  async function submitFileToTurnitin(
    file: any,
    submission: any,
    sessionRecord: any,
  ): Promise<void> {
    if (file.submissionFileType === 'feedback') {
      console.log(`⏭️ Skipping TurnItIn submission for marker feedback file: ${file.fileName}`);
      return;
    }
    // Queue the file for background Turnitin processing via job processor
    const jobId = await jobProcessor.addTurnitinJob(
      file.id, // submissionFileId
      submission.id, // submissionId
      file.fileName, // fileName
      file.fileUrl, // fileUrl
      sessionRecord.email, // submitterEmail
      sessionRecord.lmsUserId, // submitterId
      sessionRecord.customAssessmentCode, // assignmentId
      sessionRecord.contextId, // courseId
    );

    console.log(`📋 Queued Turnitin job: ${jobId} for file: ${file.fileName}`);
    console.log(`✅ TurnItIn job queued for processing: ${file.fileName}`);
  }

  app.get(
    "/api/submission/:submissionId/turnitin",
    requireAuth,
    async (req, res) => {
      try {
        const { submissionId } = req.params;

        // Get all files for this submission with their Turnitin status
        const files = await storage.getSubmissionFiles(submissionId);

        const turnitinData = files.map((file) => ({
          fileId: file.id,
          fileName: file.fileName,
          turnitinStatus: file.turnitinStatus || "pending",
          turnitinSubmissionId: file.turnitinSubmissionId,
          turnitinSimilarityScore: file.turnitinSimilarityScore,

          turnitinProcessedAt: file.turnitinProcessedAt,
          turnitinErrorMessage: file.turnitinErrorMessage,
        }));

        res.json(turnitinData);
      } catch (error) {
        console.error("Get submission Turnitin data error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Test endpoint to manually add job to queue (for testing)
  app.post("/api/test-add-job", async (req, res) => {
    try {
      const {
        submissionFileId,
        submissionId,
        fileName,
        fileUrl,
        submitterEmail,
        submitterId,
        assignmentId,
        courseId,
      } = req.body;

      const jobId = await jobProcessor.addTurnitinJob(
        submissionFileId,
        submissionId,
        fileName,
        fileUrl,
        submitterEmail,
        submitterId,
        assignmentId,
        courseId,
      );

      console.log(`📋 Test job added: ${jobId}`);
      res.json({ success: true, jobId });
    } catch (error) {
      console.error("Test add job error:", error);
      res.status(500).json({ message: "Failed to add test job" });
    }
  });

  // Test endpoint to check job status (for testing)
  app.get("/api/test-job-status", async (req, res) => {
    try {
      const jobCount = jobProcessor.getJobCount();
      const activeJobs = jobProcessor.getActiveJobs();

      res.json({
        success: true,
        jobCount,
        activeJobs: activeJobs.map((job: any) => ({
          id: job.id,
          status: job.status,
          attempts: job.attempts,
          fileName: job.fileName,
          submissionFileId: job.submissionFileId,
          turnitinSubmissionId: job.turnitinSubmissionId,
          nextAttempt: job.nextAttempt,
        })),
      });
    } catch (error) {
      console.error("Test job status error:", error);
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  // SMTP connection test endpoint
  app.post(
    "/api/test-smtp",
    requireAuth,
    requireRole("admin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const settings = await storage.getAllSystemSettings();
        const success = await emailService.testConnection(settings);

        if (success) {
          res.json({ success: true, message: "SMTP connection successful" });
        } else {
          res
            .status(400)
            .json({ success: false, message: "SMTP connection failed" });
        }
      } catch (error) {
        console.error("SMTP test error:", error);
        res.status(500).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "SMTP connection test failed",
        });
      }
    },
  );

  // Azure Blob Storage SAS URL generation endpoint
  app.get("/api/azure/sas-url/:blobName", requireAuth, async (req, res) => {
    try {
      const { blobName } = req.params;
      const { expiryMinutes = 60 } = req.query;

      if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
        return res.status(503).json({
          success: false,
          message: "Azure Blob Storage not configured",
        });
      }

      const azureService = getAzureBlobService();
      const sasUrl = await azureService.getSasUrl(
        blobName,
        Number(expiryMinutes),
      );

      res.json({
        success: true,
        sasUrl,
        expiryMinutes: Number(expiryMinutes),
      });
    } catch (error) {
      console.error("SAS URL generation error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate SAS URL",
      });
    }
  });

  // Test Azure Blob Storage connection endpoint
  app.get(
    "/api/azure/test-connection",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
          return res.status(400).json({
            success: false,
            message:
              "AZURE_STORAGE_CONNECTION_STRING environment variable not configured",
          });
        }

        const azureService = getAzureBlobService();

        // Test by listing files in the LTI_Uploads directory
        const files = await azureService.listFiles("LTI_Uploads/");

        res.json({
          success: true,
          message: "Azure Blob Storage connection successful",
          containerName: "rogoreplacement",
          filesFound: files.length,
          sasTokenConfigured: !!process.env.AZURE_SAS_TOKEN,
        });
      } catch (error) {
        console.error("Azure connection test error:", error);
        res.status(500).json({
          success: false,
          message: `Azure connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    },
  );

  // Course Management API Routes

  // Course Nodes (Hierarchical Structure)
  app.get(
    "/api/course-nodes",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const nodes = await storage.getAllCourseNodes();
        res.json(nodes);
      } catch (error) {
        console.error("Get course nodes error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/course-nodes/root",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const rootNodes = await storage.getRootCourseNodes();
        res.json(rootNodes);
      } catch (error) {
        console.error("Get root course nodes error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/course-nodes/:id/children",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const children = await storage.getCourseNodeChildren(id);
        res.json(children);
      } catch (error) {
        console.error("Get course node children error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/course-nodes",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const validatedData = insertCourseNodeSchema.parse(req.body);
        const node = await storage.createCourseNode(validatedData);
        res.json(node);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Create course node error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/course-nodes/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const validatedData = insertCourseNodeSchema.partial().parse(req.body);
        const node = await storage.updateCourseNode(id, validatedData);
        res.json(node);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Update course node error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/course-nodes/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteCourseNode(id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete course node error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/course-nodes/:id/duplicate",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const duplicatedNode = await storage.duplicateCourseNode(id);
        res.json(duplicatedNode);
      } catch (error) {
        console.error("Duplicate course node error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Move course node
  app.put(
    "/api/course-nodes/:id/move",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { parentId } = req.body;

        // Validate that the new parent exists (if provided)
        if (parentId) {
          const parentExists = await storage.getCourseNode(parentId);
          if (!parentExists) {
            return res
              .status(400)
              .json({ message: "Parent node does not exist" });
          }
        }

        const updatedNode = await storage.updateCourseNode(id, { parentId });
        res.json(updatedNode);
      } catch (error) {
        console.error("Move course node error:", error);
        if (error instanceof Error && error.message.includes("not found")) {
          res.status(404).json({ message: "Course node not found" });
        } else if (
          error instanceof Error &&
          error.message.includes("circular")
        ) {
          res.status(400).json({ message: "Cannot create circular reference" });
        } else {
          res.status(500).json({ message: "Failed to move course node" });
        }
      }
    },
  );

  // Assessments
  app.get(
    "/api/assessments",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const assessments = await storage.getAllAssessments();
        res.json(assessments);
      } catch (error) {
        console.error("Get assessments error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/assessments/course-node/:courseNodeId",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { courseNodeId } = req.params;
        const assessments =
          await storage.getAssessmentsByCourseNode(courseNodeId);
        res.json(assessments);
      } catch (error) {
        console.error("Get assessments by course node error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/assessments",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const validatedData = insertAssessmentSchema.parse(req.body);

        // Additional server-side validation
        if (
          !validatedData.courseNodeId ||
          validatedData.courseNodeId.trim() === ""
        ) {
          return res
            .status(400)
            .json({ message: "Folder selection is required" });
        }

        if (!validatedData.code || validatedData.code.trim() === "") {
          return res
            .status(400)
            .json({ message: "Assessment code is required" });
        }

        if (!validatedData.name || validatedData.name.trim() === "") {
          return res
            .status(400)
            .json({ message: "Assessment name is required" });
        }

        // Check for duplicate assessment code
        const existingCodeAssessment = await storage.getAssessmentByCode(validatedData.code);
        if (existingCodeAssessment) {
          return res
            .status(400)
            .json({
              message: "Assessment code already exists. Please choose a different code.",
            });
        }

        // Check for duplicate assessment name (case-insensitive)
        const existingNameAssessment = await db
          .select()
          .from(assessments)
          .where(sql`LOWER(${assessments.name}) = LOWER(${validatedData.name})`)
          .limit(1);

        if (existingNameAssessment.length > 0) {
          return res
            .status(400)
            .json({
              message: "Assessment name already exists. Please choose a different name.",
            });
        }

        const assessment = await storage.createAssessment(validatedData);
        res.json(assessment);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }

        // Handle foreign key constraint violations
        if ((error as any).code === "23503") {
          if ((error as any).constraint === "assessments_course_node_id_fkey") {
            return res
              .status(400)
              .json({ message: "Selected folder does not exist" });
          }
          if (
            (error as any).constraint === "assessments_instruction_set_id_fkey"
          ) {
            return res
              .status(400)
              .json({ message: "Selected instruction set does not exist" });
          }
        }

        // Handle unique constraint violations
        if ((error as any).code === "23505") {
          if ((error as any).constraint?.includes("code")) {
            return res
              .status(400)
              .json({
                message:
                  "Assessment code already exists. Please choose a different code.",
              });
          }
          if ((error as any).constraint?.includes("assessment_id")) {
            return res
              .status(400)
              .json({
                message: "Assessment ID already exists. Please try again.",
              });
          }
        }

        console.error("Create assessment error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/assessments/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const validatedData = insertAssessmentSchema.partial().parse(req.body);

        // Check for duplicate assessment code (excluding current assessment)
        if (validatedData.code) {
          const existingCodeAssessment = await storage.getAssessmentByCode(validatedData.code);
          if (existingCodeAssessment && existingCodeAssessment.id !== id) {
            return res
              .status(400)
              .json({
                message: "Assessment code already exists. Please choose a different code.",
              });
          }
        }

        // Check for duplicate assessment name (excluding current assessment)
        if (validatedData.name) {
          const existingNameAssessment = await db
            .select()
            .from(assessments)
            .where(sql`LOWER(${assessments.name}) = LOWER(${validatedData.name})`)
            .limit(1);

          if (existingNameAssessment.length > 0 && existingNameAssessment[0].id !== id) {
            return res
              .status(400)
              .json({
                message: "Assessment name already exists. Please choose a different name.",
              });
          }
        }

        const assessment = await storage.updateAssessment(id, validatedData);
        res.json(assessment);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }

        // Handle foreign key constraint violations
        if ((error as any).code === "23503") {
          if ((error as any).constraint === "assessments_course_node_id_fkey") {
            return res
              .status(400)
              .json({ message: "Selected folder does not exist" });
          }
          if (
            (error as any).constraint === "assessments_instruction_set_id_fkey"
          ) {
            return res
              .status(400)
              .json({ message: "Selected instruction set does not exist" });
          }
        }

        // Handle unique constraint violations
        if ((error as any).code === "23505") {
          if ((error as any).constraint?.includes("code")) {
            return res
              .status(400)
              .json({
                message:
                  "Assessment code already exists. Please choose a different code.",
              });
          }
          if ((error as any).constraint?.includes("assessment_id")) {
            return res
              .status(400)
              .json({
                message: "Assessment ID already exists. Please try again.",
              });
          }
        }

        console.error("Update assessment error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/assessments/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteAssessment(id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete assessment error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Move assessment
  app.put(
    "/api/assessments/:id/move",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { courseNodeId } = req.body;

        // Validate that the target node exists
        if (courseNodeId) {
          const nodeExists = await storage.getCourseNode(courseNodeId);
          if (!nodeExists) {
            return res
              .status(400)
              .json({ message: "Target folder does not exist" });
          }
        }

        const updatedAssessment = await storage.updateAssessment(id, {
          courseNodeId,
        });
        res.json(updatedAssessment);
      } catch (error) {
        console.error("Move assessment error:", error);
        if (error instanceof Error && error.message.includes("not found")) {
          res.status(404).json({ message: "Assessment not found" });
        } else {
          res.status(500).json({ message: "Failed to move assessment" });
        }
      }
    },
  );

  // Clone assessment
  app.post(
    "/api/assessments/:id/clone",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const clonedAssessment = await storage.cloneAssessment(id);
        res.json(clonedAssessment);
      } catch (error) {
        console.error("Clone assessment error:", error);
        if (error instanceof Error && error.message.includes("not found")) {
          res.status(404).json({ message: "Assessment not found" });
        } else {
          res.status(500).json({ message: "Failed to clone assessment" });
        }
      }
    },
  );

  // Assessment Sections
  app.get(
    "/api/assessments/:assessmentId/sections",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;
        const sections = await storage.getAssessmentSections(assessmentId);
        res.json(sections);
      } catch (error) {
        console.error("Get assessment sections error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/assessments/:assessmentId/sections",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;
        const validatedData = insertAssessmentSectionSchema.parse({
          ...req.body,
          assessmentId,
        });
        const section = await storage.createAssessmentSection(validatedData);
        res.json(section);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Create assessment section error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/assessments/sections/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const validatedData = insertAssessmentSectionSchema
          .partial()
          .parse(req.body);
        const section = await storage.updateAssessmentSection(
          id,
          validatedData,
        );
        res.json(section);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Update assessment section error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/assessments/sections/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteAssessmentSection(id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete assessment section error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/assessments/sections/:id/clone",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const clonedSection = await storage.cloneAssessmentSection(id);
        res.json(clonedSection);
      } catch (error) {
        console.error("Clone assessment section error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/assessments/:assessmentId/sections/reorder",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;
        const { sectionIds } = req.body;

        if (!Array.isArray(sectionIds)) {
          return res
            .status(400)
            .json({ message: "sectionIds must be an array" });
        }

        await storage.reorderAssessmentSections(assessmentId, sectionIds);
        res.json({ success: true });
      } catch (error) {
        console.error("Reorder assessment sections error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Section Marking Options
  app.get(
    "/api/sections/:sectionId/marking-options",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { sectionId } = req.params;
        const options = await storage.getSectionMarkingOptions(sectionId);
        res.json(options);
      } catch (error) {
        console.error("Get section marking options error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/sections/:sectionId/marking-options",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { sectionId } = req.params;
        const validatedData = insertSectionMarkingOptionSchema.parse({
          ...req.body,
          sectionId,
        });

        // Check for duplicate marks
        const existingOptions = await storage.getSectionMarkingOptions(sectionId);
        if (existingOptions.some(option => option.marks === validatedData.marks)) {
          return res.status(400).json({ message: "Duplicate marks are not allowed within the same question" });
        }

        const option = await storage.createSectionMarkingOption(validatedData);

        res.status(201).json(option);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Create section marking option error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/sections/:sectionId/marking-options/bulk",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { sectionId } = req.params;
        const optionsData = req.body;

        if (!Array.isArray(optionsData)) {
          return res.status(400).json({ message: "Data must be an array of marking options" });
        }

        const existingOptions = await storage.getSectionMarkingOptions(sectionId);

        // Collect all existing marks and new marks to check for duplicates
        const existingMarks = new Set(existingOptions.map(option => option.marks));
        const newMarks = new Set();

        const createdOptions = [];

        for (const optionData of optionsData) {
          const validatedData = insertSectionMarkingOptionSchema.parse({
            ...optionData,
            sectionId,
          });

          if (existingMarks.has(validatedData.marks) || newMarks.has(validatedData.marks)) {
            return res.status(400).json({ message: "Duplicate marks are not allowed within the same question" });
          }

          newMarks.add(validatedData.marks);

          const option = await storage.createSectionMarkingOption(validatedData);
          createdOptions.push(option);
        }

        // Get the assessment ID for this section to update grade boundary total marks
        const section = await storage.getAssessmentSection(sectionId);
        if (section && section.assessmentId) {
          await storage.updateAssessmentTotalMarks(section.assessmentId);
        }

        res.status(201).json(createdOptions);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Create section marking options error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/sections/marking-options/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Get the existing option to find the section and assessment
        const existingOption = await storage.getSectionMarkingOptionById(id);

        const validatedData = insertSectionMarkingOptionSchema
          .partial()
          .parse(req.body);
        const option = await storage.updateSectionMarkingOption(
          id,
          validatedData,
        );

        // Update grade boundary total marks if we have the section info
        if (existingOption && existingOption.sectionId) {
          const section = await storage.getAssessmentSection(
            existingOption.sectionId,
          );
          if (section && section.assessmentId) {
            await storage.updateAssessmentTotalMarks(section.assessmentId);
          }
        }

        res.json(option);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Update section marking option error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/sections/marking-options/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Get the existing option to find the section and assessment before deletion
        const existingOption = await storage.getSectionMarkingOptionById(id);

        await storage.deleteSectionMarkingOption(id);

        // Update grade boundary total marks if we have the section info
        if (existingOption && existingOption.sectionId) {
          const section = await storage.getAssessmentSection(
            existingOption.sectionId,
          );
          if (section && section.assessmentId) {
            await storage.updateAssessmentTotalMarks(section.assessmentId);
          }
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Delete section marking option error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/sections/:sectionId/marking-options/reorder",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { sectionId } = req.params;
        const { optionIds } = req.body;

        if (!Array.isArray(optionIds)) {
          return res
            .status(400)
            .json({ message: "optionIds must be an array" });
        }

        await storage.reorderSectionMarkingOptions(sectionId, optionIds);
        res.json({ success: true });
      } catch (error) {
        console.error("Reorder section marking options error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Helper function to check for overlapping grade boundary ranges
  const checkGradeBoundaryOverlap = (
    newMarksFrom: number,
    newMarksTo: number,
    existingBoundaries: any[],
    excludeId?: string
  ): { hasOverlap: boolean; conflictingBoundary?: any } => {
    for (const boundary of existingBoundaries) {
      // Skip the boundary being updated
      if (excludeId && boundary.id === excludeId) {
        continue;
      }
      
      // Check if ranges overlap: [newMarksFrom, newMarksTo] and [boundary.marksFrom, boundary.marksTo]
      // Ranges overlap if: newMarksFrom <= boundary.marksTo && boundary.marksFrom <= newMarksTo
      if (newMarksFrom <= boundary.marksTo && boundary.marksFrom <= newMarksTo) {
        return { hasOverlap: true, conflictingBoundary: boundary };
      }
    }
    return { hasOverlap: false };
  };

  // Assessment Grade Boundaries
  app.get(
    "/api/assessments/:assessmentId/grade-boundaries",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;
        const boundaries =
          await storage.getAssessmentGradeBoundaries(assessmentId);
        res.json(boundaries);
      } catch (error) {
        console.error("Get assessment grade boundaries error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/assessments/:assessmentId/grade-boundaries",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;

        const validatedData = insertAssessmentGradeBoundarySchema.parse({
          ...req.body,
          assessmentId,
        });

        // Check for overlapping grade boundaries
        const existingBoundaries = await storage.getAssessmentGradeBoundaries(assessmentId);
        const overlapCheck = checkGradeBoundaryOverlap(
          validatedData.marksFrom,
          validatedData.marksTo,
          existingBoundaries
        );

        if (overlapCheck.hasOverlap) {
          return res.status(400).json({ 
            message: `Grade boundary range ${validatedData.marksFrom}-${validatedData.marksTo} overlaps with existing boundary "${overlapCheck.conflictingBoundary.gradeLabel}" (${overlapCheck.conflictingBoundary.marksFrom}-${overlapCheck.conflictingBoundary.marksTo})` 
          });
        }

        const boundary =
          await storage.createAssessmentGradeBoundary(validatedData);

        // Update assessment total marks after creating grade boundary
        await storage.updateAssessmentTotalMarks(assessmentId);

        res.json(boundary);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Create assessment grade boundary error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/assessments/grade-boundaries/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;

        // Get the boundary to find the assessment ID
        const existingBoundary = await db
          .select()
          .from(assessmentGradeBoundaries)
          .where(eq(assessmentGradeBoundaries.id, id))
          .limit(1);

        if (existingBoundary.length === 0) {
          return res.status(404).json({ message: "Grade boundary not found" });
        }

        const validatedData = insertAssessmentGradeBoundarySchema
          .partial()
          .parse(req.body);

        // Check for overlapping grade boundaries if marks are being updated
        if (validatedData.marksFrom !== undefined || validatedData.marksTo !== undefined) {
          const assessmentId = existingBoundary[0].assessmentId;
          const allBoundaries = await storage.getAssessmentGradeBoundaries(assessmentId);
          
          // Use existing values if not provided in update
          const newMarksFrom = validatedData.marksFrom ?? existingBoundary[0].marksFrom;
          const newMarksTo = validatedData.marksTo ?? existingBoundary[0].marksTo;

          const overlapCheck = checkGradeBoundaryOverlap(
            newMarksFrom,
            newMarksTo,
            allBoundaries,
            id // exclude the current boundary being updated
          );

          if (overlapCheck.hasOverlap) {
            return res.status(400).json({ 
              message: `Grade boundary range ${newMarksFrom}-${newMarksTo} would overlap with existing boundary "${overlapCheck.conflictingBoundary.gradeLabel}" (${overlapCheck.conflictingBoundary.marksFrom}-${overlapCheck.conflictingBoundary.marksTo})` 
            });
          }
        }

        const boundary = await storage.updateAssessmentGradeBoundary(
          id,
          validatedData,
        );

        // Update assessment total marks after updating grade boundary
        await storage.updateAssessmentTotalMarks(
          existingBoundary[0].assessmentId,
        );

        res.json(boundary);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid data", errors: error.errors });
        }
        console.error("Update assessment grade boundary error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/assessments/grade-boundaries/:id",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { id } = req.params;
        await storage.deleteAssessmentGradeBoundary(id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete assessment grade boundary error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/assessments/:assessmentId/grade-boundaries/reorder",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;
        const { boundaryIds } = req.body;

        if (!Array.isArray(boundaryIds)) {
          return res
            .status(400)
            .json({ message: "boundaryIds must be an array" });
        }

        await storage.reorderAssessmentGradeBoundaries(
          assessmentId,
          boundaryIds,
        );
        res.json({ success: true });
      } catch (error) {
        console.error("Reorder assessment grade boundaries error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/assessments/:assessmentId/recalculate-total-marks",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      try {
        const { assessmentId } = req.params;
        await storage.updateAssessmentTotalMarks(assessmentId);
        res.json({ success: true });
      } catch (error) {
        console.error("Recalculate total marks error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Marking assignment routes
  app.get("/api/marking/assignments", requireAuth, async (req: any, res) => {
    try {
      const { status, limit = "20", cursor } = req.query;

      // Check user role for access control
      const userRole = req.user.role;
      let filters: any = {
        limit: parseInt(limit as string),
      };

      if (status) {
        filters.status = status as MarkingStatus;
      }

      if (cursor) {
        filters.cursor = cursor as string;
      }

      // Role-based filtering
      if (userRole !== "superadmin" && userRole !== "admin") {
        // Non-admin users can only see their own assignments
        filters.markerId = req.user.id;
      }

      const result = await storage.getAllMarkingAssignments(filters);

      res.json({
        assignments: result.assignments,
        nextCursor: result.nextCursor,
      });
    } catch (error) {
      console.error("Get marking assignments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/marking/assignments/offset", requireAuth, async (req: any, res) => {
    try {
      const { status, limit = "20", page = "1" } = req.query;

      // Check user role for access control
      const userRole = req.user.role;
      let filters: any = {
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
      };

      if (status) {
        filters.status = status as MarkingStatus;
      }

      // Role-based filtering
      if (userRole !== "superadmin" && userRole !== "admin") {
        // Non-admin users can only see their own assignments
        filters.markerId = req.user.id;
      }

      const result = await storage.getAllMarkingAssignmentsWithOffset(filters);

      res.json({
        assignments: result.assignments,
        pagination: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          limit: filters.limit,
        },
      });
    } catch (error) {
      console.error("Get marking assignments with offset error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/marking/assignments/my", requireAuth, async (req: any, res) => {
    try {
      const { status } = req.query;
      const markerId = req.user.id;

      const assignments = await storage.getMarkingAssignmentsForMarker(
        markerId,
        status as MarkingStatus,
      );

      res.json(assignments);
    } catch (error) {
      console.error("Get my marking assignments error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/marking/assignments",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { insertSubmissionMarkingAssignmentSchema } = await import(
          "@shared/schema"
        );
        const assignmentData = insertSubmissionMarkingAssignmentSchema.parse(
          req.body,
        );

        // Set status updated by to current user
        assignmentData.statusUpdatedBy = req.user.id;

        const assignment =
          await storage.createMarkingAssignment(assignmentData);

        res.status(201).json(assignment);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Invalid assignment data", errors: error.errors });
        }
        console.error("Create marking assignment error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/marking/assignments/:submissionId/status",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;
        const { status, notes } = req.body;

        // Validate status
        const validStatuses = [
          "waiting",
          "being_marked",
          "on_hold",
          "approval_needed",
          "marking_skipped",
        ];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }

        // Check if user has permission to update this assignment
        const existingAssignment =
          await storage.getMarkingAssignment(submissionId);
        if (!existingAssignment) {
          return res
            .status(404)
            .json({ message: "Marking assignment not found" });
        }

        const userRole = req.user.role;
        const userId = req.user.id;

        // Only admins/superadmins or the assigned marker can update status
        if (
          userRole !== "superadmin" &&
          userRole !== "admin" &&
          existingAssignment.assignedMarkerId !== userId
        ) {
          return res
            .status(403)
            .json({
              message: "You don't have permission to update this assignment",
            });
        }

        const updatedAssignment = await storage.updateMarkingAssignmentStatus(
          submissionId,
          status as MarkingStatus,
          userId,
          notes,
        );

        res.json(updatedAssignment);
      } catch (error) {
        console.error("Update marking assignment status error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    "/api/marking/assignments/:submissionId/assign",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;
        const { markerId } = req.body;

        if (!markerId) {
          return res.status(400).json({ message: "markerId is required" });
        }

        // Verify the marker exists and has appropriate role
        const marker = await storage.getUser(markerId);
        if (!marker) {
          return res.status(404).json({ message: "Marker not found" });
        }

        // Only allow users with "marker" or "admin" role to be assigned as markers
        if (marker.role !== "marker" && marker.role !== "admin") {
          return res
            .status(400)
            .json({
              message: "Only users with 'marker' or 'admin' role can be assigned as markers",
            });
        }

        const assignment = await storage.assignMarkerToSubmission(
          submissionId,
          markerId,
          req.user.id,
        );

        res.json(assignment);
      } catch (error) {
        console.error("Assign marker error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Unassign marker from submission
  app.delete(
    "/api/marking/assignments/:submissionId/unassign",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;

        // Check if submission exists
        const submission = await storage.getSubmission(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        // Unassign the marker
        const assignment = await storage.unassignMarkerFromSubmission(
          submissionId,
          req.user.id,
        );

        res.json({ 
          success: true, 
          message: "Marker unassigned successfully",
          assignment 
        });
      } catch (error) {
        console.error("Unassign marker error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Bulk assign marker to multiple submissions
  app.put(
    "/api/marking/assignments/bulk-assign",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { submissionIds, markerId } = req.body;

        if (!markerId) {
          return res.status(400).json({ message: "markerId is required" });
        }

        if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
          return res.status(400).json({ message: "submissionIds array is required and must not be empty" });
        }

        // Verify the marker exists and has appropriate role
        const marker = await storage.getUser(markerId);
        if (!marker) {
          return res.status(404).json({ message: "Marker not found" });
        }

        // Only allow users with "marker" or "admin" role to be assigned as markers
        if (marker.role !== "marker" && marker.role !== "admin") {
          return res
            .status(400)
            .json({
              message: "Only users with 'marker' or 'admin' role can be assigned as markers",
            });
        }

        // Assign marker to each submission
        const assignments = [];
        let assignedCount = 0;
        let failedCount = 0;

        for (const submissionId of submissionIds) {
          try {
            const assignment = await storage.assignMarkerToSubmission(
              submissionId,
              markerId,
              req.user.id,
            );
            assignments.push(assignment);
            assignedCount++;
          } catch (error) {
            console.error(`Failed to assign marker to submission ${submissionId}:`, error);
            failedCount++;
          }
        }

        res.json({
          assignments,
          assignedCount,
          failedCount,
          totalRequested: submissionIds.length
        });
      } catch (error) {
        console.error("Bulk assign marker error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Bulk unassign marker from multiple submissions
  app.delete(
    "/api/marking/assignments/bulk-unassign",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { submissionIds } = req.body;

        if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
          return res.status(400).json({ message: "submissionIds array is required and must not be empty" });
        }

        // Unassign marker from each submission
        const assignments = [];
        let unassignedCount = 0;
        let failedCount = 0;

        for (const submissionId of submissionIds) {
          try {
            const assignment = await storage.unassignMarkerFromSubmission(
              submissionId,
              req.user.id,
            );
            assignments.push(assignment);
            unassignedCount++;
          } catch (error) {
            console.error(`Failed to unassign marker from submission ${submissionId}:`, error);
            failedCount++;
          }
        }

        res.json({
          assignments,
          unassignedCount,
          failedCount,
          totalRequested: submissionIds.length
        });
      } catch (error) {
        console.error("Bulk unassign marker error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Bulk approve submissions (change status from approval_needed to released)
  app.put(
    "/api/marking/assignments/bulk-approve",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { submissionIds } = req.body;

        if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
          return res.status(400).json({ message: "submissionIds array is required and must not be empty" });
        }

        // Approve each submission by changing status to "released"
        const assignments = [];
        let approvedCount = 0;
        let failedCount = 0;
        let invalidStatusCount = 0;

        for (const submissionId of submissionIds) {
          try {
            // First check if submission is in "approval_needed" status
            const currentAssignment = await storage.getMarkingAssignment(submissionId);
            
            if (!currentAssignment) {
              console.error(`Marking assignment not found for submission ${submissionId}`);
              failedCount++;
              continue;
            }

            // Only approve if status is "approval_needed"
            if (currentAssignment.markingStatus !== "approval_needed") {
              console.warn(`Submission ${submissionId} has status ${currentAssignment.markingStatus}, not approval_needed`);
              invalidStatusCount++;
              continue;
            }

            // Update status to "released"
            const assignment = await storage.updateMarkingAssignmentStatus(
              submissionId,
              "released",
              req.user.id
            );
            assignments.push(assignment);
            approvedCount++;
          } catch (error) {
            console.error(`Failed to approve submission ${submissionId}:`, error);
            failedCount++;
          }
        }

        res.json({
          assignments,
          approvedCount,
          failedCount,
          invalidStatusCount,
          totalRequested: submissionIds.length,
          message: `${approvedCount} submission(s) approved successfully${invalidStatusCount > 0 ? `, ${invalidStatusCount} submission(s) were not in approval_needed status` : ''}`
        });
      } catch (error) {
        console.error("Bulk approve submissions error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Export released submissions as CSV
  app.get(
    "/api/marking/assignments/export-released",
    requireAuth,
    requireRole("admin"),
    async (req: any, res) => {
      try {
        const { Parser } = await import('json2csv');
        
        // Fetch all released submissions with necessary joins
        const releasedSubmissions = await db
          .select({
            firstName: assignmentSubmissions.firstName,
            lastName: assignmentSubmissions.lastName,
            email: assignmentSubmissions.email,
            course: assignmentSubmissions.contextTitle,
            exercise: assignmentSubmissions.customAssessmentCode,
            dateSubmitted: assignmentSubmissions.submittedAt,
            dateAllocated: submissionMarkingAssignments.assignedAt,
            dateApproved: submissionMarkingAssignments.statusUpdatedAt,
            marksAvailable: submissionGrades.totalMarksPossible,
            marksAchieved: submissionGrades.totalMarksAwarded,
            grade: submissionGrades.finalGrade,
            markerFirstName: users.firstName,
            markerLastName: users.lastName,
          })
          .from(submissionMarkingAssignments)
          .innerJoin(
            assignmentSubmissions,
            eq(submissionMarkingAssignments.submissionId, assignmentSubmissions.id)
          )
          .leftJoin(
            submissionGrades,
            eq(submissionGrades.submissionId, assignmentSubmissions.id)
          )
          .leftJoin(
            users,
            eq(submissionMarkingAssignments.assignedMarkerId, users.id)
          )
          .where(eq(submissionMarkingAssignments.markingStatus, 'released'));

        // Transform data for CSV
        const csvData = releasedSubmissions.map(row => ({
          'First Name': row.firstName || '',
          'Last Name': row.lastName || '',
          'Email': row.email || '',
          'Course': row.course || '',
          'Exercise': row.exercise || '',
          'Date Submitted': row.dateSubmitted ? format(new Date(row.dateSubmitted), 'yyyy-MM-dd HH:mm:ss') : '',
          'Date Allocated': row.dateAllocated ? format(new Date(row.dateAllocated), 'yyyy-MM-dd HH:mm:ss') : '',
          'Date Approved': row.dateApproved ? format(new Date(row.dateApproved), 'yyyy-MM-dd HH:mm:ss') : '',
          'Marks Available': row.marksAvailable || 0,
          'Marks Achieved': row.marksAchieved || 0,
          'Grade': row.grade || '',
          'Marker': row.markerFirstName && row.markerLastName 
            ? `${row.markerFirstName} ${row.markerLastName}` 
            : row.markerFirstName || row.markerLastName || '',
        }));

        // Generate CSV
        const parser = new Parser();
        const csv = parser.parse(csvData);

        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=released-submissions-${format(new Date(), 'yyyy-MM-dd')}.csv`);
        res.send(csv);
      } catch (error) {
        console.error("Export released submissions error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Get submission details with files
  app.get(
    "/api/submissions/:submissionId/details",
    requireAuth,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;

        // Check if user has permission to view this submission
        const userRole = req.user.role;
        const userId = req.user.id;

        // Get submission with files
        const { submission, files } =
          await storage.getSubmissionWithFiles(submissionId);

        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        // Role-based access control
        if (userRole !== "superadmin" && userRole !== "admin") {
          // Check if user is assigned to mark this submission
          const markingAssignment =
            await storage.getMarkingAssignment(submissionId);
          if (
            !markingAssignment ||
            markingAssignment.assignedMarkerId !== userId
          ) {
            return res
              .status(403)
              .json({
                message: "You don't have permission to view this submission",
              });
          }
        }

        // Get marking assignment info
        const markingAssignment = await storage.getMarkingAssignment(submissionId);
        
        // Get assigned marker details if exists
        let assignedMarker = null;
        if (markingAssignment?.assignedMarkerId) {
          assignedMarker = await storage.getUser(markingAssignment.assignedMarkerId);
        }

        // Get assessment data based on the custom assessment code
        let assessment = null;
        let assessmentSections: any[] = [];
        let gradeBoundaries: any[] = [];
        let existingGrade = null;
        let existingSectionMarks: any[] = [];

        if (submission.customAssessmentCode) {
          assessment = await storage.getAssessmentByCode(
            submission.customAssessmentCode,
          );
          if (assessment) {
            assessmentSections = await storage.getAssessmentSections(
              assessment.id,
            );
            // Get marking options for each section
            for (const section of assessmentSections) {
              (section as any).markingOptions =
                await storage.getSectionMarkingOptions(section.id);
            }

            // Get grade boundaries for the assessment
            gradeBoundaries = await storage.getAssessmentGradeBoundaries(assessment.id);

            // Get existing marking data if any
            existingGrade = await storage.getSubmissionGrade(submissionId);
            existingSectionMarks =
              await storage.getSubmissionSectionMarks(submissionId);
          }
        }

        res.json({
          submission,
          files: files.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            originalFileName: file.originalFileName,
            fileSize: file.fileSize,
            fileType: file.fileType,
            uploadOrder: file.uploadOrder,
            uploadedAt: file.uploadedAt,
            turnitinStatus: file.turnitinStatus,
            turnitinSimilarityScore: file.turnitinSimilarityScore,
            turnitinReportUrl: file.turnitinReportUrl,
            submissionFileType: file.submissionFileType,
            uploadedBy: file.uploadedBy,
          })),
          markingAssignment: markingAssignment ? {
            markingStatus: markingAssignment.markingStatus,
            holdReason: markingAssignment.holdReason,
            assignedMarkerId: markingAssignment.assignedMarkerId,
          } : null,
          assignedMarker: assignedMarker ? {
            id: assignedMarker.id,
            firstName: assignedMarker.firstName,
            lastName: assignedMarker.lastName,
            email: assignedMarker.email,
          } : null,
          assessment,
          assessmentSections,
          gradeBoundaries,
          existingGrade,
          existingSectionMarks,
        });
      } catch (error) {
        console.error("Get submission details error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Get previous attempts for submission
  app.get(
    "/api/submissions/:submissionId/previous-attempts",
    requireAuth,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;

        // Check if user has permission to view this submission
        const userRole = req.user.role;
        const userId = req.user.id;

        // Get submission to check access
        const submission = await storage.getSubmission(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        // Role-based access control
        if (userRole !== "superadmin" && userRole !== "admin") {
          // Check if user is assigned to mark this submission
          const markingAssignment = await storage.getMarkingAssignment(submissionId);
          if (!markingAssignment || markingAssignment.assignedMarkerId !== userId) {
            return res.status(403).json({ 
              message: "You don't have permission to view this submission" 
            });
          }
        }

        // Get previous attempts
        const previousAttempts = await storage.getPreviousAttemptsForSubmission(submissionId);

        res.json({ attempts: previousAttempts });
      } catch (error) {
        console.error("Get previous attempts error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Combined endpoint: Get submission details with previous attempts
  app.get(
    "/api/submissions/:submissionId/details-with-attempts",
    validateApiKey,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;

        // Get submission with files
        const { submission, files } =
          await storage.getSubmissionWithFiles(submissionId);

        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        // Get marking assignment info
        const markingAssignment = await storage.getMarkingAssignment(submissionId);
        
        // Get assigned marker details if exists
        let assignedMarker = null;
        if (markingAssignment?.assignedMarkerId) {
          assignedMarker = await storage.getUser(markingAssignment.assignedMarkerId);
        }

        // Get assessment data based on the custom assessment code
        let assessment = null;
        let assessmentSections: any[] = [];
        let gradeBoundaries: any[] = [];
        let existingGrade = null;
        let existingSectionMarks: any[] = [];

        if (submission.customAssessmentCode) {
          assessment = await storage.getAssessmentByCode(
            submission.customAssessmentCode,
          );
          if (assessment) {
            assessmentSections = await storage.getAssessmentSections(
              assessment.id,
            );
            // Get marking options for each section
            for (const section of assessmentSections) {
              (section as any).markingOptions =
                await storage.getSectionMarkingOptions(section.id);
            }

            // Get grade boundaries for the assessment
            gradeBoundaries = await storage.getAssessmentGradeBoundaries(assessment.id);

            // Get existing marking data if any
            existingGrade = await storage.getSubmissionGrade(submissionId);
            existingSectionMarks =
              await storage.getSubmissionSectionMarks(submissionId);
          }
        }

        // Get previous attempts
        const previousAttempts = await storage.getPreviousAttemptsForSubmission(submissionId);

        // Generate presigned URLs for all files
        const azureBlobService = getAzureBlobService();
        const filesWithUrls = await Promise.all(
          files.map(async (file) => {
            let presignedUrl = null;
            try {
              // Use azureBlobName if available, otherwise fall back to fileName
              const blobName = file.azureBlobName || file.fileName;
              presignedUrl = await azureBlobService.getSignedUrl(blobName, 60);
            } catch (error) {
              console.error(`Error generating presigned URL for file ${file.fileName}:`, error);
            }
            
            return {
              id: file.id,
              fileName: file.fileName,
              originalFileName: file.originalFileName,
              fileSize: file.fileSize,
              fileType: file.fileType,
              uploadOrder: file.uploadOrder,
              uploadedAt: file.uploadedAt,
              turnitinStatus: file.turnitinStatus,
              turnitinSimilarityScore: file.turnitinSimilarityScore,
              turnitinReportUrl: file.turnitinReportUrl,
              presignedUrl,
            };
          })
        );

        res.json({
          submission,
          files: filesWithUrls,
          markingAssignment: markingAssignment ? {
            markingStatus: markingAssignment.markingStatus,
            holdReason: markingAssignment.holdReason,
            assignedMarkerId: markingAssignment.assignedMarkerId,
          } : null,
          assignedMarker: assignedMarker ? {
            id: assignedMarker.id,
            firstName: assignedMarker.firstName,
            lastName: assignedMarker.lastName,
            email: assignedMarker.email,
          } : null,
          assessment,
          assessmentSections,
          gradeBoundaries,
          existingGrade,
          existingSectionMarks,
          previousAttempts,
        });
      } catch (error) {
        console.error("Get submission details with attempts error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Save submission marking
  app.post(
    "/api/submissions/:submissionId/marking",
    requireAuth,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;
        const markingData = req.body;
        const userId = req.user.id;

        // Check if user has permission to mark this submission
        const userRole = req.user.role;
        if (userRole !== "superadmin" && userRole !== "admin") {
          const markingAssignment =
            await storage.getMarkingAssignment(submissionId);
          if (
            !markingAssignment ||
            markingAssignment.assignedMarkerId !== userId
          ) {
            return res
              .status(403)
              .json({
                message: "You don't have permission to mark this submission",
              });
          }
        }

        // Get submission to get assessment ID
        const { submission } =
          await storage.getSubmissionWithFiles(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        let assessment = null;
        if (submission.customAssessmentCode) {
          assessment = await storage.getAssessmentByCode(
            submission.customAssessmentCode,
          );
        }

        // Validate marks if provided
        if (assessment) {
          const assessmentSections = await storage.getAssessmentSections(assessment.id);
          
          for (const section of assessmentSections) {
            const sectionMark = markingData.sectionMarks[section.id];
            
            // Only validate if marks are provided (save endpoint is more lenient)
            if (sectionMark?.marksAwarded !== undefined && sectionMark?.marksAwarded !== null && sectionMark?.marksAwarded !== '') {
              const marks = Number(sectionMark.marksAwarded);
              
              // Validate marks are non-negative
              if (marks < 0) {
                return res.status(400).json({ 
                  message: `Marks cannot be negative for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
              
              // Check if section has marking options - if so, validate against options range
              const markingOptions = await storage.getSectionMarkingOptions(section.id);
              if (markingOptions.length > 0) {
                // Validate against marking options min/max
                const maxMarks = Math.max(...markingOptions.map(opt => opt.marks));
                const minMarks = Math.min(...markingOptions.map(opt => opt.marks));
                
                if (marks > maxMarks) {
                  return res.status(400).json({ 
                    message: `Marks must not exceed ${maxMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                  });
                }
                
                if (marks < minMarks) {
                  return res.status(400).json({ 
                    message: `Marks must be at least ${minMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                  });
                }
              } else {
                // No marking options, validate against section max marks
                return res.status(400).json({ 
                  message: `No marking options found for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
            }
          }
        }

        // Save section marks
        for (const [sectionId, sectionData] of Object.entries(
          markingData.sectionMarks,
        )) {
          const existingMark =
            await storage.getSubmissionSectionMarks(submissionId);
          const existingSectionMark = existingMark.find(
            (mark) => mark.sectionId === sectionId,
          );

          const markData = {
            submissionId,
            sectionId,
            markerId: userId,
            selectedOptionId: (sectionData as any).selectedOptionId,
            feedback: (sectionData as any).feedback,
            marksAwarded: Number((sectionData as any).marksAwarded),
          };

          if (existingSectionMark) {
            await storage.updateSubmissionSectionMark(
              existingSectionMark.id,
              markData,
            );
          } else {
            await storage.createSubmissionSectionMark(markData);
          }
        }

        // Save overall grade (for save marking, we don't calculate final grade, just save the summary)
        const existingGrade = await storage.getSubmissionGrade(submissionId);
        const gradeData = {
          submissionId,
          assessmentId: assessment?.id,
          markerId: userId,
          overallSummary: markingData.overallGrade.overallSummary,
          skipReasonId: markingData.overallGrade.skipReasonId,
          skippedReason: markingData.overallGrade.skippedReason,
          malpracticeLevelId: markingData.overallGrade.malpracticeLevelId,
          malpracticeNotes: markingData.overallGrade.malpracticeNotes,
          wordCount: markingData.overallGrade.wordCount,
          isComplete: false, // Not complete when just saving
        };

        if (existingGrade) {
          await storage.updateSubmissionGrade(submissionId, gradeData);
        } else {
          await storage.createSubmissionGrade(gradeData);
        }

        // Determine marking status based on input
        let newMarkingStatus: any = "being_marked"; // Default status when saving progress
        let holdReason = null;
        
        // If on hold flag is set, update to on_hold status
        if (markingData.onHold) {
          newMarkingStatus = "on_hold";
          holdReason = markingData.holdReason || null;
        }
        // If skip reason is selected (not null/undefined), automatically update to marking_skipped
        else if (markingData.overallGrade.skipReasonId) {
          newMarkingStatus = "marking_skipped";
        }

        // Update marking status with hold reason as notes
        await storage.updateMarkingAssignmentStatus(submissionId, newMarkingStatus, userId, holdReason);

        res.json({ success: true, message: "Marking saved successfully", markingStatus: newMarkingStatus });
      } catch (error) {
        console.error("Save marking error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Complete submission marking
  app.post(
    "/api/submissions/:submissionId/complete-marking",
    requireAuth,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;
        const markingData = req.body;
        const userId = req.user.id;

        // Check if user has permission to mark this submission
        const userRole = req.user.role;
        if (userRole !== "superadmin" && userRole !== "admin") {
          const markingAssignment =
            await storage.getMarkingAssignment(submissionId);
          if (
            !markingAssignment ||
            markingAssignment.assignedMarkerId !== userId
          ) {
            return res
              .status(403)
              .json({
                message: "You don't have permission to mark this submission",
              });
          }
        }

        // Get submission to get assessment ID
        const { submission } =
          await storage.getSubmissionWithFiles(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        let assessment = null;
        if (submission.customAssessmentCode) {
          assessment = await storage.getAssessmentByCode(
            submission.customAssessmentCode,
          );
        }

        // Validate overall summary is always provided
        if (!markingData.overallGrade.overallSummary || markingData.overallGrade.overallSummary.trim() === '') {
          return res.status(400).json({ 
            message: 'Overall feedback is required for this submission' 
          });
        }

        // Check if skip reason or malpractice level is selected
        const hasSkipReasonOrMalpractice = markingData.overallGrade.skipReasonId || markingData.overallGrade.malpracticeLevelId;

        // Validate that all sections have marks and feedback (only if no skip reason or malpractice level)
        if (assessment && !hasSkipReasonOrMalpractice) {
          const assessmentSections = await storage.getAssessmentSections(assessment.id);
          
          for (const section of assessmentSections) {
            const sectionMark = markingData.sectionMarks[section.id];
            
            // Check if marks are provided and valid
            if (sectionMark?.marksAwarded === undefined || 
                sectionMark?.marksAwarded === null || 
                sectionMark?.marksAwarded === '' ||
                !Number.isFinite(Number(sectionMark?.marksAwarded))) {
              return res.status(400).json({ 
                message: `Valid marks are required for question: "${section.questionText || 'Section ' + section.id}"` 
              });
            }
            
            // Validate marks are non-negative and within valid range
            const marks = Number(sectionMark.marksAwarded);
            if (marks < 0) {
              return res.status(400).json({ 
                message: `Marks cannot be negative for question: "${section.questionText || 'Section ' + section.id}"` 
              });
            }
            
            // Check if section has marking options - if so, validate against options range
            const markingOptions = await storage.getSectionMarkingOptions(section.id);
            if (markingOptions.length > 0) {
              // Validate against marking options min/max
              const maxMarks = Math.max(...markingOptions.map(opt => opt.marks));
              const minMarks = Math.min(...markingOptions.map(opt => opt.marks));
              
              if (marks > maxMarks) {
                return res.status(400).json({ 
                  message: `Marks must not exceed ${maxMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
              
              if (marks < minMarks) {
                return res.status(400).json({ 
                  message: `Marks must be at least ${minMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
            }
            
            // Check if feedback is provided
            if (!sectionMark?.feedback || sectionMark.feedback.trim() === '') {
              return res.status(400).json({ 
                message: `Feedback is required for question: "${section.questionText || 'Section ' + section.id}"` 
              });
            }
          }
        }

        // Save section marks
        for (const [sectionId, sectionData] of Object.entries(
          markingData.sectionMarks,
        )) {
          const existingMark =
            await storage.getSubmissionSectionMarks(submissionId);
          const existingSectionMark = existingMark.find(
            (mark) => mark.sectionId === sectionId,
          );

          const markData = {
            submissionId,
            sectionId,
            markerId: userId,
            selectedOptionId: (sectionData as any).selectedOptionId,
            feedback: (sectionData as any).feedback,
            marksAwarded: Number((sectionData as any).marksAwarded),
          };

          if (existingSectionMark) {
            await storage.updateSubmissionSectionMark(
              existingSectionMark.id,
              markData,
            );
          } else {
            await storage.createSubmissionSectionMark(markData);
          }
        }

        // Calculate final grade automatically
        let finalGrade = '';
        let totalMarksAwarded = 0;
        let totalMarksPossible = 0;
        
        if (assessment) {
          // Get assessment sections and grade boundaries
          const assessmentSections = await storage.getAssessmentSections(assessment.id);
          const gradeBoundaries = await storage.getAssessmentGradeBoundaries(assessment.id);

          // Check for auto-fail conditions
          let shouldAutoFail = hasSkipReasonOrMalpractice;
          
          // Calculate total marks awarded and possible
          for (const section of assessmentSections) {
            const sectionMark = markingData.sectionMarks[section.id];
            if (sectionMark) {
              const marksAwarded = Number((sectionMark as any).marksAwarded);
              // Calculate total marks awarded
              totalMarksAwarded += marksAwarded;
              // Override with failing grade if any section has 1 mark
              if (marksAwarded === 1) {
                shouldAutoFail = true;
              }
            }
            
            // Get max marks from marking options for this section
            const markingOptions = await storage.getSectionMarkingOptions(section.id);
            if (markingOptions.length > 0) {
              const maxMarks = Math.max(...markingOptions.map(opt => opt.marks));
              totalMarksPossible += maxMarks;
            }
          }
          
          // Find matching grade boundary based on total marks (not percentage)
          // Grade boundaries use total marks directly
          const matchingBoundary = gradeBoundaries
            .sort((a: any, b: any) => b.marksFrom - a.marksFrom) // Sort descending to find highest matching grade
            .find((boundary: any) => 
              totalMarksAwarded >= boundary.marksFrom && totalMarksAwarded <= boundary.marksTo
            );
          
          finalGrade = matchingBoundary?.gradeLabel || '';
          
          // Apply auto-fail if any condition is met
          if (shouldAutoFail) {
            // Find the first failing grade (isPass = false)
            const failingGrade = gradeBoundaries
              .sort((a: any, b: any) => a.marksFrom - b.marksFrom) // Sort ascending to get lowest failing grade first
              .find((boundary: any) => boundary.isPass === false);
            
            if (failingGrade) {
              finalGrade = failingGrade.gradeLabel;
            }
          }
        }

        // Save overall grade
        const existingGrade = await storage.getSubmissionGrade(submissionId);
        const gradeData = {
          submissionId,
          assessmentId: assessment?.id,
          markerId: userId,
          finalGrade: finalGrade,
          totalMarksAwarded: totalMarksAwarded,
          totalMarksPossible: totalMarksPossible,
          percentageScore: totalMarksPossible > 0 ? (totalMarksAwarded / totalMarksPossible) * 100 : 0,
          overallSummary: markingData.overallGrade.overallSummary,
          skipReasonId: markingData.overallGrade.skipReasonId,
          skippedReason: markingData.overallGrade.skippedReason,
          malpracticeLevelId: markingData.overallGrade.malpracticeLevelId,
          malpracticeNotes: markingData.overallGrade.malpracticeNotes,
          wordCount: markingData.overallGrade.wordCount,
          isComplete: true, // Mark as complete
        };

        if (existingGrade) {
          await storage.updateSubmissionGrade(submissionId, gradeData);
        } else {
          await storage.createSubmissionGrade(gradeData);
        }

        // Apply malpractice enforcement rules if a malpractice level was selected
        if (markingData.overallGrade.malpracticeLevelId && submission.lmsUserId && submission.customAssessmentCode) {
          const malpracticeLevel = await storage.getMalpracticeLevel(markingData.overallGrade.malpracticeLevelId);
          
          if (malpracticeLevel) {
            // Get current attempt number
            const attemptCount = await storage.countSubmissionAttempts(
              submission.lmsUserId,
              submission.customAssessmentCode,
              submission.contextId
            );

            const levelText = malpracticeLevel.levelText.toLowerCase();

            // Check if enforcement already exists for this submission
            const existingEnforcement = await storage.getMalpracticeEnforcementBySubmission(submission.id);

            // Prepare enforcement data based on malpractice level type
            let enforcedMaxAttempts = null;

            // Apply rules based on malpractice level type
            if (levelText.includes('moderate')) {
              // Moderate: Mark as refer/fail, set to approval_needed, allow next attempt
              enforcedMaxAttempts = 3 // Allow all remaining attempts
            } else if (levelText.includes('considerable')) {
              // Considerable: Mark as refer, only 1 further attempt allowed
              enforcedMaxAttempts = 2;
            } else if (levelText.includes('severe')) {
              // Severe: All attempts marked as refer/fail, no further attempts allowed
              enforcedMaxAttempts = 1; // Block all future attempts
            }

            const enforcementData = {
              lmsUserId: submission.lmsUserId,
              customAssessmentCode: submission.customAssessmentCode,
              contextId: submission.contextId,
              contextTitle: submission.contextTitle,
              malpracticeLevelId: malpracticeLevel.id,
              submissionId: submission.id,
              attemptNumber: submission.attemptNumber || 1,
              enforcedMaxAttempts: enforcedMaxAttempts,
              ruleAppliedBy: userId
            };

            console.log(enforcementData)

            // Update existing enforcement or create new one
            if (existingEnforcement) {
              await storage.updateMalpracticeEnforcement(existingEnforcement.id, enforcementData);
            } else {
              await storage.createMalpracticeEnforcement(enforcementData);
            }
          }
        }

        // Update marking status based on skip reason
        // If skip reason is selected, set to marking_skipped, otherwise approval_needed
        const markingStatus = markingData.overallGrade.skipReasonId ? "marking_skipped" : "approval_needed";
        await storage.updateMarkingAssignmentStatus(submissionId, markingStatus, userId);
        
        res.status(200).json({ success: true, message: "Marking completed successfully", markingStatus })
      } catch (error) {
        console.error("Complete marking error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Download submission file
  app.get(
    "/api/submissions/:submissionId/files/:fileId/download",
    requireAuth,
    async (req: any, res) => {
      try {
        const { submissionId, fileId } = req.params;

        // Check if user has permission to download this file
        const userRole = req.user.role;
        const userId = req.user.id;

        // Get submission file
        const file = await storage.getSubmissionFile(fileId);
        if (!file || file.submissionId !== submissionId) {
          return res.status(404).json({ message: "File not found" });
        }

        // Role-based access control
        if (userRole !== "superadmin" && userRole !== "admin") {
          // Check if user is assigned to mark this submission
          const markingAssignment =
            await storage.getMarkingAssignment(submissionId);
          if (
            !markingAssignment ||
            markingAssignment.assignedMarkerId !== userId
          ) {
            return res
              .status(403)
              .json({
                message: "You don't have permission to download this file",
              });
          }
        }

        // If file is stored in Azure Blob Storage, download via server proxy
        if (file.azureBlobName) {
          try {
            const azureService = getAzureBlobService();
            console.log(
              "Downloading file via server proxy:",
              file.azureBlobName,
            );

            // Download file directly from Azure to server
            const fileBuffer = await azureService.downloadFile(
              file.azureBlobName,
            );

            // Set appropriate headers for file download
            res.setHeader(
              "Content-Type",
              file.fileType || "application/octet-stream",
            );
            res.setHeader(
              "Content-Disposition",
              `attachment; filename="${file.originalFileName || file.fileName}"`,
            );
            res.setHeader("Content-Length", fileBuffer.length.toString());

            // Send the file buffer to client
            res.send(fileBuffer);
          } catch (downloadError) {
            console.error("Error downloading file from Azure:", downloadError);
            res.status(500).json({ message: "Error downloading file" });
          }
        } else {
          // Fallback for files not stored in Azure (if any)
          res.status(404).json({ message: "File not available for download" });
        }
      } catch (error) {
        console.error("Download file error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Marker feedback file upload endpoint
  app.post(
    "/api/submissions/:submissionId/feedback-files",
    requireAuth,
    requireRole(["marker", "admin", "superadmin"]),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { submissionId } = req.params;
        const userId = req.user.id;
        const { files } = req.body; // Array of files: [{ fileName, fileSize, fileType, fileData }]

        if (!files || !Array.isArray(files) || files.length === 0) {
          return res.status(400).json({
            success: false,
            message: "No files provided for upload",
          });
        }

        // Verify submission exists and user has permission
        const submission = await storage.getSubmission(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        // Check if user is assigned to mark this submission (unless admin/superadmin)
        if (req.user.role !== "admin" && req.user.role !== "superadmin") {
          const markingAssignment =
            await storage.getMarkingAssignment(submissionId);
          if (
            !markingAssignment ||
            markingAssignment.assignedMarkerId !== userId
          ) {
            return res.status(403).json({
              message: "You don't have permission to upload files for this submission",
            });
          }
        }

        const azureService = getAzureBlobService();
        const uploadedFiles = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const { fileName, fileSize, fileType, fileData } = file;

          console.log(
            `🔄 Processing marker feedback file ${i + 1}/${files.length}: ${fileName}`,
          );

          let azureBlobUrl, azureBlobName, fileUrl;

          try {
            // Convert base64 file data to buffer
            const base64Data = fileData.split(",")[1]; // Remove data:type;base64, prefix
            const fileBuffer = Buffer.from(base64Data, "base64");

            // Upload to Marker_files folder
            const uploadResult = await azureService.uploadFile({
              fileName,
              fileBuffer,
              contentType: getContentType(fileType),
              folder: "Marker_files", // Store in Marker_files folder
              metadata: {
                markerId: userId,
                submissionId: submissionId,
                uploadedAt: new Date().toISOString(),
                uploadOrder: (i + 1).toString(),
              },
            });

            azureBlobUrl = uploadResult.url;
            azureBlobName = uploadResult.blobName;
            fileUrl = uploadResult.url;

            console.log(
              `✅ Marker feedback file ${i + 1} uploaded to Azure: ${fileName}`,
            );
          } catch (azureError) {
            console.error(
              `❌ Azure upload failed for marker file ${i + 1}:`,
              azureError,
            );
            return res.status(500).json({
              success: false,
              message: `Failed to upload file: ${fileName}`,
            });
          }

          uploadedFiles.push({
            fileName,
            originalFileName: fileName,
            fileSize,
            fileType,
            fileMimeType: getContentType(fileType),
            fileUrl,
            azureBlobUrl: azureBlobUrl || null,
            azureBlobName: azureBlobName || null,
            azureContainerName: "rogoreplacement",
            uploadOrder: i + 1,
            submissionFileType: "feedback" as const, // Marker uploaded files
            uploadedBy: userId, // Store marker's user ID
            turnitinStatus: "skipped" as const,
          });
        }

        // Create file records in database
        const submissionFileRecords = uploadedFiles.map((file) => ({
          submissionId: submission.id,
          ...file,
        }));

        const createdFiles =
          await storage.createMultipleSubmissionFiles(submissionFileRecords);

        console.log(
          `✅ Successfully uploaded ${createdFiles.length} marker feedback file(s) for submission: ${submissionId}`,
        );

        res.json({
          success: true,
          message: `Successfully uploaded ${createdFiles.length} file(s)`,
          files: createdFiles,
        });
      } catch (error) {
        console.error("Marker feedback file upload error:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error during file upload",
        });
      }
    },
  );

  // Marker feedback file delete endpoint (admin/superadmin only)
  app.delete(
    "/api/submissions/:submissionId/feedback-files/:fileId",
    requireAuth,
    requireRole(["admin", "superadmin"]),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { submissionId, fileId } = req.params;

        // Get submission file
        const file = await storage.getSubmissionFile(fileId);
        if (!file || file.submissionId !== submissionId) {
          return res.status(404).json({ message: "File not found" });
        }

        // Only allow deletion of marker feedback files
        if (file.submissionFileType !== "feedback") {
          return res.status(400).json({
            success: false,
            message: "Only marker feedback files can be deleted through this endpoint",
          });
        }

        // Delete file from Azure Blob Storage if it exists
        if (file.azureBlobName) {
          try {
            const azureService = getAzureBlobService();
            await azureService.deleteFile(file.azureBlobName);
            console.log(
              `✅ Deleted marker feedback file from Azure: ${file.azureBlobName}`,
            );
          } catch (azureError) {
            console.error(
              `⚠️ Failed to delete file from Azure (continuing with DB deletion):`,
              azureError,
            );
            // Continue with database deletion even if Azure deletion fails
          }
        }

        // Delete file record from database
        await storage.deleteSubmissionFile(fileId);

        console.log(
          `✅ Successfully deleted marker feedback file: ${file.fileName} (${fileId})`,
        );

        res.json({
          success: true,
          message: "File deleted successfully",
        });
      } catch (error) {
        console.error("Marker feedback file delete error:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error during file deletion",
        });
      }
    },
  );

  // Manual TurnItIn retry endpoint for admins
  app.post(
    "/api/submissions/:submissionId/files/:fileId/retry-turnitin",
    requireAuth,
    requireRole(["admin", "superadmin"]),
    async (req: any, res) => {
      try {
        const { submissionId, fileId } = req.params;

        // Get submission file
        const file = await storage.getSubmissionFile(fileId);
        if (!file || file.submissionId !== submissionId) {
          return res.status(404).json({ message: "File not found" });
        }

        // Get submission and session record for context
        const { submission } =
          await storage.getSubmissionWithFiles(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        // Get LTI session record for submission context, or create fallback data
        let sessionRecord = submission.ltiSessionRecordId
          ? await storage.getLtiSessionRecord(submission.ltiSessionRecordId)
          : null;

        // If no session record, create fallback data for TurnItIn submission
        if (!sessionRecord) {
          console.log(
            `⚠️ No LTI session record found for submission ${submissionId}, using fallback data`,
          );
          sessionRecord = {
            email: submission.email || "unknown@email.com",
            firstName: submission.firstName || "Student",
            lastName: submission.lastName || "User",
            customAssessmentCode:
              submission.customAssessmentCode || "retry-submission",
            contextId: submission.contextId || "manual-retry",
            lmsUserId: submission.id, // Use submission ID as fallback
          };
        }

        try {
          console.log(
            `🔄 Manual TurnItIn retry for file: ${file.fileName} by admin: ${req.user.email}`,
          );

          // Reset file status
          await storage.updateSubmissionFile(file.id, {
            turnitinStatus: "pending",
            turnitinErrorMessage: null,
          });

          // Submit to TurnItIn
          await submitFileToTurnitin(file, submission, sessionRecord);

          console.log(
            `✅ Manual TurnItIn retry successful for: ${file.fileName}`,
          );
          res.json({
            success: true,
            message: `TurnItIn submission successful for ${file.fileName}`,
          });
        } catch (error) {
          console.error(
            `❌ Manual TurnItIn retry failed for ${file.fileName}:`,
            error,
          );

          // Update file with error status
          await storage.updateSubmissionFile(file.id, {
            turnitinStatus: "error",
            turnitinErrorMessage:
              error instanceof Error ? error.message : "Unknown error",
          });

          res.status(500).json({
            success: false,
            message: `TurnItIn submission failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
      } catch (error) {
        console.error("Retry TurnItIn error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Create API key endpoint (superadmin only)
  app.post(
    "/api/api-keys",
    requireAuth,
    requireRole("superadmin"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { name, description, expiresAt } = req.body;

        // 1️⃣ Validate required fields
        if (!name || typeof name !== "string") {
          return res.status(400).json({ message: "Name is required" });
        }

        // 2️⃣ Generate secure API key parts
        // Format: identifier.secret
        // Example: ak_abc123def456.abcdef1234567890abcdef1234567890
        const identifier = `ak_${randomBytes(8).toString("hex")}`;
        const secret = randomBytes(32).toString("hex");
        const fullApiKey = `${identifier}.${secret}`;

        // 3️⃣ Hash the entire API key
        const keyHash = await bcrypt.hash(fullApiKey, 10);

        // 4️⃣ Validate expiration date (optional)
        let expirationDate: Date | null = null;
        if (expiresAt) {
          expirationDate = new Date(expiresAt);
          if (isNaN(expirationDate.getTime())) {
            return res.status(400).json({ message: "Invalid expiration date" });
          }
        }

        // 5️⃣ Store metadata in DB
        const apiKey = await storage.createApiKey({
          keyIdentifier: identifier,
          keyHash,
          name,
          description: description || null,
          isActive: "true",
          expiresAt: expirationDate,
          createdBy: req.user!.id,
        });

        // 6️⃣ Return response (only show the key once)
        return res.status(201).json({
          message:
            "API key created successfully. Save this key — it will not be shown again!",
          apiKey: {
            id: apiKey.id,
            identifier: apiKey.keyIdentifier,
            name: apiKey.name,
            description: apiKey.description,
            isActive: apiKey.isActive,
            expiresAt: apiKey.expiresAt,
            createdAt: apiKey.createdAt,
          },
          key: fullApiKey,
        });
      } catch (error) {
        console.error("Create API key error:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  // Third-party API: Save submission marking (for Marking Buddy tool)
  app.post(
    "/api/submissions/:submissionId/external-marking",
    validateApiKey,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;
        const markingData = req.body;

        // Get submission to get assessment ID
        const { submission } = await storage.getSubmissionWithFiles(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        let assessment = null;
        if (submission.customAssessmentCode) {
          assessment = await storage.getAssessmentByCode(
            submission.customAssessmentCode,
          );
        }

        // Validate marks if provided
        if (assessment) {
          const assessmentSections = await storage.getAssessmentSections(assessment.id);
          
          for (const section of assessmentSections) {
            const sectionMark = markingData.sectionMarks[section.id];
            
            // Only validate if marks are provided (save endpoint is more lenient)
            if (sectionMark?.marksAwarded !== undefined && sectionMark?.marksAwarded !== null && sectionMark?.marksAwarded !== '') {
              const marks = Number(sectionMark.marksAwarded);
              
              // Validate marks are non-negative
              if (marks < 0) {
                return res.status(400).json({ 
                  message: `Marks cannot be negative for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
              
              // Check if section has marking options - if so, validate against options range
              const markingOptions = await storage.getSectionMarkingOptions(section.id);
              if (markingOptions.length > 0) {
                // Validate against marking options min/max
                const maxMarks = Math.max(...markingOptions.map(opt => opt.marks));
                const minMarks = Math.min(...markingOptions.map(opt => opt.marks));
                
                if (marks > maxMarks) {
                  return res.status(400).json({ 
                    message: `Marks must not exceed ${maxMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                  });
                }
                
                if (marks < minMarks) {
                  return res.status(400).json({ 
                    message: `Marks must be at least ${minMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                  });
                }
              } else {
                // No marking options, validate against section max marks
                return res.status(400).json({ 
                  message: `No marking options found for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
            }
          }
        }

        // Save section marks with markingCriterion
        for (const [sectionId, sectionData] of Object.entries(
          markingData.sectionMarks,
        )) {
          const existingMark = await storage.getSubmissionSectionMarks(submissionId);
          const existingSectionMark = existingMark.find(
            (mark) => mark.sectionId === sectionId,
          );

          const markData: any = {
            submissionId,
            sectionId,
            markerId: null, // API key requests don't have a user ID
            selectedOptionId: (sectionData as any).selectedOptionId,
            feedback: (sectionData as any).feedback,
            marksAwarded: Number((sectionData as any).marksAwarded),
            markingCriterias: (sectionData as any).markingCriterion || null, // Store markingCriterion in JSONB field
          };

          if (existingSectionMark) {
            await storage.updateSubmissionSectionMark(
              existingSectionMark.id,
              markData,
            );
          } else {
            await storage.createSubmissionSectionMark(markData);
          }
        }

        // Save overall grade (for save marking, we don't calculate final grade, just save the summary)
        const existingGrade = await storage.getSubmissionGrade(submissionId);
        const gradeData = {
          submissionId,
          assessmentId: assessment?.id,
          markerId: null, // API key requests don't have a user ID
          overallSummary: markingData.overallGrade.overallSummary,
          skipReasonId: markingData.overallGrade.skipReasonId,
          skippedReason: markingData.overallGrade.skippedReason,
          malpracticeLevelId: markingData.overallGrade.malpracticeLevelId,
          malpracticeNotes: markingData.overallGrade.malpracticeNotes,
          wordCount: markingData.overallGrade.wordCount,
          isComplete: false, // Not complete when just saving
        };

        if (existingGrade) {
          await storage.updateSubmissionGrade(submissionId, gradeData);
        } else {
          await storage.createSubmissionGrade(gradeData);
        }

        // Determine marking status based on input
        let newMarkingStatus: any = "being_marked"; // Default status when saving progress
        let holdReason = null;
        
        // If on hold flag is set, update to on_hold status
        if (markingData.onHold) {
          newMarkingStatus = "on_hold";
          holdReason = markingData.holdReason || null;
        }
        // If skip reason is selected (not null/undefined), automatically update to marking_skipped
        else if (markingData.overallGrade.skipReasonId) {
          newMarkingStatus = "marking_skipped";
        }

        // Update marking status with hold reason as notes
        await storage.updateMarkingAssignmentStatus(submissionId, newMarkingStatus, null, holdReason);

        res.json({ message: "Marking saved successfully" });
      } catch (error) {
        console.error("API save marking error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Third-party API: Complete submission marking (for Marking Buddy tool)
  app.post(
    "/api/submissions/:submissionId/external-complete-marking",
    validateApiKey,
    async (req: any, res) => {
      try {
        const { submissionId } = req.params;
        const markingData = req.body;

        // Get submission to get assessment ID
        const { submission } = await storage.getSubmissionWithFiles(submissionId);
        if (!submission) {
          return res.status(404).json({ message: "Submission not found" });
        }

        let assessment = null;
        if (submission.customAssessmentCode) {
          assessment = await storage.getAssessmentByCode(
            submission.customAssessmentCode,
          );
        }

        // Validate overall summary is always provided
        if (!markingData.overallGrade.overallSummary || markingData.overallGrade.overallSummary.trim() === '') {
          return res.status(400).json({ 
            message: 'Overall feedback is required for this submission' 
          });
        }

        // Check if skip reason or malpractice level is selected
        const hasSkipReasonOrMalpractice = markingData.overallGrade.skipReasonId || markingData.overallGrade.malpracticeLevelId;

        // Validate that all sections have marks and feedback (only if no skip reason or malpractice level)
        if (assessment && !hasSkipReasonOrMalpractice) {
          const assessmentSections = await storage.getAssessmentSections(assessment.id);
          
          for (const section of assessmentSections) {
            const sectionMark = markingData.sectionMarks[section.id];
            
            // Check if marks are provided and valid
            if (sectionMark?.marksAwarded === undefined || 
                sectionMark?.marksAwarded === null || 
                sectionMark?.marksAwarded === '' ||
                !Number.isFinite(Number(sectionMark?.marksAwarded))) {
              return res.status(400).json({ 
                message: `Valid marks are required for question: "${section.questionText || 'Section ' + section.id}"` 
              });
            }
            
            // Validate marks are non-negative and within valid range
            const marks = Number(sectionMark.marksAwarded);
            if (marks < 0) {
              return res.status(400).json({ 
                message: `Marks cannot be negative for question: "${section.questionText || 'Section ' + section.id}"` 
              });
            }
            
            // Check if section has marking options - if so, validate against options range
            const markingOptions = await storage.getSectionMarkingOptions(section.id);
            if (markingOptions.length > 0) {
              // Validate against marking options min/max
              const maxMarks = Math.max(...markingOptions.map(opt => opt.marks));
              const minMarks = Math.min(...markingOptions.map(opt => opt.marks));
              
              if (marks > maxMarks) {
                return res.status(400).json({ 
                  message: `Marks must not exceed ${maxMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
              
              if (marks < minMarks) {
                return res.status(400).json({ 
                  message: `Marks must be at least ${minMarks} for question: "${section.questionText || 'Section ' + section.id}"` 
                });
              }
            } else {
              // No marking options, validate against section max marks
              return res.status(400).json({ 
                message: `No marking options found for question: "${section.questionText || 'Section ' + section.id}"` 
              });
            }
          }
        }

        // Save section marks with markingCriterion
        for (const [sectionId, sectionData] of Object.entries(
          markingData.sectionMarks,
        )) {
          const existingMark = await storage.getSubmissionSectionMarks(submissionId);
          const existingSectionMark = existingMark.find(
            (mark) => mark.sectionId === sectionId,
          );

          const markData: any = {
            submissionId,
            sectionId,
            markerId: null, // API key requests don't have a user ID
            selectedOptionId: (sectionData as any).selectedOptionId,
            feedback: (sectionData as any).feedback,
            marksAwarded: Number((sectionData as any).marksAwarded),
            markingCriterias: (sectionData as any).markingCriterion || null, // Store markingCriterion in JSONB field
          };

          if (existingSectionMark) {
            await storage.updateSubmissionSectionMark(
              existingSectionMark.id,
              markData,
            );
          } else {
            await storage.createSubmissionSectionMark(markData);
          }
        }

        // Calculate total marks and determine final grade
        let totalMarksAwarded = 0;
        let totalMarksPossible = 0;
        let finalGrade = '';

        if (assessment) {
          // Get assessment sections and grade boundaries
          const assessmentSections = await storage.getAssessmentSections(assessment.id);
          const gradeBoundaries = await storage.getAssessmentGradeBoundaries(assessment.id);

          // Check for auto-fail conditions
          let shouldAutoFail = hasSkipReasonOrMalpractice;

          // Calculate total marks awarded and possible
          for (const section of assessmentSections) {
            const sectionMark = markingData.sectionMarks[section.id];
            if (sectionMark) {
              const marksAwarded = Number((sectionMark as any).marksAwarded);
              // Calculate total marks awarded
              totalMarksAwarded += marksAwarded;
              // Override with failing grade if any section has 1 mark
              if (marksAwarded === 1) {
                shouldAutoFail = true;
              }
            }

            // Get max marks from marking options for this section
            const markingOptions = await storage.getSectionMarkingOptions(section.id);
            if (markingOptions.length > 0) {
              const maxMarks = Math.max(...markingOptions.map(opt => opt.marks));
              totalMarksPossible += maxMarks;
            }
          }

          // Find matching grade boundary based on total marks (not percentage)
          // Grade boundaries use total marks directly
          const matchingBoundary = gradeBoundaries
            .sort((a: any, b: any) => b.marksFrom - a.marksFrom) // Sort descending to find highest matching grade
            .find((boundary: any) => 
              totalMarksAwarded >= boundary.marksFrom && totalMarksAwarded <= boundary.marksTo
            );

          finalGrade = matchingBoundary?.gradeLabel || '';

          // Apply auto-fail if any condition is met
          if (shouldAutoFail) {
            // Find the first failing grade (isPass = false)
            const failingGrade = gradeBoundaries
              .sort((a: any, b: any) => a.marksFrom - b.marksFrom) // Sort ascending to get lowest failing grade first
              .find((boundary: any) => boundary.isPass === false);

            if (failingGrade) {
              finalGrade = failingGrade.gradeLabel;
            }
          }
        }

        // Save overall grade
        const existingGrade = await storage.getSubmissionGrade(submissionId);
        const gradeData = {
          submissionId,
          assessmentId: assessment?.id,
          markerId: null, // API key requests don't have a user ID
          finalGrade: finalGrade,
          totalMarksAwarded: totalMarksAwarded,
          totalMarksPossible: totalMarksPossible,
          percentageScore: totalMarksPossible > 0 ? (totalMarksAwarded / totalMarksPossible) * 100 : 0,
          overallSummary: markingData.overallGrade.overallSummary,
          skipReasonId: markingData.overallGrade.skipReasonId,
          skippedReason: markingData.overallGrade.skippedReason,
          malpracticeLevelId: markingData.overallGrade.malpracticeLevelId,
          malpracticeNotes: markingData.overallGrade.malpracticeNotes,
          wordCount: markingData.overallGrade.wordCount,
          isComplete: true,
          completedAt: new Date(),
        };

        if (existingGrade) {
          await storage.updateSubmissionGrade(submissionId, gradeData);
        } else {
          await storage.createSubmissionGrade(gradeData);
        }

        // Determine final marking status based on skip reason
        const finalMarkingStatus = markingData.overallGrade.skipReasonId ? "marking_skipped" : "approval_needed";

        // Update marking status
        await storage.updateMarkingAssignmentStatus(submissionId, finalMarkingStatus, null, null);

        // Handle malpractice enforcement if malpractice level is selected
        if (markingData.overallGrade.malpracticeLevelId && assessment) {
          const malpracticeLevel = await storage.getMalpracticeLevelById(markingData.overallGrade.malpracticeLevelId);
          
          if (malpracticeLevel) {
            let maxAttempts = submission.attemptNumber;
            
            // Apply malpractice rules based on level
            if (malpracticeLevel.levelText === "Moderate") {
              maxAttempts = 3; // No restriction, normal 3-attempt limit
            } else if (malpracticeLevel.levelText === "Considerable") {
              maxAttempts = submission.attemptNumber + 1; // Cap at current + 1
            } else if (malpracticeLevel.levelText === "Severe") {
              maxAttempts = submission.attemptNumber; // Cap at current attempt
            }

            // Check for existing enforcement record
            const existingEnforcement = await storage.getMalpracticeEnforcement(
              submission.lmsUserId,
              submission.customAssessmentCode,
              submission.contextId
            );

            if (existingEnforcement) {
              // Update existing enforcement
              await storage.updateMalpracticeEnforcement(existingEnforcement.id, {
                malpracticeLevelId: markingData.overallGrade.malpracticeLevelId,
                maxAttempts,
                notes: markingData.overallGrade.malpracticeNotes,
              });
            } else {
              // Create new enforcement record
              await storage.createMalpracticeEnforcement({
                lmsUserId: submission.lmsUserId,
                customAssessmentCode: submission.customAssessmentCode,
                contextId: submission.contextId,
                contextTitle: submission.contextTitle,
                malpracticeLevelId: markingData.overallGrade.malpracticeLevelId,
                submissionId: submission.id,
                maxAttempts,
                notes: markingData.overallGrade.malpracticeNotes,
              });
            }
          }
        }

        res.json({ 
          message: "Marking completed successfully",
          finalGrade,
          totalMarksAwarded,
          totalMarksPossible
        });
      } catch (error) {
        console.error("API complete marking error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  const httpServer = createServer(app);
  return httpServer;
}
