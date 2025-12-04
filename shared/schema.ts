import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, pgEnum, integer, boolean, real, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define user roles enum
export const userRoleEnum = pgEnum("user_role", [
  "superadmin",
  "admin", 
  "marker",
  "tutor",
  "iqa",
  "student"
]);

// Define user status enum
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive", 
  "pending"
]);

// Define instruction step type enum
export const instructionStepTypeEnum = pgEnum("instruction_step_type", [
  "info",
  "checkbox", 
  "upload"
]);

// Define course status enum

// Define assessment status enum
export const assessmentStatusEnum = pgEnum("assessment_status", [
  "active",
  "inactive",
  "draft",
  "archived"
]);

// Define assessment type enum
export const assessmentTypeEnum = pgEnum("assessment_type", [
  "formative",
  "summative",
  "diagnostic",
  "competency"
]);

// Define marking status enum
export const markingStatusEnum = pgEnum("marking_status", [
  "waiting",
  "being_marked",
  "on_hold",
  "approval_needed",
  "marking_skipped",
  "released"
]);

// Define submission file type enum
export const submissionFileTypeEnum = pgEnum("submission_file_type", [
  "submission", // Learner uploaded files
  "feedback"    // Marker uploaded feedback files
]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: userRoleEnum("role").notNull().default("student"),
  status: userStatusEnum("status").notNull().default("active"),
  department: text("department"),
  profileImageUrl: text("profile_image_url"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// System settings table
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id)
});


// Email templates table for storing HubSpot email template configurations
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateKey: text("template_key").notNull().unique(), // e.g., 'invite_user', 'forgot_password'
  hubspotEmailId: text("hubspot_email_id"), // HubSpot email template ID (optional if using custom HTML)
  templateName: text("template_name").notNull(),
  description: text("description"),
  subject: text("subject"), // Email subject line
  htmlContent: text("html_content"), // Custom HTML template content
  textContent: text("text_content"), // Plain text fallback content
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// User sessions table
export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: text("used").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// API keys table for external API access
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  keyIdentifier: text("key_identifier").notNull().unique(),
  keyHash: text("key_hash").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: text("is_active").notNull().default("true"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// LTI Session Records - captures all LTI data during initial launch
export const ltiSessionRecords = pgTable("lti_session_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  launchId: text("launch_id").notNull().unique(),
  // Core LTI fields extracted during launch
  lmsUserId: text("lms_user_id"), // From user_id
  consumerName: text("consumer_name"), // From tool_consumer_instance_name
  role: text("role"), // From roles
  firstName: text("first_name"), // From lis_person_name_given
  lastName: text("last_name"), // From lis_person_name_family
  fullName: text("full_name"), // From lis_person_name_full
  email: text("email"), // From lis_person_contact_email_primary
  customAction: text("custom_action"), // From custom_action
  // LTI parameter fields
  customInstructionSet: text("custom_instruction_set"), // From cis parameter
  customAssessmentCode: text("custom_assessment_code"), // From cas parameter
  contextType: text("context_type"), // From context_type
  contextTitle: text("context_title"), // From context_title
  // Additional LTI context
  resourceLinkId: text("resource_link_id"),
  resourceLinkTitle: text("resource_link_title"),
  contextId: text("context_id"),
  consumerKey: text("consumer_key"),
  toolConsumerInstanceGuid: text("tool_consumer_instance_guid"),
  returnUrl: text("return_url"),
  // Session status tracking
  hasFileSubmission: text("has_file_submission").default("false"),
  sessionExpiry: timestamp("session_expiry", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// Assignment submissions table - simplified for LTI-only usage
export const assignmentSubmissions = pgTable("assignment_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Link to LTI session record
  ltiSessionRecordId: varchar("lti_session_record_id").references(() => ltiSessionRecords.id),
  ltiLaunchId: varchar("lti_launch_id").notNull(), // Keep for legacy compatibility
  // Multiple files support
  fileCount: integer("file_count").notNull().default(0),
  totalFileSize: text("total_file_size"), // Combined size of all files
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
  attemptNumber: integer("attempt_number"), // The attempt number for this submission (1, 2, 3)
  // Store comprehensive LTI student and context info directly from LTI parameters
  lmsUserId: text("lms_user_id"), // From user_id (copied from session record)
  consumerName: text("consumer_name"), // From tool_consumer_instance_name
  role: text("role"), // From roles
  firstName: text("first_name"), // From lis_person_name_given
  lastName: text("last_name"), // From lis_person_name_family
  fullName: text("full_name"), // From lis_person_name_full
  email: text("email"), // From lis_person_contact_email_primary
  // LTI parameter fields for assignment submissions
  customInstructionSet: text("custom_instruction_set"), // From cis parameter
  customAssessmentCode: text("custom_assessment_code"), // From cas parameter
  customAction: text("custom_action"), // From custom_action
  contextType: text("context_type"), // From context_type
  contextTitle: text("context_title"), // From context_title
  contextId: text("context_id"), // From context_id - uniquely identifies the course
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  contextTitleIdx: index("idx_assignment_submissions_context_title").on(table.contextTitle),
}));

// Submission marking assignments table - tracks who marks which submissions and their status
export const submissionMarkingAssignments = pgTable("submission_marking_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").references(() => assignmentSubmissions.id, { onDelete: 'cascade' }),
  assignedMarkerId: varchar("assigned_marker_id").references(() => users.id), // Who is assigned to mark this submission
  markingStatus: markingStatusEnum("marking_status").notNull().default("waiting"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
  statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).defaultNow(),
  statusUpdatedBy: varchar("status_updated_by").references(() => users.id), // Who last updated the status
  notes: text("notes"), // Internal notes about the marking assignment
  holdReason: text("hold_reason"), // Reason for putting submission on hold
  priority: integer("priority").default(0), // Priority level for marking (higher numbers = higher priority)
  dueDate: timestamp("due_date", { withTimezone: true }), // When marking should be completed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Individual submission files table - supports multiple files per submission
export const submissionFiles = pgTable("submission_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").references(() => assignmentSubmissions.id, { onDelete: 'cascade' }),
  fileName: text("file_name").notNull(),
  originalFileName: text("original_file_name").notNull(), // Original name before processing
  fileSize: text("file_size"),
  fileType: text("file_type"), // File extension/type (e.g., pdf, docx)
  fileMimeType: text("file_mime_type"),
  fileUrl: text("file_url").notNull(), // Azure Blob Storage URL
  azureBlobUrl: text("azure_blob_url"), // Full Azure Blob Storage URL
  azureContainerName: text("azure_container_name").default("rogoreplacement"),
  azureBlobName: text("azure_blob_name"), // Blob name in Azure Storage
  uploadOrder: integer("upload_order").notNull().default(1), // Order of file in submission
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
  // File type and uploader tracking
  submissionFileType: submissionFileTypeEnum("submission_file_type").notNull().default("submission"), // 'submission' or 'feedback'
  uploadedBy: text("uploaded_by"), // Stores either users.id (for markers) or lmsUserId (for learners)
  // Turnitin integration fields
  turnitinSubmissionId: text("turnitin_submission_id"), // Turnitin submission ID
  turnitinStatus: text("turnitin_status").default("pending"), // pending, processing, complete, error, skipped
  turnitinSimilarityScore: integer("turnitin_similarity_score"), // Similarity percentage (0-100)
  turnitinProcessedAt: timestamp("turnitin_processed_at", { withTimezone: true }), // When processing completed
  turnitinErrorMessage: text("turnitin_error_message"), // Error message if processing failed
  // PDF report fields
  turnitinPdfId: text("turnitin_pdf_id"), // PDF ID from Turnitin
  turnitinPdfStatus: text("turnitin_pdf_status").default("pending"), // pending, processing, complete, error
  turnitinPdfUrl: text("turnitin_pdf_url"), // Local URL to access PDF
  turnitinReportUrl: text("turnitin_report_url"), // URL to Turnitin report
  turnitinPdfGeneratedAt: timestamp("turnitin_pdf_generated_at", { withTimezone: true }), // When PDF generation completed
});


// TurnItIn EULA acceptances table
export const turnitinEulaAcceptances = pgTable("turnitin_eula_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  eulaVersion: text("eula_version").notNull(), // EULA version accepted
  language: text("language").notNull().default("en-US"), // Language of acceptance
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"), // IP address when accepted
  userAgent: text("user_agent"), // User agent when accepted
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// LTI launch sessions table
export const ltiLaunchSessions = pgTable("lti_launch_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  launchId: text("launch_id").notNull().unique(),
  consumerKey: text("consumer_key").notNull(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  userName: text("user_name"),
  courseName: text("course_name"),
  returnUrl: text("return_url"),
  resourceLinkId: text("resource_link_id"),
  contextId: text("context_id"),
  toolConsumerInstanceGuid: text("tool_consumer_instance_guid"),
  customParams: text("custom_params"),
  // All LTI fields from parameters
  ltiMessageType: text("lti_message_type"),
  contextType: text("context_type"),
  contextTitle: text("context_title"),
  roles: text("roles"),
  lisPersonNameGiven: text("lis_person_name_given"),
  lisPersonNameFamily: text("lis_person_name_family"),
  lisPersonNameFull: text("lis_person_name_full"),
  lisPersonContactEmailPrimary: text("lis_person_contact_email_primary"),
  toolConsumerInstanceName: text("tool_consumer_instance_name"),
  // Additional custom parameters
  customAction: text("custom_action"),
  assignmentTitle: text("assignment_title"), // Assignment title from resource_link_title
  // LTI parameter fields
  customInstructionSet: text("custom_instruction_set"), // From cis parameter
  customAssessmentCode: text("custom_assessment_code"), // From cas parameter
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});

// LTI viewer sessions table - secure tokens for students to view their submission results
export const ltiViewerSessions = pgTable("lti_viewer_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  viewerToken: text("viewer_token").notNull().unique(), // Hashed cryptographic token
  launchId: text("launch_id").notNull(), // Reference to original LTI launch
  lmsUserId: text("lms_user_id").notNull(), // LMS user ID
  submissionId: varchar("submission_id").notNull().references(() => assignmentSubmissions.id),
  contextId: text("context_id"), // LMS context ID
  attemptNumber: integer("attempt_number"), // Which attempt this viewer session is for
  accessCount: integer("access_count").notNull().default(0), // Track number of times accessed
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }), // Last access timestamp
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // Short-lived (e.g., 1 hour)
  revokedAt: timestamp("revoked_at", { withTimezone: true }), // Manual revocation timestamp
});

// Instruction sets table for grouping instruction flows
export const instructionSets = pgTable("instruction_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  instructionSetCode: text("instruction_set_code").unique(), // Instruction set code for LTI mapping (e.g., TEST, something)
  completionMessage: text("completion_message"), // HTML message shown after file submission
  submissionTitle: text("submission_title"), // Customizable title for completion screen
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Instruction steps table for configurable LTI flow
export const instructionSteps = pgTable("instruction_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  instructionSetId: varchar("instruction_set_id").references(() => instructionSets.id, { onDelete: 'cascade' }),
  stepNumber: text("step_number").notNull(), // e.g., "1", "2", "3"
  title: text("title").notNull(),
  content: text("content").notNull(),
  stepType: instructionStepTypeEnum("step_type").notNull().default("info"),
  checkboxItems: text("checkbox_items").array(), // For checkbox type steps
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// User instruction agreements table - tracks EULA and checkbox agreements for audit purposes
export const userInstructionAgreements = pgTable("user_instruction_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentSubmissionId: varchar("assignment_submission_id").references(() => assignmentSubmissions.id, { onDelete: 'cascade' }),
  instructionSetId: varchar("instruction_set_id").references(() => instructionSets.id, { onDelete: 'cascade' }),
  // Agreement tracking timestamps
  stepAgreementAt: timestamp("step_agreement_at", { withTimezone: true }), // When user agreed to declaration checkboxes
  turnitinAgreementAt: timestamp("turnitin_agreement_at", { withTimezone: true }), // When user agreed to TurnItIn EULA
  finalSubmissionAt: timestamp("final_submission_at", { withTimezone: true }), // When user completed final submission
  // Metadata
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Course nodes table - hierarchical structure for course organization
export const courseNodes: any = pgTable("course_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});


// Assessments table - individual assessments within course nodes
export const assessments = pgTable("assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseNodeId: varchar("course_node_id").references(() => courseNodes.id, { onDelete: 'cascade' }),
  instructionSetId: varchar("instruction_set_id").references(() => instructionSets.id),
  assessmentId: text("assessment_id").notNull().unique().default(sql`'ASS_' || substr(gen_random_uuid()::text, 1, 8)`), // Auto-generated internal ID
  code: text("code").notNull().unique(), // e.g., "3CO02_25_PQA1"
  name: text("name").notNull(),
  description: text("description"),
  type: assessmentTypeEnum("type").notNull().default("summative"),
  status: assessmentStatusEnum("status").notNull().default("active"),
  eligibilityPrerequisites: text("eligibility_prerequisites").array(), // Array of assessment IDs that must be completed first
  totalMarks: integer("total_marks").notNull().default(0),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Assessment sections table - sections within an assessment for marking
export const assessmentSections = pgTable("assessment_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").references(() => assessments.id, { onDelete: 'cascade' }),
  type: text("type"), // Section type (e.g., text_area, multiple_choice)
  questionText: text("question_text"), // The actual question/instruction text for this section
  order: integer("order").notNull(),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Marking options for each section
export const sectionMarkingOptions = pgTable("section_marking_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: varchar("section_id").references(() => assessmentSections.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  marks: integer("marks").notNull(),
  order: integer("order").notNull(),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Grade boundaries for assessments
export const assessmentGradeBoundaries = pgTable("assessment_grade_boundaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assessmentId: varchar("assessment_id").references(() => assessments.id, { onDelete: 'cascade' }),
  gradeLabel: text("grade_label").notNull(),
  marksFrom: integer("marks_from").notNull(),
  marksTo: integer("marks_to").notNull(),
  isPass: boolean("is_pass").notNull().default(false),
  order: integer("order").notNull(),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Submission section marks - stores grades and feedback for each assessment section
export const submissionSectionMarks = pgTable("submission_section_marks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").references(() => assignmentSubmissions.id, { onDelete: 'cascade' }),
  sectionId: varchar("section_id").references(() => assessmentSections.id, { onDelete: 'cascade' }),
  markerId: varchar("marker_id").references(() => users.id),
  selectedOptionId: varchar("selected_option_id"),
  feedback: text("feedback"),
  marksAwarded: real("marks_awarded").default(0),
  markingCriterias: jsonb("marking_criterias"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Submission overall grades - stores final grades and additional marking data
export const submissionGrades = pgTable("submission_grades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").references(() => assignmentSubmissions.id, { onDelete: 'cascade' }).unique(),
  assessmentId: varchar("assessment_id").references(() => assessments.id, { onDelete: 'cascade' }),
  markerId: varchar("marker_id").references(() => users.id),
  totalMarksAwarded: real("total_marks_awarded").default(0),
  totalMarksPossible: real("total_marks_possible").default(0),
  percentageScore: real("percentage_score").default(0),
  finalGrade: text("final_grade"), // e.g., "Pass", "High Pass", "Refer", etc.
  overallSummary: text("overall_summary"), // General feedback for the submission
  skipReasonId: varchar("skip_reason_id").references(() => skipReasons.id),
  skippedReason: text("skipped_reason"),
  malpracticeLevelId: varchar("malpractice_level_id").references(() => malpracticeLevels.id),
  malpracticeNotes: text("malpractice_notes"),
  wordCount: integer("word_count"),
  isComplete: boolean("is_complete").default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Skip reasons - predefined reasons for skipping marking an assessment
export const skipReasons = pgTable("skip_reasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reasonText: text("reason_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Malpractice levels - predefined levels for malpractice detection
export const malpracticeLevels = pgTable("malpractice_levels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  levelText: text("level_text").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Malpractice enforcement records - tracks malpractice rules applied at student-assessment level
export const malpracticeEnforcements = pgTable("malpractice_enforcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lmsUserId: text("lms_user_id").notNull(),
  customAssessmentCode: text("custom_assessment_code").notNull(),
  contextId: text("context_id"),
  contextTitle: text("context_title"),
  malpracticeLevelId: varchar("malpractice_level_id").references(() => malpracticeLevels.id).notNull(),
  submissionId: varchar("submission_id").references(() => assignmentSubmissions.id),
  attemptNumber: integer("attempt_number"),
  enforcedMaxAttempts: integer("enforced_max_attempts"),
  ruleAppliedBy: varchar("rule_applied_by").references(() => users.id).notNull(),
  ruleAppliedAt: timestamp("rule_applied_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  settingsUpdates: many(systemSettings),
  markingAssignments: many(submissionMarkingAssignments)
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id]
  })
}));

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [systemSettings.updatedBy],
    references: [users.id]
  })
}));



export const ltiSessionRecordsRelations = relations(ltiSessionRecords, ({ many }) => ({
  submissions: many(assignmentSubmissions)
}));

export const assignmentSubmissionsRelations = relations(assignmentSubmissions, ({ one, many }) => ({
  ltiLaunch: one(ltiLaunchSessions, {
    fields: [assignmentSubmissions.ltiLaunchId],
    references: [ltiLaunchSessions.launchId]
  }),
  ltiSessionRecord: one(ltiSessionRecords, {
    fields: [assignmentSubmissions.ltiSessionRecordId],
    references: [ltiSessionRecords.id]
  }),
  files: many(submissionFiles),
  markingAssignment: one(submissionMarkingAssignments, {
    fields: [assignmentSubmissions.id],
    references: [submissionMarkingAssignments.submissionId]
  })
}));

export const submissionMarkingAssignmentsRelations = relations(submissionMarkingAssignments, ({ one }) => ({
  submission: one(assignmentSubmissions, {
    fields: [submissionMarkingAssignments.submissionId],
    references: [assignmentSubmissions.id]
  }),
  assignedMarker: one(users, {
    fields: [submissionMarkingAssignments.assignedMarkerId],
    references: [users.id]
  }),
  statusUpdatedByUser: one(users, {
    fields: [submissionMarkingAssignments.statusUpdatedBy],
    references: [users.id]
  })
}));

export const submissionFilesRelations = relations(submissionFiles, ({ one }) => ({
  submission: one(assignmentSubmissions, {
    fields: [submissionFiles.submissionId],
    references: [assignmentSubmissions.id]
  })
}));

export const ltiLaunchSessionsRelations = relations(ltiLaunchSessions, ({ many }) => ({
  submissions: many(assignmentSubmissions)
}));

export const instructionSetsRelations = relations(instructionSets, ({ many }) => ({
  steps: many(instructionSteps),
  userAgreements: many(userInstructionAgreements)
}));

export const instructionStepsRelations = relations(instructionSteps, ({ one }) => ({
  instructionSet: one(instructionSets, {
    fields: [instructionSteps.instructionSetId],
    references: [instructionSets.id]
  })
}));

export const userInstructionAgreementsRelations = relations(userInstructionAgreements, ({ one }) => ({
  instructionSet: one(instructionSets, {
    fields: [userInstructionAgreements.instructionSetId],
    references: [instructionSets.id]
  })
}));

export const courseNodesRelations = relations(courseNodes, ({ one, many }) => ({
  parent: one(courseNodes, {
    fields: [courseNodes.parentId],
    references: [courseNodes.id],
    relationName: "courseNodeHierarchy"
  }),
  children: many(courseNodes, {
    relationName: "courseNodeHierarchy"
  }),
  assessments: many(assessments)
}));


export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  courseNode: one(courseNodes, {
    fields: [assessments.courseNodeId],
    references: [courseNodes.id]
  }),
  instructionSet: one(instructionSets, {
    fields: [assessments.instructionSetId],
    references: [instructionSets.id]
  }),
  sections: many(assessmentSections),
  gradeBoundaries: many(assessmentGradeBoundaries)
}));

export const assessmentSectionsRelations = relations(assessmentSections, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [assessmentSections.assessmentId],
    references: [assessments.id]
  }),
  markingOptions: many(sectionMarkingOptions)
}));

export const sectionMarkingOptionsRelations = relations(sectionMarkingOptions, ({ one }) => ({
  section: one(assessmentSections, {
    fields: [sectionMarkingOptions.sectionId],
    references: [assessmentSections.id]
  })
}));

export const assessmentGradeBoundariesRelations = relations(assessmentGradeBoundaries, ({ one }) => ({
  assessment: one(assessments, {
    fields: [assessmentGradeBoundaries.assessmentId],
    references: [assessments.id]
  })
}));

export const emailTemplatesRelations = relations(emailTemplates, ({ }) => ({}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  department: true,
  profileImageUrl: true
});

// Simplified schema for creating new users (only email and role required)
export const createUserSchema = createInsertSchema(users).pick({
  email: true,
  role: true,
});

// Profile update schema - allows editing name and password, email is locked
export const updateProfileSchema = createInsertSchema(users).pick({
  firstName: true,
  lastName: true,
  password: true,
}).partial();

// Admin user edit schema - allows admins to edit user info (excludes email, username, password)
export const adminEditUserSchema = createInsertSchema(users).pick({
  firstName: true,
  lastName: true,
  role: true,
  status: true,
}).partial();

// Password change schema with current password verification
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Password confirmation is required")
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Forgot password request schema
export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address")
});

// Reset password schema
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Password confirmation is required")
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).pick({
  key: true,
  value: true,
  description: true
});


export const insertUserSessionSchema = createInsertSchema(userSessions).pick({
  userId: true,
  sessionToken: true,
  expiresAt: true
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).pick({
  userId: true,
  token: true,
  expiresAt: true,
  used: true
});

export const insertApiKeySchema = createInsertSchema(apiKeys).pick({
  keyIdentifier: true,
  keyHash: true,
  name: true,
  description: true,
  isActive: true,
  expiresAt: true,
  createdBy: true
});

export const insertLtiSessionRecordSchema = createInsertSchema(ltiSessionRecords).pick({
  launchId: true,
  lmsUserId: true,
  consumerName: true,
  role: true,
  firstName: true,
  lastName: true,
  fullName: true,
  email: true,
  customAction: true,
  customInstructionSet: true,
  customAssessmentCode: true,
  contextType: true,
  contextTitle: true,
  resourceLinkId: true,
  resourceLinkTitle: true,
  contextId: true,
  consumerKey: true,
  toolConsumerInstanceGuid: true,
  returnUrl: true,
  hasFileSubmission: true,
  sessionExpiry: true
});

export const insertAssignmentSubmissionSchema = createInsertSchema(assignmentSubmissions).pick({
  ltiSessionRecordId: true,
  ltiLaunchId: true,
  fileCount: true,
  totalFileSize: true,
  attemptNumber: true,
  // LTI fields
  lmsUserId: true,
  consumerName: true,
  role: true,
  firstName: true,
  lastName: true,
  fullName: true,
  email: true,
  customAction: true,
  customInstructionSet: true,
  customAssessmentCode: true,
  contextType: true,
  contextTitle: true,
  contextId: true
});

export const insertSubmissionMarkingAssignmentSchema = createInsertSchema(submissionMarkingAssignments).pick({
  submissionId: true,
  assignedMarkerId: true,
  markingStatus: true,
  notes: true,
  holdReason: true,
  priority: true,
  dueDate: true,
  statusUpdatedBy: true,
  statusUpdatedAt: true
});

export const insertSubmissionFileSchema = createInsertSchema(submissionFiles).pick({
  submissionId: true,
  fileName: true,
  originalFileName: true,
  fileSize: true,
  fileType: true,
  fileMimeType: true,
  fileUrl: true,
  azureBlobUrl: true,
  azureContainerName: true,
  azureBlobName: true,
  uploadOrder: true,
  submissionFileType: true,
  uploadedBy: true,
  turnitinSubmissionId: true,
  turnitinStatus: true,
  turnitinSimilarityScore: true,
  turnitinReportUrl: true,
  turnitinProcessedAt: true,
  turnitinErrorMessage: true
});

export const insertLtiViewerSessionSchema = createInsertSchema(ltiViewerSessions).pick({
  viewerToken: true,
  launchId: true,
  lmsUserId: true,
  submissionId: true,
  contextId: true,
  attemptNumber: true,
  expiresAt: true,
});

export const insertLtiLaunchSessionSchema = createInsertSchema(ltiLaunchSessions).pick({
  launchId: true,
  consumerKey: true,
  userId: true,
  userEmail: true,
  userName: true,
  courseName: true,
  returnUrl: true,
  resourceLinkId: true,
  contextId: true,
  toolConsumerInstanceGuid: true,
  customParams: true,
  ltiMessageType: true,
  contextType: true,
  contextTitle: true,
  roles: true,
  lisPersonNameGiven: true,
  lisPersonNameFamily: true,
  lisPersonNameFull: true,
  lisPersonContactEmailPrimary: true,
  toolConsumerInstanceName: true,
  customAction: true,
  assignmentTitle: true,
  customInstructionSet: true,
  customAssessmentCode: true,
  expiresAt: true
});

export const insertInstructionSetSchema = createInsertSchema(instructionSets).pick({
  name: true,
  description: true,
  slug: true,
  completionMessage: true,
  isActive: true
});

export const insertInstructionStepSchema = createInsertSchema(instructionSteps).pick({
  instructionSetId: true,
  stepNumber: true,
  title: true,
  content: true,
  stepType: true,
  checkboxItems: true,
  isActive: true
});

export const insertUserInstructionAgreementSchema = createInsertSchema(userInstructionAgreements).pick({
  assignmentSubmissionId: true,
  instructionSetId: true,
  stepAgreementAt: true,
  turnitinAgreementAt: true,
  finalSubmissionAt: true
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).pick({
  templateKey: true,
  hubspotEmailId: true,
  templateName: true,
  description: true,
  subject: true,
  htmlContent: true,
  isActive: true
});


export const insertCourseNodeSchema = createInsertSchema(courseNodes).pick({
  name: true,
  parentId: true,
  isActive: true
});

export const insertAssessmentSchema = createInsertSchema(assessments).pick({
  courseNodeId: true,
  instructionSetId: true,
  code: true,
  name: true,
  description: true,
  status: true,
  eligibilityPrerequisites: true,
  isActive: true
});

export const insertAssessmentSectionSchema = createInsertSchema(assessmentSections).pick({
  assessmentId: true,
  questionText: true,
  order: true,
  isActive: true
});

export const insertSectionMarkingOptionSchema = createInsertSchema(sectionMarkingOptions).pick({
  sectionId: true,
  label: true,
  marks: true,
  order: true,
  isActive: true
});

export const insertAssessmentGradeBoundarySchema = createInsertSchema(assessmentGradeBoundaries).pick({
  assessmentId: true,
  gradeLabel: true,
  marksFrom: true,
  marksTo: true,
  isPass: true,
  order: true,
  isActive: true
});

export const insertSubmissionSectionMarkSchema = createInsertSchema(submissionSectionMarks).pick({
  submissionId: true,
  sectionId: true,
  markerId: true,
  selectedOptionId: true,
  feedback: true,
  marksAwarded: true
});

export const insertSubmissionGradeSchema = createInsertSchema(submissionGrades).pick({
  submissionId: true,
  assessmentId: true,
  markerId: true,
  totalMarksAwarded: true,
  totalMarksPossible: true,
  percentageScore: true,
  finalGrade: true,
  overallSummary: true,
  skipReasonId: true,
  skippedReason: true,
  malpracticeLevelId: true,
  malpracticeNotes: true,
  wordCount: true,
  isComplete: true,
  completedAt: true
});

export const insertSkipReasonSchema = createInsertSchema(skipReasons).pick({
  reasonText: true,
  isActive: true
});

export const insertMalpracticeLevelSchema = createInsertSchema(malpracticeLevels).pick({
  levelText: true,
  description: true,
  isActive: true
});

export const insertMalpracticeEnforcementSchema = createInsertSchema(malpracticeEnforcements).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type AdminEditUser = z.infer<typeof adminEditUserSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type User = typeof users.$inferSelect;
export type UserRole = typeof users.$inferSelect.role;
export type UserStatus = typeof users.$inferSelect.status;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type ForgotPassword = z.infer<typeof forgotPasswordSchema>;
export type ResetPassword = z.infer<typeof resetPasswordSchema>;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export type InsertLtiSessionRecord = z.infer<typeof insertLtiSessionRecordSchema>;
export type LtiSessionRecord = typeof ltiSessionRecords.$inferSelect;
export type InsertAssignmentSubmission = z.infer<typeof insertAssignmentSubmissionSchema>;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type InsertSubmissionMarkingAssignment = z.infer<typeof insertSubmissionMarkingAssignmentSchema>;
export type SubmissionMarkingAssignment = typeof submissionMarkingAssignments.$inferSelect;
export type MarkingStatus = typeof submissionMarkingAssignments.$inferSelect.markingStatus;
export type InsertSubmissionFile = z.infer<typeof insertSubmissionFileSchema>;
export type SubmissionFile = typeof submissionFiles.$inferSelect;
export type SubmissionFileType = typeof submissionFiles.$inferSelect.submissionFileType;
export type InsertLtiViewerSession = z.infer<typeof insertLtiViewerSessionSchema>;
export type LtiViewerSession = typeof ltiViewerSessions.$inferSelect;
export type InsertLtiLaunchSession = z.infer<typeof insertLtiLaunchSessionSchema>;
export type LtiLaunchSession = typeof ltiLaunchSessions.$inferSelect;
export type InsertInstructionSet = z.infer<typeof insertInstructionSetSchema>;
export type InstructionSet = typeof instructionSets.$inferSelect;
export type InsertInstructionStep = z.infer<typeof insertInstructionStepSchema>;
export type InstructionStep = typeof instructionSteps.$inferSelect;
export type InstructionStepType = typeof instructionSteps.$inferSelect.stepType;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertCourseNode = z.infer<typeof insertCourseNodeSchema>;
export type CourseNode = typeof courseNodes.$inferSelect;
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Assessment = typeof assessments.$inferSelect;
export type AssessmentStatus = typeof assessments.$inferSelect.status;
export type AssessmentType = typeof assessments.$inferSelect.type;
export type InsertAssessmentSection = z.infer<typeof insertAssessmentSectionSchema>;
export type AssessmentSection = typeof assessmentSections.$inferSelect;
export type InsertSectionMarkingOption = z.infer<typeof insertSectionMarkingOptionSchema>;
export type SectionMarkingOption = typeof sectionMarkingOptions.$inferSelect;
export type InsertAssessmentGradeBoundary = z.infer<typeof insertAssessmentGradeBoundarySchema>;
export type AssessmentGradeBoundary = typeof assessmentGradeBoundaries.$inferSelect;
export type InsertUserInstructionAgreement = z.infer<typeof insertUserInstructionAgreementSchema>;
export type UserInstructionAgreement = typeof userInstructionAgreements.$inferSelect;
export type InsertSubmissionSectionMark = z.infer<typeof insertSubmissionSectionMarkSchema>;
export type SubmissionSectionMark = typeof submissionSectionMarks.$inferSelect;
export type InsertSubmissionGrade = z.infer<typeof insertSubmissionGradeSchema>;
export type SubmissionGrade = typeof submissionGrades.$inferSelect;
export type InsertSkipReason = z.infer<typeof insertSkipReasonSchema>;
export type SkipReason = typeof skipReasons.$inferSelect;
export type InsertMalpracticeLevel = z.infer<typeof insertMalpracticeLevelSchema>;
export type MalpracticeLevel = typeof malpracticeLevels.$inferSelect;
export type InsertMalpracticeEnforcement = z.infer<typeof insertMalpracticeEnforcementSchema>;
export type MalpracticeEnforcement = typeof malpracticeEnforcements.$inferSelect;


// TurnItIn EULA acceptances types
export const insertTurnitinEulaAcceptanceSchema = createInsertSchema(turnitinEulaAcceptances);
export type InsertTurnitinEulaAcceptance = z.infer<typeof insertTurnitinEulaAcceptanceSchema>;
export type TurnitinEulaAcceptance = typeof turnitinEulaAcceptances.$inferSelect;

// Role hierarchy for permission checking
export const roleHierarchy: Record<UserRole, number> = {
  superadmin: 6,
  admin: 5,
  marker: 3,
  tutor: 3,
  iqa: 3,
  student: 1
};
