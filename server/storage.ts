import { 
  users, 
  systemSettings,
  userSessions,
  passwordResetTokens,
  apiKeys,
  assignmentSubmissions,
  submissionMarkingAssignments,
  submissionFiles,
  ltiLaunchSessions,
  ltiSessionRecords,
  ltiViewerSessions,
  instructionSets,
  instructionSteps,
  userInstructionAgreements,
  emailTemplates,
  courseNodes,
  assessments,
  assessmentSections,
  sectionMarkingOptions,
  assessmentGradeBoundaries,
  submissionSectionMarks,
  submissionGrades,
  skipReasons,
  malpracticeLevels,
  malpracticeEnforcements,
  type User, 
  type InsertUser, 
  type SystemSetting,
  type InsertSystemSetting,
  type UserSession,
  type InsertUserSession,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type ApiKey,
  type InsertApiKey,
  type UserRole,
  type LtiSessionRecord,
  type InsertLtiSessionRecord,
  type AssignmentSubmission,
  type InsertAssignmentSubmission,
  type SubmissionMarkingAssignment,
  type InsertSubmissionMarkingAssignment,
  type MarkingStatus,
  type SubmissionFile,
  type InsertSubmissionFile,
  type LtiLaunchSession,
  type InsertLtiLaunchSession,
  type LtiViewerSession,
  type InsertLtiViewerSession,
  type InstructionSet,
  type InsertInstructionSet,
  type InstructionStep,
  type InsertInstructionStep,
  type UserInstructionAgreement,
  type InsertUserInstructionAgreement,
  type EmailTemplate,
  type InsertEmailTemplate,
  type CourseNode,
  type InsertCourseNode,
  type Assessment,
  type InsertAssessment,
  type AssessmentSection,
  type InsertAssessmentSection,
  type SectionMarkingOption,
  type InsertSectionMarkingOption,
  type AssessmentGradeBoundary,
  type InsertAssessmentGradeBoundary,
  type SubmissionSectionMark,
  type InsertSubmissionSectionMark,
  type SubmissionGrade,
  type InsertSubmissionGrade,
  type SkipReason,
  type InsertSkipReason,
  type MalpracticeLevel,
  type InsertMalpracticeLevel,
  type MalpracticeEnforcement,
  type InsertMalpracticeEnforcement
} from "@shared/schema";
import { db } from "./db";
import { eq, like, ilike, and, or, desc, isNull, sql, gt, lt } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(filters?: {
    search?: string;
    role?: UserRole;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: User[]; total: number }>;
  getUserStatistics(): Promise<{
    totalUsers: number;
    activeStudents: number;
    instructors: number;
    admins: number;
  }>;
  
  // Session operations
  createSession(session: InsertUserSession): Promise<UserSession>;
  getSessionByToken(token: string): Promise<UserSession | undefined>;
  deleteSession(token: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  
  // Password reset token operations
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenAsUsed(token: string): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<void>;
  
  // API key operations
  getApiKeyByIdentifier(keyIdentifier: string): Promise<ApiKey | undefined>;
  getApiKeyById(id: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKey(id: string, apiKey: Partial<InsertApiKey>): Promise<ApiKey>;
  updateApiKeyLastUsedAt(keyIdentifier: string): Promise<void>;
  deleteApiKey(id: string): Promise<void>;
  getAllApiKeys(): Promise<ApiKey[]>;
  
  // System settings operations
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  getAllSystemSettings(): Promise<SystemSetting[]>;
  upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting>;
  deleteSystemSetting(key: string): Promise<void>;


  
  // Assignment submission operations - simplified for LTI-only usage
  createSubmission(submission: InsertAssignmentSubmission): Promise<AssignmentSubmission>;
  updateSubmission(id: string, submissionData: Partial<InsertAssignmentSubmission>): Promise<AssignmentSubmission>;
  getSubmission(id: string): Promise<AssignmentSubmission | undefined>;
  getSubmissionsByLtiLaunch(ltiLaunchId: string): Promise<AssignmentSubmission[]>;
  getSubmissionByLtiStudent(lmsUserId: string): Promise<AssignmentSubmission[]>;
  getSubmissionsByUserAndAssessment(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<(AssignmentSubmission & { markingAssignment?: SubmissionMarkingAssignment | null, grade?: SubmissionGrade | null, malpracticeLevel?: MalpracticeLevel | null, skipReason?: SkipReason | null })[]>;
  countSubmissionAttempts(lmsUserId: string, customAssessmentCode: string, contextId: string | null, contextTitle: string | null): Promise<number>;
  hasUnmarkedPreviousSubmission(lmsUserId: string, customAssessmentCode: string, contextId: string | null, contextTitle: string | null): Promise<{hasUnmarked: boolean; submissionId?: string; status?: string}>;
  
  // Submission marking assignment operations
  createMarkingAssignment(assignment: InsertSubmissionMarkingAssignment): Promise<SubmissionMarkingAssignment>;
  getMarkingAssignment(submissionId: string): Promise<SubmissionMarkingAssignment | undefined>;
  getMarkingAssignmentsForMarker(markerId: string, status?: MarkingStatus): Promise<(SubmissionMarkingAssignment & { submission: AssignmentSubmission })[]>;
  getAllMarkingAssignments(filters?: {
    status?: MarkingStatus;
    markerId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ assignments: (SubmissionMarkingAssignment & { submission: AssignmentSubmission, assignedMarker?: User })[], nextCursor: string | null }>;
  getAllMarkingAssignmentsWithOffset(filters?: {
    status?: MarkingStatus;
    markerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ assignments: (SubmissionMarkingAssignment & { submission: AssignmentSubmission, assignedMarker?: User, turnitinStatus?: string, grade?: SubmissionGrade | null, malpracticeLevel?: MalpracticeLevel | null, skipReason?: SkipReason | null })[], total: number, page: number, totalPages: number }>;
  updateMarkingAssignmentStatus(submissionId: string, status: MarkingStatus, updatedBy: string, notes?: string): Promise<SubmissionMarkingAssignment>;
  assignMarkerToSubmission(submissionId: string, markerId: string, assignedBy: string): Promise<SubmissionMarkingAssignment>;
  unassignMarkerFromSubmission(submissionId: string, unassignedBy: string): Promise<SubmissionMarkingAssignment>;
  
  // Submission files operations
  createSubmissionFile(submissionFile: InsertSubmissionFile): Promise<SubmissionFile>;
  createMultipleSubmissionFiles(submissionFileList: InsertSubmissionFile[]): Promise<SubmissionFile[]>;
  getSubmissionFiles(submissionId: string): Promise<SubmissionFile[]>;
  getSubmissionFile(fileId: string): Promise<SubmissionFile | undefined>;
  updateSubmissionFile(fileId: string, fileData: Partial<InsertSubmissionFile>): Promise<SubmissionFile>;
  deleteSubmissionFile(fileId: string): Promise<void>;
  getSubmissionWithFiles(submissionId: string): Promise<{ submission: AssignmentSubmission | undefined; files: SubmissionFile[] }>;
  
  // LTI operations
  createLtiLaunchSession(session: InsertLtiLaunchSession): Promise<LtiLaunchSession>;
  getLtiLaunchSession(launchId: string): Promise<LtiLaunchSession | undefined>;
  updateLtiLaunchSession(launchId: string, session: Partial<InsertLtiLaunchSession>): Promise<LtiLaunchSession>;
  deleteLtiLaunchSession(launchId: string): Promise<void>;
  
  // LTI Viewer Sessions - secure token-based viewing
  createLtiViewerSession(session: InsertLtiViewerSession): Promise<LtiViewerSession>;
  getLtiViewerSessionByToken(viewerToken: string): Promise<LtiViewerSession | undefined>;
  updateLtiViewerSession(id: string, updates: Partial<InsertLtiViewerSession>): Promise<LtiViewerSession>;
  incrementViewerSessionAccess(id: string): Promise<void>;
  revokeLtiViewerSession(id: string): Promise<void>;
  cleanupExpiredViewerSessions(): Promise<number>;
  
  // LTI Session Records - foolproof session tracking
  createLtiSessionRecord(record: InsertLtiSessionRecord): Promise<LtiSessionRecord>;
  getLtiSessionRecord(launchId: string): Promise<LtiSessionRecord | undefined>;
  getLtiSessionRecordById(id: string): Promise<LtiSessionRecord | undefined>;
  updateLtiSessionRecord(launchId: string, updates: Partial<InsertLtiSessionRecord>): Promise<LtiSessionRecord>;
  markSessionWithFileSubmission(launchId: string): Promise<void>;
  
  // Instruction sets operations
  getAllInstructionSets(): Promise<InstructionSet[]>;
  getInstructionSet(id: string): Promise<InstructionSet | undefined>;
  getInstructionSetBySlug(slug: string): Promise<InstructionSet | undefined>;
  createInstructionSet(instructionSet: InsertInstructionSet): Promise<InstructionSet>;
  updateInstructionSet(id: string, instructionSet: Partial<InsertInstructionSet>): Promise<InstructionSet>;
  deleteInstructionSet(id: string): Promise<void>;

  // Instruction steps operations
  createInstructionStep(step: InsertInstructionStep): Promise<InstructionStep>;
  getInstructionSetByCode(code: string): Promise<InstructionSet | undefined>;
  getInstructionStep(id: string): Promise<InstructionStep | undefined>;
  getAllInstructionSteps(): Promise<InstructionStep[]>;
  getInstructionStepsBySet(instructionSetId: string): Promise<InstructionStep[]>;
  updateInstructionStep(id: string, step: Partial<InsertInstructionStep>): Promise<InstructionStep>;
  deleteInstructionStep(id: string): Promise<void>;
  deleteInstructionStepsBySet(instructionSetId: string): Promise<void>;
  upsertInstructionStep(step: InsertInstructionStep & { id?: string }): Promise<InstructionStep>;

  // Email template operations
  getAllEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: string): Promise<EmailTemplate | undefined>;
  getEmailTemplateByKey(templateKey: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, template: Partial<InsertEmailTemplate>): Promise<EmailTemplate>;
  deleteEmailTemplate(id: string): Promise<void>;

  // Skip reason operations
  getAllSkipReasons(): Promise<SkipReason[]>;
  getSkipReason(id: string): Promise<SkipReason | undefined>;
  createSkipReason(skipReason: InsertSkipReason): Promise<SkipReason>;
  updateSkipReason(id: string, skipReason: Partial<InsertSkipReason>): Promise<SkipReason>;
  deleteSkipReason(id: string): Promise<void>;
  reorderSkipReasons(orderedIds: string[]): Promise<void>;

  // Malpractice level operations
  getAllMalpracticeLevels(): Promise<MalpracticeLevel[]>;
  getMalpracticeLevel(id: string): Promise<MalpracticeLevel | undefined>;
  createMalpracticeLevel(malpracticeLevel: InsertMalpracticeLevel): Promise<MalpracticeLevel>;
  updateMalpracticeLevel(id: string, malpracticeLevel: Partial<InsertMalpracticeLevel>): Promise<MalpracticeLevel>;
  deleteMalpracticeLevel(id: string): Promise<void>;
  reorderMalpracticeLevels(orderedIds: string[]): Promise<void>;

  // Malpractice enforcement operations
  createMalpracticeEnforcement(enforcement: InsertMalpracticeEnforcement): Promise<MalpracticeEnforcement>;
  getMalpracticeEnforcement(lmsUserId: string, customAssessmentCode: string, contextId: string | null, contextTitle: string | null): Promise<MalpracticeEnforcement | undefined>;
  getActiveMalpracticeEnforcement(lmsUserId: string, customAssessmentCode: string, contextId: string | null, contextTitle: string | null): Promise<MalpracticeEnforcement | undefined>;
  getMalpracticeEnforcementBySubmission(submissionId: string): Promise<MalpracticeEnforcement | undefined>;
  updateMalpracticeEnforcement(id: string, enforcement: Partial<InsertMalpracticeEnforcement>): Promise<MalpracticeEnforcement>;

  // Assessment operations
  getAllAssessments(): Promise<Assessment[]>;
  getAssessment(id: string): Promise<Assessment | undefined>;
  getAssessmentsByCode(code: string): Promise<Assessment | undefined>;
  getAssessmentsByCourseNode(courseNodeId: string): Promise<Assessment[]>;
  createAssessment(assessment: InsertAssessment): Promise<Assessment>;
  updateAssessment(id: string, assessment: Partial<InsertAssessment>): Promise<Assessment>;
  deleteAssessment(id: string): Promise<void>;
  cloneAssessment(id: string): Promise<Assessment>;

  // Assessment Section operations
  getAssessmentSections(assessmentId: string): Promise<AssessmentSection[]>;
  createAssessmentSection(section: InsertAssessmentSection): Promise<AssessmentSection>;
  updateAssessmentSection(id: string, section: Partial<InsertAssessmentSection>): Promise<AssessmentSection>;
  deleteAssessmentSection(id: string): Promise<void>;
  cloneAssessmentSection(id: string): Promise<AssessmentSection>;
  reorderAssessmentSections(assessmentId: string, sectionIds: string[]): Promise<void>;

  // Section Marking Option operations  
  getSectionMarkingOptions(sectionId: string): Promise<SectionMarkingOption[]>;
  createSectionMarkingOption(option: InsertSectionMarkingOption): Promise<SectionMarkingOption>;
  updateSectionMarkingOption(id: string, option: Partial<InsertSectionMarkingOption>): Promise<SectionMarkingOption>;
  deleteSectionMarkingOption(id: string): Promise<void>;
  reorderSectionMarkingOptions(sectionId: string, optionIds: string[]): Promise<void>;

  // Assessment Grade Boundary operations
  getAssessmentGradeBoundaries(assessmentId: string): Promise<AssessmentGradeBoundary[]>;
  createAssessmentGradeBoundary(boundary: InsertAssessmentGradeBoundary): Promise<AssessmentGradeBoundary>;
  updateAssessmentGradeBoundary(id: string, boundary: Partial<InsertAssessmentGradeBoundary>): Promise<AssessmentGradeBoundary>;
  deleteAssessmentGradeBoundary(id: string): Promise<void>;
  reorderAssessmentGradeBoundaries(assessmentId: string, boundaryIds: string[]): Promise<void>;

  // User instruction agreement operations - for audit tracking
  createUserInstructionAgreement(agreement: InsertUserInstructionAgreement): Promise<UserInstructionAgreement>;
  getUserInstructionAgreementBySubmission(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement | undefined>;
  updateUserInstructionAgreement(id: string, agreement: Partial<InsertUserInstructionAgreement>): Promise<UserInstructionAgreement>;
  upsertUserInstructionAgreement(agreement: InsertUserInstructionAgreement): Promise<UserInstructionAgreement>;
  updateStepAgreement(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement>;
  updateTurnitinAgreement(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement>;
  markFinalSubmission(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement>;
  getAssignmentSubmissionByLtiLaunchId(ltiLaunchId: string): Promise<AssignmentSubmission | undefined>;
  getOrCreatePlaceholderSubmission(ltiLaunchId: string): Promise<AssignmentSubmission>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(filters?: {
    search?: string;
    role?: UserRole;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: User[]; total: number }> {
    const conditions = [];
    
    if (filters?.search) {
      const searchCondition = or(
        like(users.firstName, `%${filters.search}%`),
        like(users.lastName, `%${filters.search}%`),
        like(users.email, `%${filters.search}%`),
        like(users.username, `%${filters.search}%`)
      );
      conditions.push(searchCondition);
    }
    
    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }
    
    if (filters?.status) {
      conditions.push(eq(users.status, filters.status as any));
    }
    
    // Build the base query
    let query: any = db.select().from(users);
    let countQuery: any = db.select().from(users);
    
    if (conditions.length > 0) {
      const whereCondition = and(...conditions);
      query = query.where(whereCondition);
      countQuery = countQuery.where(whereCondition);
    }
    
    // Add ordering and pagination
    query = query.orderBy(desc(users.createdAt));
    
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }
    
    const [usersResult, totalResult] = await Promise.all([
      query,
      countQuery
    ]);
    
    return {
      users: usersResult,
      total: totalResult.length
    };
  }

  async getUserStatistics(): Promise<{
    totalUsers: number;
    activeStudents: number;
    instructors: number;
    admins: number;
  }> {
    // Get all users count
    const totalUsers = await db.select().from(users);
    
    // Get active students (role = 'student' and status = 'active')
    const activeStudents = await db
      .select()
      .from(users)
      .where(and(eq(users.role, 'student'), eq(users.status, 'active')));
    
    // Get instructors (tutors and markers)
    const instructors = await db
      .select()
      .from(users)
      .where(or(eq(users.role, 'tutor'), eq(users.role, 'marker'), eq(users.role, 'iqa')));
    
    // Get admins (admin and superadmin)
    const admins = await db
      .select()
      .from(users)
      .where(or(eq(users.role, 'admin'), eq(users.role, 'superadmin')));
    
    return {
      totalUsers: totalUsers.length,
      activeStudents: activeStudents.length,
      instructors: instructors.length,
      admins: admins.length
    };
  }

  // Session operations
  async createSession(session: InsertUserSession): Promise<UserSession> {
    const [userSession] = await db
      .insert(userSessions)
      .values(session)
      .returning();
    return userSession;
  }

  async getSessionByToken(token: string): Promise<UserSession | undefined> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.sessionToken, token));
    return session || undefined;
  }

  async deleteSession(token: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.sessionToken, token));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
  }

  // Password reset token operations
  async createPasswordResetToken(tokenData: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values(tokenData)
      .returning();
    return token;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken || undefined;
  }

  async markPasswordResetTokenAsUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: "true" })
      .where(eq(passwordResetTokens.token, token));
  }

  async deleteExpiredPasswordResetTokens(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.expiresAt, new Date()));
  }

  // API key operations
  async getApiKeyByIdentifier(keyIdentifier: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyIdentifier, keyIdentifier));
    return apiKey || undefined;
  }

  async getApiKeyById(id: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id));
    return apiKey || undefined;
  }

  async createApiKey(apiKeyData: InsertApiKey): Promise<ApiKey> {
    const [apiKey] = await db
      .insert(apiKeys)
      .values(apiKeyData)
      .returning();
    return apiKey;
  }

  async updateApiKey(id: string, apiKeyData: Partial<InsertApiKey>): Promise<ApiKey> {
    const [apiKey] = await db
      .update(apiKeys)
      .set({ ...apiKeyData, updatedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return apiKey;
  }

  async updateApiKeyLastUsedAt(keyIdentifier: string): Promise<void> {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.keyIdentifier, keyIdentifier));
  }

  async deleteApiKey(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  async getAllApiKeys(): Promise<ApiKey[]> {
    return await db.select().from(apiKeys);
  }

  // System settings operations
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return setting || undefined;
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    return await db.select().from(systemSettings);
  }

  async upsertSystemSetting(setting: InsertSystemSetting): Promise<SystemSetting> {
    const [upsertedSetting] = await db
      .insert(systemSettings)
      .values(setting)
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: setting.value,
          description: setting.description,
          updatedAt: new Date()
        }
      })
      .returning();
    return upsertedSetting;
  }

  async deleteSystemSetting(key: string): Promise<void> {
    await db.delete(systemSettings).where(eq(systemSettings.key, key));
  }




  // Assignment submission operations
  async createSubmission(submission: InsertAssignmentSubmission): Promise<AssignmentSubmission> {
    const [newSubmission] = await db
      .insert(assignmentSubmissions)
      .values(submission)
      .returning();
    return newSubmission;
  }

  async updateSubmission(id: string, submissionData: Partial<InsertAssignmentSubmission>): Promise<AssignmentSubmission> {
    const [updatedSubmission] = await db
      .update(assignmentSubmissions)
      .set(submissionData)
      .where(eq(assignmentSubmissions.id, id))
      .returning();
    return updatedSubmission;
  }

  async getSubmission(id: string): Promise<AssignmentSubmission | undefined> {
    const [submission] = await db.select().from(assignmentSubmissions).where(eq(assignmentSubmissions.id, id));
    return submission || undefined;
  }

  async getSubmissionsByLtiLaunch(ltiLaunchId: string): Promise<AssignmentSubmission[]> {
    return db.select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.ltiLaunchId, ltiLaunchId))
      .orderBy(desc(assignmentSubmissions.submittedAt));
  }

  async getSubmissionByLtiStudent(lmsUserId: string): Promise<AssignmentSubmission[]> {
    return db.select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.lmsUserId, lmsUserId))
      .orderBy(desc(assignmentSubmissions.submittedAt));
  }

  async getSubmissionsByUserAndAssessment(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<(AssignmentSubmission & { markingAssignment?: SubmissionMarkingAssignment | null, grade?: SubmissionGrade | null, malpracticeLevel?: MalpracticeLevel | null, skipReason?: SkipReason | null })[]> {
    const results = await db.select({
      submission: assignmentSubmissions,
      markingAssignment: submissionMarkingAssignments,
      grade: submissionGrades,
      malpracticeLevel: malpracticeLevels,
      skipReason: skipReasons
    })
      .from(assignmentSubmissions)
      .leftJoin(submissionMarkingAssignments, eq(assignmentSubmissions.id, submissionMarkingAssignments.submissionId))
      .leftJoin(submissionGrades, eq(submissionMarkingAssignments.submissionId, submissionGrades.submissionId))
      .leftJoin(malpracticeLevels, eq(submissionGrades.malpracticeLevelId, malpracticeLevels.id))
      .leftJoin(skipReasons, eq(submissionGrades.skipReasonId, skipReasons.id))
      .where(
        and(
          eq(assignmentSubmissions.lmsUserId, lmsUserId),
          eq(assignmentSubmissions.customAssessmentCode, customAssessmentCode),
          eq(assignmentSubmissions.contextId, contextId)
        )
      )
      .orderBy(desc(assignmentSubmissions.submittedAt));
    
    return results.map(result => ({
      ...result.submission,
      markingAssignment: result.markingAssignment,
      grade: result.grade,
      malpracticeLevel: result.malpracticeLevel,
      skipReason: result.skipReason
    }));
  }

  async getAllSubmissionsByUser(lmsUserId: string): Promise<(AssignmentSubmission & { markingAssignment?: SubmissionMarkingAssignment | null, grade?: SubmissionGrade | null, malpracticeLevel?: MalpracticeLevel | null, skipReason?: SkipReason | null })[]> {
    const results = await db.select({
      submission: assignmentSubmissions,
      markingAssignment: submissionMarkingAssignments,
      grade: submissionGrades,
      malpracticeLevel: malpracticeLevels,
      skipReason: skipReasons
    })
      .from(assignmentSubmissions)
      .leftJoin(submissionMarkingAssignments, eq(assignmentSubmissions.id, submissionMarkingAssignments.submissionId))
      .leftJoin(submissionGrades, eq(submissionMarkingAssignments.submissionId, submissionGrades.submissionId))
      .leftJoin(malpracticeLevels, eq(submissionGrades.malpracticeLevelId, malpracticeLevels.id))
      .leftJoin(skipReasons, eq(submissionGrades.skipReasonId, skipReasons.id))
      .where(eq(assignmentSubmissions.lmsUserId, lmsUserId))
      .orderBy(desc(assignmentSubmissions.submittedAt));
    
    return results.map(result => ({
      ...result.submission,
      markingAssignment: result.markingAssignment,
      grade: result.grade,
      malpracticeLevel: result.malpracticeLevel,
      skipReason: result.skipReason
    }));
  }

  async getAllSubmissionsByUserPaginated(
    lmsUserId: string, 
    options: { 
      page?: number; 
      limit?: number; 
      searchQuery?: string;
    } = {}
  ): Promise<{
    submissions: (AssignmentSubmission & { 
      markingAssignment?: SubmissionMarkingAssignment | null, 
      grade?: SubmissionGrade | null, 
      malpracticeLevel?: MalpracticeLevel | null, 
      skipReason?: SkipReason | null 
    })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const offset = (page - 1) * limit;
    const searchQuery = options.searchQuery?.trim();

    // Build where conditions
    // Exclude placeholder submissions (fileCount === 0) - only show submissions with actual files
    const whereConditions = [
      eq(assignmentSubmissions.lmsUserId, lmsUserId),
      gt(assignmentSubmissions.fileCount, 0)
    ];
    
    // Add search condition if query provided
    // Use OR condition to allow B-tree index usage for prefix matches while still supporting middle-word searches
    if (searchQuery) {
      whereConditions.push(
        or(
          ilike(assignmentSubmissions.contextTitle, `${searchQuery}%`),  // Prefix match - can use B-tree index
          ilike(assignmentSubmissions.contextTitle, `% ${searchQuery}%`)  // Word boundary match - for middle words
        )!
      );
    }

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(assignmentSubmissions)
      .where(and(...whereConditions));
    
    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    // Get paginated results with all joins
    const results = await db.select({
      submission: assignmentSubmissions,
      markingAssignment: submissionMarkingAssignments,
      grade: submissionGrades,
      malpracticeLevel: malpracticeLevels,
      skipReason: skipReasons
    })
      .from(assignmentSubmissions)
      .leftJoin(submissionMarkingAssignments, eq(assignmentSubmissions.id, submissionMarkingAssignments.submissionId))
      .leftJoin(submissionGrades, eq(submissionMarkingAssignments.submissionId, submissionGrades.submissionId))
      .leftJoin(malpracticeLevels, eq(submissionGrades.malpracticeLevelId, malpracticeLevels.id))
      .leftJoin(skipReasons, eq(submissionGrades.skipReasonId, skipReasons.id))
      .where(and(...whereConditions))
      .orderBy(desc(assignmentSubmissions.submittedAt))
      .limit(limit)
      .offset(offset);
    
    const submissions = results.map(result => ({
      ...result.submission,
      markingAssignment: result.markingAssignment,
      grade: result.grade,
      malpracticeLevel: result.malpracticeLevel,
      skipReason: result.skipReason
    }));

    return {
      submissions,
      total,
      page,
      limit,
      totalPages
    };
  }

  async countSubmissionAttempts(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<number> {
    // Build WHERE clause to scope attempts by course context using only contextId
    
    // Base conditions: user, assessment code, has files, and matching contextId
    const baseConditions = and(
      eq(assignmentSubmissions.lmsUserId, lmsUserId),
      eq(assignmentSubmissions.customAssessmentCode, customAssessmentCode),
      gt(assignmentSubmissions.fileCount, 0),
      eq(assignmentSubmissions.contextId, contextId)
    );

    // Get all submissions for this user and assessment in this course
    const submissions = await db
      .select({
        id: assignmentSubmissions.id
      })
      .from(assignmentSubmissions)
      .leftJoin(submissionMarkingAssignments, eq(assignmentSubmissions.id, submissionMarkingAssignments.submissionId))
      .where(baseConditions);
    
    // Count only non-skipped submissions
    let validAttempts = 0;
    for (const submission of submissions) {
      const [markingAssignment] = await db
        .select()
        .from(submissionMarkingAssignments)
        .where(eq(submissionMarkingAssignments.submissionId, submission.id));
      
      // Count this attempt unless it's marked as marking_skipped
      if (!markingAssignment || markingAssignment.markingStatus !== 'marking_skipped') {
        validAttempts++;
      }
    }
    
    return validAttempts;
  }

  async hasUnmarkedPreviousSubmission(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<{hasUnmarked: boolean; submissionId?: string; status?: string}> {
    // Build WHERE clause to scope by course context using only contextId
    const baseConditions = and(
      eq(assignmentSubmissions.lmsUserId, lmsUserId),
      eq(assignmentSubmissions.customAssessmentCode, customAssessmentCode),
      gt(assignmentSubmissions.fileCount, 0),
      eq(assignmentSubmissions.contextId, contextId)
    );

    // Get all previous submissions
    const submissions = await db
      .select()
      .from(assignmentSubmissions)
      .where(baseConditions)
      .orderBy(desc(assignmentSubmissions.submittedAt));

    // Check if any submission has marking status that blocks new submissions
    // Completed statuses that don't block: 'marking_skipped', 'released'
    // In-progress statuses that block: 'waiting', 'being_marked', 'on_hold', 'approval_needed'
    for (const submission of submissions) {
      const [markingAssignment] = await db
        .select()
        .from(submissionMarkingAssignments)
        .where(eq(submissionMarkingAssignments.submissionId, submission.id));
      
      if (markingAssignment) {
        // Only block new submissions if the previous submission is in progress or awaiting approval
        const completedStatuses = ['marking_skipped', 'released'];
        if (!completedStatuses.includes(markingAssignment.markingStatus)) {
          return {
            hasUnmarked: true,
            submissionId: submission.id,
            status: markingAssignment.markingStatus
          };
        }
      } else {
        // If no marking assignment exists, treat it as 'waiting' status and block new submissions
        // This can happen if the marking assignment creation failed or hasn't been processed yet
        return {
          hasUnmarked: true,
          submissionId: submission.id,
          status: 'waiting'
        };
      }
    }

    return { hasUnmarked: false };
  }

  async hasPassedInPreviousAttempt(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<{hasPassed: boolean; submissionId?: string; grade?: string; attemptNumber?: number}> {
    // Build WHERE clause to scope by course context
    const baseConditions = and(
      eq(assignmentSubmissions.lmsUserId, lmsUserId),
      eq(assignmentSubmissions.customAssessmentCode, customAssessmentCode),
      gt(assignmentSubmissions.fileCount, 0),
      eq(assignmentSubmissions.contextId, contextId)
    );

    // Get all previous submissions with grades
    const submissions = await db
      .select()
      .from(assignmentSubmissions)
      .where(baseConditions)
      .orderBy(assignmentSubmissions.attemptNumber);

    // Check each submission to see if it has a passing grade
    for (const submission of submissions) {
      // Get submission grade information
      const [gradeInfo] = await db
        .select()
        .from(submissionGrades)
        .where(eq(submissionGrades.submissionId, submission.id));

      if (gradeInfo && gradeInfo.finalGrade) {
        // Get the assessment to find grade boundaries
        const assessment = await this.getAssessmentsByCode(customAssessmentCode);
        if (assessment) {
          // Get grade boundaries for this assessment
          const gradeBoundaries = await this.getAssessmentGradeBoundaries(assessment.id);
          
          // Find the grade boundary that matches the final grade
          const matchingBoundary = gradeBoundaries.find(
            boundary => boundary.gradeLabel === gradeInfo.finalGrade
          );

          // If this grade is a passing grade, return true
          if (matchingBoundary && matchingBoundary.isPass) {
            return {
              hasPassed: true,
              submissionId: submission.id,
              grade: gradeInfo.finalGrade,
              attemptNumber: submission.attemptNumber || 0
            };
          }
        }
      }
    }

    return { hasPassed: false };
  }

  async validateSubmissionEligibility(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<{
    isEligible: boolean;
    reason?: string;
    blockingType?: 'unmarked_submission' | 'passed_previous' | 'attempt_limit' | 'malpractice_limit';
    details?: any;
  }> {
    // Check 1: Has the learner already passed in a previous attempt?
    const passCheck = await this.hasPassedInPreviousAttempt(lmsUserId, customAssessmentCode, contextId);
    if (passCheck.hasPassed) {
      return {
        isEligible: false,
        reason: `You have already passed this assessment in Attempt ${passCheck.attemptNumber} with grade "${passCheck.grade}". No further submissions are allowed.`,
        blockingType: 'passed_previous',
        details: {
          submissionId: passCheck.submissionId,
          grade: passCheck.grade,
          attemptNumber: passCheck.attemptNumber
        }
      };
    }

    // Check 2: Is there an unmarked previous submission?
    const unmarkedCheck = await this.hasUnmarkedPreviousSubmission(lmsUserId, customAssessmentCode, contextId);
    if (unmarkedCheck.hasUnmarked) {
      let statusMessage = "Your previous submission is currently being reviewed";
      if (unmarkedCheck.status === 'marking_skipped') {
        statusMessage = "Your previous submission was skipped and is awaiting resubmission approval";
      } else if (unmarkedCheck.status === 'on_hold') {
        statusMessage = "Your previous submission is on hold";
      } else if (unmarkedCheck.status === 'being_marked') {
        statusMessage = "Your previous submission is currently being marked";
      } else if (unmarkedCheck.status === 'waiting') {
        statusMessage = "Your previous submission is waiting to be marked";
      } else if (unmarkedCheck.status === 'approval_needed') {
        statusMessage = "Your previous submission requires approval before you can submit again";
      }

      return {
        isEligible: false,
        reason: `You cannot submit a new attempt at this time. ${statusMessage}. Please wait for your previous submission to be reviewed before submitting again.`,
        blockingType: 'unmarked_submission',
        details: {
          submissionId: unmarkedCheck.submissionId,
          status: unmarkedCheck.status
        }
      };
    }

    // Check 3: Malpractice enforcement caps
    const malpracticeEnforcement = await this.getActiveMalpracticeEnforcement(
      lmsUserId,
      customAssessmentCode,
      contextId
    );

    const attemptCount = await this.countSubmissionAttempts(
      lmsUserId,
      customAssessmentCode,
      contextId
    );

    if (malpracticeEnforcement && malpracticeEnforcement.enforcedMaxAttempts !== null) {
      if (attemptCount >= malpracticeEnforcement.enforcedMaxAttempts) {
        const malpracticeLevel = await this.getMalpracticeLevel(malpracticeEnforcement.malpracticeLevelId);
        const levelText = malpracticeLevel?.levelText || 'Unknown';

        return {
          isEligible: false,
          reason: `Submission blocked due to ${levelText} malpractice in your previous attempt. Maximum ${malpracticeEnforcement.enforcedMaxAttempts} attempt(s) allowed, ${Math.abs(attemptCount - malpracticeEnforcement.enforcedMaxAttempts)} attempt(s) left.`,
          blockingType: 'malpractice_limit',
          details: {
            attemptCount,
            enforcedMaxAttempts: malpracticeEnforcement.enforcedMaxAttempts,
            malpracticeLevel: levelText
          }
        };
      }
    }

    // Check 4: Regular attempt limit (3 attempts)
    if (attemptCount >= 3) {
      return {
        isEligible: false,
        reason: "You have reached the maximum number of submission attempts (3) for this assignment.",
        blockingType: 'attempt_limit',
        details: {
          attemptCount,
          maxAttempts: 3,
          attemptsRemaining: 0
        }
      };
    }

    // All checks passed
    return { isEligible: true };
  }

  async getPreviousAttemptsForSubmission(submissionId: string): Promise<Array<{
    submissionId: string;
    attemptNumber: number;
    completedAt: Date | null;
    overallSummary: string | null;
    overallMarks: number | null;
    overallGrade: string | null;
    markingStatus: string | null;
    sectionMarks: Record<string, {
      marksAwarded: number;
      feedback: string | null;
      selectedOptionId: string | null;
    }>;
  }>> {
    // Get the current submission to extract required fields
    const currentSubmission = await this.getSubmission(submissionId);
    if (!currentSubmission) {
      return [];
    }

    const { lmsUserId, contextId, customAssessmentCode, attemptNumber } = currentSubmission;

    // Return empty if required fields are missing
    if (!lmsUserId || !contextId || !customAssessmentCode || !attemptNumber) {
      return [];
    }

    // Get all previous submissions for the same user, context, and assessment
    const previousSubmissions = await db
      .select()
      .from(assignmentSubmissions)
      .where(and(
        eq(assignmentSubmissions.lmsUserId, lmsUserId),
        eq(assignmentSubmissions.contextId, contextId),
        eq(assignmentSubmissions.customAssessmentCode, customAssessmentCode),
        sql`${assignmentSubmissions.attemptNumber} < ${attemptNumber}`
      ))
      .orderBy(assignmentSubmissions.attemptNumber);

    // For each previous submission, get its section marks and completion status
    const result = [];
    for (const submission of previousSubmissions) {
      const sectionMarks = await db
        .select()
        .from(submissionSectionMarks)
        .where(eq(submissionSectionMarks.submissionId, submission.id));

      // Get completion status and overall summary from submission grades
      const [gradeInfo] = await db
        .select()
        .from(submissionGrades)
        .where(eq(submissionGrades.submissionId, submission.id));

      // Get marking assignment status
      const [markingAssignment] = await db
        .select()
        .from(submissionMarkingAssignments)
        .where(eq(submissionMarkingAssignments.submissionId, submission.id));

      // Group section marks by section ID
      const sectionMarksMap: Record<string, {
        marksAwarded: number;
        feedback: string | null;
        selectedOptionId: string | null;
      }> = {};

      for (const mark of sectionMarks) {
        if (mark.sectionId) {
          sectionMarksMap[mark.sectionId] = {
            marksAwarded: mark.marksAwarded || 0,
            feedback: mark.feedback,
            selectedOptionId: mark.selectedOptionId
          };
        }
      }

      result.push({
        submissionId: submission.id,
        attemptNumber: submission.attemptNumber || 0,
        completedAt: gradeInfo?.completedAt || null,
        overallSummary: gradeInfo?.overallSummary || null,
        overallMarks: gradeInfo?.totalMarksAwarded || null,
        overallGrade: gradeInfo?.finalGrade || null,
        markingStatus: markingAssignment?.markingStatus || null,
        sectionMarks: sectionMarksMap
      });
    }

    return result;
  }

  // Submission marking assignment operations
  async createMarkingAssignment(assignment: InsertSubmissionMarkingAssignment): Promise<SubmissionMarkingAssignment> {
    const [newAssignment] = await db
      .insert(submissionMarkingAssignments)
      .values(assignment)
      .returning();
    return newAssignment;
  }

  async getMarkingAssignment(submissionId: string): Promise<SubmissionMarkingAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(submissionMarkingAssignments)
      .where(eq(submissionMarkingAssignments.submissionId, submissionId));
    return assignment || undefined;
  }

  async getMarkingAssignmentsForMarker(markerId: string, status?: MarkingStatus): Promise<(SubmissionMarkingAssignment & { submission: AssignmentSubmission })[]> {
    let whereCondition: any = eq(submissionMarkingAssignments.assignedMarkerId, markerId);
    
    if (status) {
      whereCondition = and(
        eq(submissionMarkingAssignments.assignedMarkerId, markerId),
        eq(submissionMarkingAssignments.markingStatus, status)
      );
    }

    const results = await db
      .select({
        id: submissionMarkingAssignments.id,
        submissionId: submissionMarkingAssignments.submissionId,
        assignedMarkerId: submissionMarkingAssignments.assignedMarkerId,
        markingStatus: submissionMarkingAssignments.markingStatus,
        assignedAt: submissionMarkingAssignments.assignedAt,
        statusUpdatedAt: submissionMarkingAssignments.statusUpdatedAt,
        statusUpdatedBy: submissionMarkingAssignments.statusUpdatedBy,
        notes: submissionMarkingAssignments.notes,
        holdReason: submissionMarkingAssignments.holdReason,
        priority: submissionMarkingAssignments.priority,
        dueDate: submissionMarkingAssignments.dueDate,
        createdAt: submissionMarkingAssignments.createdAt,
        updatedAt: submissionMarkingAssignments.updatedAt,
        submission: assignmentSubmissions
      })
      .from(submissionMarkingAssignments)
      .innerJoin(assignmentSubmissions, eq(submissionMarkingAssignments.submissionId, assignmentSubmissions.id))
      .where(whereCondition)
      .orderBy(desc(submissionMarkingAssignments.assignedAt));
    
    return results.map(result => ({
      id: result.id,
      submissionId: result.submissionId,
      assignedMarkerId: result.assignedMarkerId,
      markingStatus: result.markingStatus,
      assignedAt: result.assignedAt,
      statusUpdatedAt: result.statusUpdatedAt,
      statusUpdatedBy: result.statusUpdatedBy,
      notes: result.notes,
      holdReason: result.holdReason,
      priority: result.priority,
      dueDate: result.dueDate,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      submission: result.submission
    }));
  }

  async getAllMarkingAssignments(filters?: {
    status?: MarkingStatus;
    markerId?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ assignments: (SubmissionMarkingAssignment & { submission: AssignmentSubmission, assignedMarker?: User, turnitinStatus?: string, grade?: SubmissionGrade | null, malpracticeLevel?: MalpracticeLevel | null, skipReason?: SkipReason | null })[], nextCursor: string | null }> {
    const conditions = [];

    // Exclude placeholder submissions with no files
    conditions.push(gt(assignmentSubmissions.fileCount, 0));

    if (filters?.status) {
      conditions.push(eq(submissionMarkingAssignments.markingStatus, filters.status));
    }

    if (filters?.markerId) {
      conditions.push(eq(submissionMarkingAssignments.assignedMarkerId, filters.markerId));
    }

    if (filters?.cursor) {
      const cursorParts = filters.cursor.split("|").filter(Boolean);
      // Cursor format: createdAt|id (both parts required for proper pagination)
      if (cursorParts.length >= 2) {
        const cursorCreatedAt = cursorParts[0];
        const cursorId = cursorParts[1];
        
        // Since we're ordering by createdAt DESC, we need records where:
        // createdAt < cursorCreatedAt OR (createdAt = cursorCreatedAt AND id < cursorId)
        conditions.push(
          or(
            lt(submissionMarkingAssignments.createdAt, new Date(cursorCreatedAt)),
            and(
              eq(submissionMarkingAssignments.createdAt, new Date(cursorCreatedAt)),
              lt(submissionMarkingAssignments.id, cursorId)
            )
          )
        );
      } else if (cursorParts.length === 1) {
        // Backward compatibility: if only ID is provided, use it (less accurate but works)
        conditions.push(lt(submissionMarkingAssignments.id, cursorParts[0]));
      }
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    let query: any = db
      .select({
        id: submissionMarkingAssignments.id,
        submissionId: submissionMarkingAssignments.submissionId,
        assignedMarkerId: submissionMarkingAssignments.assignedMarkerId,
        markingStatus: submissionMarkingAssignments.markingStatus,
        assignedAt: submissionMarkingAssignments.assignedAt,
        statusUpdatedAt: submissionMarkingAssignments.statusUpdatedAt,
        statusUpdatedBy: submissionMarkingAssignments.statusUpdatedBy,
        notes: submissionMarkingAssignments.notes,
        holdReason: submissionMarkingAssignments.holdReason,
        priority: submissionMarkingAssignments.priority,
        dueDate: submissionMarkingAssignments.dueDate,
        createdAt: submissionMarkingAssignments.createdAt,
        updatedAt: submissionMarkingAssignments.updatedAt,
        submission: assignmentSubmissions,
        assignedMarker: users,
        grade: submissionGrades,
        malpracticeLevel: malpracticeLevels,
        skipReason: skipReasons
      })
      .from(submissionMarkingAssignments)
      .innerJoin(assignmentSubmissions, eq(submissionMarkingAssignments.submissionId, assignmentSubmissions.id))
      .leftJoin(users, eq(submissionMarkingAssignments.assignedMarkerId, users.id))
      .leftJoin(submissionGrades, eq(submissionMarkingAssignments.submissionId, submissionGrades.submissionId))
      .leftJoin(malpracticeLevels, eq(submissionGrades.malpracticeLevelId, malpracticeLevels.id))
      .leftJoin(skipReasons, eq(submissionGrades.skipReasonId, skipReasons.id));

    if (whereCondition) {
      query = query.where(whereCondition);
    }

    query = query.orderBy(desc(submissionMarkingAssignments.createdAt));

    // For cursor pagination, fetch limit + 1 to determine if there's a next page
    const fetchLimit = (filters?.limit || 20) + 1;
    query = query.limit(fetchLimit);
    
    const results = await query;
    
    // For each assignment, get the turnitin status of its files
    const assignmentsWithTurnitinStatus = await Promise.all(
      results.map(async (result: typeof results[0]) => {
        // Get the submission files to check turnitin status
        const files = result.submissionId ? await this.getSubmissionFiles(result.submissionId) : [];
        
        let turnitinStatus = 'not_submitted';
        if (files.length > 0) {
          const statusCounts = files.reduce((acc, file) => {
            const status = file.turnitinStatus || 'not_submitted';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          // Determine overall status based on file statuses
          if (statusCounts.error > 0) {
            turnitinStatus = 'error';
          } else if (statusCounts.complete > 0 && statusCounts.complete === files.length) {
            turnitinStatus = 'complete';
          } else if (statusCounts.processing > 0 || statusCounts.pending > 0) {
            turnitinStatus = 'processing';
          }
        }
        
        return {
          id: result.id,
          submissionId: result.submissionId,
          assignedMarkerId: result.assignedMarkerId,
          markingStatus: result.markingStatus,
          assignedAt: result.assignedAt,
          statusUpdatedAt: result.statusUpdatedAt,
          statusUpdatedBy: result.statusUpdatedBy,
          notes: result.notes,
          holdReason: result.holdReason,
          priority: result.priority,
          dueDate: result.dueDate,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          submission: result.submission,
          assignedMarker: result.assignedMarker || undefined,
          turnitinStatus,
          grade: result.grade || null,
          malpracticeLevel: result.malpracticeLevel || null,
          skipReason: result.skipReason || null
        };
      })
    );

    // Determine next cursor for pagination
    const requestedLimit = filters?.limit || 20;
    const hasMore = assignmentsWithTurnitinStatus.length > requestedLimit;
    
    // If we have more results than requested, there's a next page
    let nextCursor: string | null = null;
    let finalAssignments = assignmentsWithTurnitinStatus;
    
    if (hasMore) {
      // Remove the extra item we fetched
      finalAssignments = assignmentsWithTurnitinStatus.slice(0, requestedLimit);
      const lastAssignment = finalAssignments[finalAssignments.length - 1];
      nextCursor = lastAssignment?.id ?? null;
    }

    return {
      assignments: finalAssignments,
      nextCursor
    };
  }

  async getAllMarkingAssignmentsWithOffset(filters?: {
    status?: MarkingStatus;
    markerId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ assignments: (SubmissionMarkingAssignment & { submission: AssignmentSubmission, assignedMarker?: User, turnitinStatus?: string, grade?: SubmissionGrade | null, malpracticeLevel?: MalpracticeLevel | null, skipReason?: SkipReason | null })[], total: number, page: number, totalPages: number }> {
    const conditions = [];

    // Exclude placeholder submissions with no files
    conditions.push(gt(assignmentSubmissions.fileCount, 0));

    if (filters?.status) {
      conditions.push(eq(submissionMarkingAssignments.markingStatus, filters.status));
    }

    if (filters?.markerId) {
      conditions.push(eq(submissionMarkingAssignments.assignedMarkerId, filters.markerId));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    // First, get the total count for pagination info
    let countQuery: any = db
      .select({ count: sql<number>`count(*)` })
      .from(submissionMarkingAssignments)
      .innerJoin(assignmentSubmissions, eq(submissionMarkingAssignments.submissionId, assignmentSubmissions.id));

    if (whereCondition) {
      countQuery = countQuery.where(whereCondition);
    }

    const [countData] = await countQuery;
    const total = Number(countData?.count || 0);

    // Now get the paginated results
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    let query: any = db
      .select({
        id: submissionMarkingAssignments.id,
        submissionId: submissionMarkingAssignments.submissionId,
        assignedMarkerId: submissionMarkingAssignments.assignedMarkerId,
        markingStatus: submissionMarkingAssignments.markingStatus,
        assignedAt: submissionMarkingAssignments.assignedAt,
        statusUpdatedAt: submissionMarkingAssignments.statusUpdatedAt,
        statusUpdatedBy: submissionMarkingAssignments.statusUpdatedBy,
        notes: submissionMarkingAssignments.notes,
        holdReason: submissionMarkingAssignments.holdReason,
        priority: submissionMarkingAssignments.priority,
        dueDate: submissionMarkingAssignments.dueDate,
        createdAt: submissionMarkingAssignments.createdAt,
        updatedAt: submissionMarkingAssignments.updatedAt,
        submission: assignmentSubmissions,
        assignedMarker: users,
        grade: submissionGrades,
        malpracticeLevel: malpracticeLevels,
        skipReason: skipReasons
      })
      .from(submissionMarkingAssignments)
      .innerJoin(assignmentSubmissions, eq(submissionMarkingAssignments.submissionId, assignmentSubmissions.id))
      .leftJoin(users, eq(submissionMarkingAssignments.assignedMarkerId, users.id))
      .leftJoin(submissionGrades, eq(submissionMarkingAssignments.submissionId, submissionGrades.submissionId))
      .leftJoin(malpracticeLevels, eq(submissionGrades.malpracticeLevelId, malpracticeLevels.id))
      .leftJoin(skipReasons, eq(submissionGrades.skipReasonId, skipReasons.id));

    if (whereCondition) {
      query = query.where(whereCondition);
    }

    query = query.orderBy(desc(submissionMarkingAssignments.createdAt));
    query = query.limit(limit).offset(offset);
    
    const results = await query;
    
    // For each assignment, get the turnitin status of its files
    const assignmentsWithTurnitinStatus = await Promise.all(
      results.map(async (result: typeof results[0]) => {
        // Get the submission files to check turnitin status
        const files = result.submissionId ? await this.getSubmissionFiles(result.submissionId) : [];
        
        let turnitinStatus = 'not_submitted';
        if (files.length > 0) {
          const statusCounts = files.reduce((acc, file) => {
            const status = file.turnitinStatus || 'not_submitted';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          // Determine overall status based on file statuses
          if (statusCounts.error > 0) {
            turnitinStatus = 'error';
          } else if (statusCounts.complete > 0 && statusCounts.complete === files.length) {
            turnitinStatus = 'complete';
          } else if (statusCounts.processing > 0 || statusCounts.pending > 0) {
            turnitinStatus = 'processing';
          }
        }
        
        return {
          id: result.id,
          submissionId: result.submissionId,
          assignedMarkerId: result.assignedMarkerId,
          markingStatus: result.markingStatus,
          assignedAt: result.assignedAt,
          statusUpdatedAt: result.statusUpdatedAt,
          statusUpdatedBy: result.statusUpdatedBy,
          notes: result.notes,
          holdReason: result.holdReason,
          priority: result.priority,
          dueDate: result.dueDate,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          submission: result.submission,
          assignedMarker: result.assignedMarker || undefined,
          turnitinStatus,
          grade: result.grade || null,
          malpracticeLevel: result.malpracticeLevel || null,
          skipReason: result.skipReason || null
        };
      })
    );

    return {
      assignments: assignmentsWithTurnitinStatus,
      total,
      page,
      totalPages
    };
  }

  async updateMarkingAssignmentStatus(submissionId: string, status: MarkingStatus, updatedBy: string, notes?: string): Promise<SubmissionMarkingAssignment> {
    const updateData: Partial<InsertSubmissionMarkingAssignment> = {
      markingStatus: status,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: updatedBy
    };
    
    // If notes are provided and status is on_hold, treat as holdReason
    if (notes !== undefined) {
      if (status === 'on_hold') {
        updateData.holdReason = notes;
      } else {
        // Clear holdReason if status is not on_hold
        updateData.holdReason = null;
      }
    }
    
    const [updatedAssignment] = await db
      .update(submissionMarkingAssignments)
      .set(updateData)
      .where(eq(submissionMarkingAssignments.submissionId, submissionId))
      .returning();
    return updatedAssignment;
  }

  async assignMarkerToSubmission(submissionId: string, markerId: string, assignedBy: string): Promise<SubmissionMarkingAssignment> {
    // First, try to update existing assignment
    const existingAssignment = await this.getMarkingAssignment(submissionId);
    
    if (existingAssignment) {
      const [updatedAssignment] = await db
        .update(submissionMarkingAssignments)
        .set({
          assignedMarkerId: markerId,
          markingStatus: 'being_marked', // Automatically move to being_marked when assigned
          statusUpdatedBy: assignedBy,
          statusUpdatedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(submissionMarkingAssignments.submissionId, submissionId))
        .returning();
      return updatedAssignment;
    } else {
      // Create new assignment
      return await this.createMarkingAssignment({
        submissionId,
        assignedMarkerId: markerId,
        markingStatus: 'being_marked', // Automatically set to being_marked when assigned
        statusUpdatedBy: assignedBy
      });
    }
  }

  async unassignMarkerFromSubmission(submissionId: string, unassignedBy: string): Promise<SubmissionMarkingAssignment> {
    const [updatedAssignment] = await db
      .update(submissionMarkingAssignments)
      .set({
        assignedMarkerId: null,
        markingStatus: 'waiting', // Set to waiting since it needs a new marker
        statusUpdatedBy: unassignedBy,
        statusUpdatedAt: new Date(),
        updatedAt: new Date(),
        holdReason: null // Clear any hold reason when unassigning
      })
      .where(eq(submissionMarkingAssignments.submissionId, submissionId))
      .returning();
    return updatedAssignment;
  }

  // Submission files operations
  async createSubmissionFile(submissionFile: InsertSubmissionFile): Promise<SubmissionFile> {
    const [newFile] = await db
      .insert(submissionFiles)
      .values(submissionFile)
      .returning();
    return newFile;
  }

  async createMultipleSubmissionFiles(submissionFileList: InsertSubmissionFile[]): Promise<SubmissionFile[]> {
    const newFiles = await db
      .insert(submissionFiles)
      .values(submissionFileList)
      .returning();
    return newFiles;
  }

  async getSubmissionFiles(submissionId: string): Promise<SubmissionFile[]> {
    return db.select()
      .from(submissionFiles)
      .where(eq(submissionFiles.submissionId, submissionId))
      .orderBy(submissionFiles.uploadOrder);
  }

  async getSubmissionFile(fileId: string): Promise<SubmissionFile | undefined> {
    const [file] = await db.select().from(submissionFiles).where(eq(submissionFiles.id, fileId));
    return file || undefined;
  }

  async updateSubmissionFile(fileId: string, fileData: Partial<InsertSubmissionFile>): Promise<SubmissionFile> {
    const [updatedFile] = await db
      .update(submissionFiles)
      .set(fileData)
      .where(eq(submissionFiles.id, fileId))
      .returning();
    return updatedFile;
  }

  async deleteSubmissionFile(fileId: string): Promise<void> {
    await db.delete(submissionFiles).where(eq(submissionFiles.id, fileId));
  }

  async getSubmissionWithFiles(submissionId: string): Promise<{ submission: AssignmentSubmission | undefined; files: SubmissionFile[] }> {
    const submission = await this.getSubmission(submissionId);
    const files = submission ? await this.getSubmissionFiles(submissionId) : [];
    return { submission, files };
  }

  // LTI operations
  async createLtiLaunchSession(session: InsertLtiLaunchSession): Promise<LtiLaunchSession> {
    const [newSession] = await db
      .insert(ltiLaunchSessions)
      .values(session)
      .returning();
    return newSession;
  }

  async getLtiLaunchSession(launchId: string): Promise<LtiLaunchSession | undefined> {
    const [session] = await db.select().from(ltiLaunchSessions).where(eq(ltiLaunchSessions.launchId, launchId));
    return session || undefined;
  }

  async updateLtiLaunchSession(launchId: string, sessionData: Partial<InsertLtiLaunchSession>): Promise<LtiLaunchSession> {
    const [session] = await db
      .update(ltiLaunchSessions)
      .set(sessionData)
      .where(eq(ltiLaunchSessions.launchId, launchId))
      .returning();
    return session;
  }

  async deleteLtiLaunchSession(launchId: string): Promise<void> {
    await db.delete(ltiLaunchSessions).where(eq(ltiLaunchSessions.launchId, launchId));
  }

  // LTI Viewer Sessions operations
  async createLtiViewerSession(session: InsertLtiViewerSession): Promise<LtiViewerSession> {
    const [newSession] = await db
      .insert(ltiViewerSessions)
      .values(session)
      .returning();
    return newSession;
  }

  async getLtiViewerSessionByToken(viewerToken: string): Promise<LtiViewerSession | undefined> {
    const [session] = await db
      .select()
      .from(ltiViewerSessions)
      .where(and(
        eq(ltiViewerSessions.viewerToken, viewerToken),
        isNull(ltiViewerSessions.revokedAt)
      ));
    return session || undefined;
  }

  async updateLtiViewerSession(id: string, updates: Partial<InsertLtiViewerSession>): Promise<LtiViewerSession> {
    const [session] = await db
      .update(ltiViewerSessions)
      .set(updates)
      .where(eq(ltiViewerSessions.id, id))
      .returning();
    return session;
  }

  async incrementViewerSessionAccess(id: string): Promise<void> {
    await db
      .update(ltiViewerSessions)
      .set({
        accessCount: sql`${ltiViewerSessions.accessCount} + 1`,
        lastAccessedAt: new Date()
      })
      .where(eq(ltiViewerSessions.id, id));
  }

  async revokeLtiViewerSession(id: string): Promise<void> {
    await db
      .update(ltiViewerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(ltiViewerSessions.id, id));
  }

  async cleanupExpiredViewerSessions(): Promise<number> {
    const now = new Date();
    const result = await db
      .delete(ltiViewerSessions)
      .where(sql`${ltiViewerSessions.expiresAt} < ${now}`)
      .returning({ id: ltiViewerSessions.id });
    return result.length;
  }

  // LTI Session Records operations - foolproof session tracking
  async createLtiSessionRecord(record: InsertLtiSessionRecord): Promise<LtiSessionRecord> {
    const [newRecord] = await db
      .insert(ltiSessionRecords)
      .values(record)
      .returning();
    return newRecord;
  }

  async getLtiSessionRecord(launchId: string): Promise<LtiSessionRecord | undefined> {
    const [record] = await db.select().from(ltiSessionRecords).where(eq(ltiSessionRecords.launchId, launchId));
    return record || undefined;
  }

  async getLtiSessionRecordById(id: string): Promise<LtiSessionRecord | undefined> {
    const [record] = await db.select().from(ltiSessionRecords).where(eq(ltiSessionRecords.id, id));
    return record || undefined;
  }

  async updateLtiSessionRecord(launchId: string, updates: Partial<InsertLtiSessionRecord>): Promise<LtiSessionRecord> {
    const [record] = await db
      .update(ltiSessionRecords)
      .set(updates)
      .where(eq(ltiSessionRecords.launchId, launchId))
      .returning();
    return record;
  }

  async markSessionWithFileSubmission(launchId: string): Promise<void> {
    await db
      .update(ltiSessionRecords)
      .set({ hasFileSubmission: "true" })
      .where(eq(ltiSessionRecords.launchId, launchId));
  }

  // Instruction sets operations
  async getAllInstructionSets(): Promise<InstructionSet[]> {
    return await db
      .select()
      .from(instructionSets)
      .where(eq(instructionSets.isActive, 'true'))
      .orderBy(instructionSets.createdAt);
  }

  async getInstructionSet(id: string): Promise<InstructionSet | undefined> {
    const [set] = await db.select().from(instructionSets).where(eq(instructionSets.id, id));
    return set || undefined;
  }

  async getInstructionSetBySlug(slug: string): Promise<InstructionSet | undefined> {
    const [set] = await db.select().from(instructionSets).where(eq(instructionSets.slug, slug));
    return set || undefined;
  }

  async getInstructionSetByCode(instructionSetCode: string): Promise<InstructionSet | undefined> {
    const [set] = await db.select().from(instructionSets).where(eq(instructionSets.instructionSetCode, instructionSetCode));
    return set || undefined;
  }

  async createInstructionSet(instructionSet: InsertInstructionSet): Promise<InstructionSet> {
    const [set] = await db
      .insert(instructionSets)
      .values(instructionSet)
      .returning();
    return set;
  }

  async updateInstructionSet(id: string, instructionSetData: Partial<InsertInstructionSet>): Promise<InstructionSet> {
    const [set] = await db
      .update(instructionSets)
      .set({ ...instructionSetData, updatedAt: new Date() })
      .where(eq(instructionSets.id, id))
      .returning();
    return set;
  }

  async deleteInstructionSet(id: string): Promise<void> {
    // Delete all steps in this set first
    await this.deleteInstructionStepsBySet(id);
    // Then delete the set
    await db.delete(instructionSets).where(eq(instructionSets.id, id));
  }

  // Instruction steps operations
  async createInstructionStep(step: InsertInstructionStep): Promise<InstructionStep> {
    const [newStep] = await db
      .insert(instructionSteps)
      .values(step)
      .returning();
    return newStep;
  }

  async getInstructionStep(id: string): Promise<InstructionStep | undefined> {
    const [step] = await db.select().from(instructionSteps).where(eq(instructionSteps.id, id));
    return step || undefined;
  }

  async getAllInstructionSteps(): Promise<InstructionStep[]> {
    return db.select()
      .from(instructionSteps)
      .where(eq(instructionSteps.isActive, "true"))
      .orderBy(instructionSteps.stepNumber);
  }

  async getInstructionStepsBySet(instructionSetId: string): Promise<InstructionStep[]> {
    return await db
      .select()
      .from(instructionSteps)
      .where(and(
        eq(instructionSteps.instructionSetId, instructionSetId),
        eq(instructionSteps.isActive, 'true')
      ))
      .orderBy(instructionSteps.stepNumber);
  }

  async updateInstructionStep(id: string, stepData: Partial<InsertInstructionStep>): Promise<InstructionStep> {
    const [step] = await db
      .update(instructionSteps)
      .set({ ...stepData, updatedAt: new Date() })
      .where(eq(instructionSteps.id, id))
      .returning();
    return step;
  }

  async deleteInstructionStep(id: string): Promise<void> {
    await db.delete(instructionSteps).where(eq(instructionSteps.id, id));
  }

  async deleteInstructionStepsBySet(instructionSetId: string): Promise<void> {
    await db.delete(instructionSteps).where(eq(instructionSteps.instructionSetId, instructionSetId));
  }

  async upsertInstructionStep(step: InsertInstructionStep & { id?: string }): Promise<InstructionStep> {
    // Remove timestamp fields that shouldn't be updated from frontend
    const { createdAt, updatedAt, ...cleanStep } = step as any;
    
    if (cleanStep.id) {
      const { id, ...stepData } = cleanStep;
      return this.updateInstructionStep(id, stepData);
    } else {
      const { id, ...stepData } = cleanStep;
      return this.createInstructionStep(stepData);
    }
  }

  // Email template operations
  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return db.select()
      .from(emailTemplates)
      .where(eq(emailTemplates.isActive, "true"))
      .orderBy(emailTemplates.templateKey);
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return template || undefined;
  }

  async getEmailTemplateByKey(templateKey: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select()
      .from(emailTemplates)
      .where(and(
        eq(emailTemplates.templateKey, templateKey),
        eq(emailTemplates.isActive, "true")
      ));
    return template || undefined;
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [newTemplate] = await db
      .insert(emailTemplates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updateEmailTemplate(id: string, templateData: Partial<InsertEmailTemplate>): Promise<EmailTemplate> {
    const [template] = await db
      .update(emailTemplates)
      .set({ ...templateData, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return template;
  }

  async deleteEmailTemplate(id: string): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // Skip reason operations
  async getAllSkipReasons(): Promise<SkipReason[]> {
    return db.select()
      .from(skipReasons)
      .where(eq(skipReasons.isActive, "true"))
      .orderBy(skipReasons.sortOrder);
  }

  async getSkipReason(id: string): Promise<SkipReason | undefined> {
    const [skipReason] = await db.select().from(skipReasons).where(eq(skipReasons.id, id));
    return skipReason || undefined;
  }

  async createSkipReason(skipReason: InsertSkipReason): Promise<SkipReason> {
    const maxOrder = await db.select({ maxOrder: sql<number>`COALESCE(MAX(${skipReasons.sortOrder}), -1)` })
      .from(skipReasons);
    const nextOrder = (maxOrder[0]?.maxOrder ?? -1) + 1;
    
    const [newSkipReason] = await db
      .insert(skipReasons)
      .values({ ...skipReason, sortOrder: nextOrder })
      .returning();
    return newSkipReason;
  }

  async updateSkipReason(id: string, skipReasonData: Partial<InsertSkipReason>): Promise<SkipReason> {
    const [skipReason] = await db
      .update(skipReasons)
      .set({ ...skipReasonData, updatedAt: new Date() })
      .where(eq(skipReasons.id, id))
      .returning();
    return skipReason;
  }

  async deleteSkipReason(id: string): Promise<void> {
    await db.delete(skipReasons).where(eq(skipReasons.id, id));
  }

  async reorderSkipReasons(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(skipReasons)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(skipReasons.id, orderedIds[i]));
    }
  }

  // Malpractice level operations
  async getAllMalpracticeLevels(): Promise<MalpracticeLevel[]> {
    return db.select()
      .from(malpracticeLevels)
      .where(eq(malpracticeLevels.isActive, "true"))
      .orderBy(malpracticeLevels.sortOrder);
  }

  async getMalpracticeLevel(id: string): Promise<MalpracticeLevel | undefined> {
    const [malpracticeLevel] = await db.select().from(malpracticeLevels).where(eq(malpracticeLevels.id, id));
    return malpracticeLevel || undefined;
  }

  async createMalpracticeLevel(malpracticeLevel: InsertMalpracticeLevel): Promise<MalpracticeLevel> {
    const maxOrder = await db.select({ maxOrder: sql<number>`COALESCE(MAX(${malpracticeLevels.sortOrder}), -1)` })
      .from(malpracticeLevels);
    const nextOrder = (maxOrder[0]?.maxOrder ?? -1) + 1;
    
    const [newMalpracticeLevel] = await db
      .insert(malpracticeLevels)
      .values({ ...malpracticeLevel, sortOrder: nextOrder })
      .returning();
    return newMalpracticeLevel;
  }

  async updateMalpracticeLevel(id: string, malpracticeLevelData: Partial<InsertMalpracticeLevel>): Promise<MalpracticeLevel> {
    const [malpracticeLevel] = await db
      .update(malpracticeLevels)
      .set({ ...malpracticeLevelData, updatedAt: new Date() })
      .where(eq(malpracticeLevels.id, id))
      .returning();
    return malpracticeLevel;
  }

  async deleteMalpracticeLevel(id: string): Promise<void> {
    await db.delete(malpracticeLevels).where(eq(malpracticeLevels.id, id));
  }

  async reorderMalpracticeLevels(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(malpracticeLevels)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(malpracticeLevels.id, orderedIds[i]));
    }
  }

  async createMalpracticeEnforcement(enforcement: InsertMalpracticeEnforcement): Promise<MalpracticeEnforcement> {
    const [newEnforcement] = await db
      .insert(malpracticeEnforcements)
      .values(enforcement)
      .returning();
    return newEnforcement;
  }

  async getMalpracticeEnforcement(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<MalpracticeEnforcement | undefined> {
    // Build WHERE clause to scope by course context using only contextId
    const [enforcement] = await db
      .select()
      .from(malpracticeEnforcements)
      .where(and(
        eq(malpracticeEnforcements.lmsUserId, lmsUserId),
        eq(malpracticeEnforcements.customAssessmentCode, customAssessmentCode),
        eq(malpracticeEnforcements.contextId, contextId)
      ))
      .orderBy(desc(malpracticeEnforcements.ruleAppliedAt))
      .limit(1);

    return enforcement || undefined;
  }

  async getActiveMalpracticeEnforcement(lmsUserId: string, customAssessmentCode: string, contextId: string): Promise<MalpracticeEnforcement | undefined> {
    // Get the most recent enforcement for this student-assessment
    const enforcement = await this.getMalpracticeEnforcement(lmsUserId, customAssessmentCode, contextId);
    
    if (!enforcement) {
      return undefined;
    }

    // Get the malpractice level to check what type of rule it is
    const malpracticeLevel = await this.getMalpracticeLevel(enforcement.malpracticeLevelId);
    
    if (!malpracticeLevel) {
      return undefined;
    }

    // Return the enforcement (it's active if it exists)
    return enforcement;
  }

  async getMalpracticeEnforcementBySubmission(submissionId: string): Promise<MalpracticeEnforcement | undefined> {
    const [enforcement] = await db
      .select()
      .from(malpracticeEnforcements)
      .where(eq(malpracticeEnforcements.submissionId, submissionId))
      .limit(1);
    
    return enforcement || undefined;
  }

  async updateMalpracticeEnforcement(id: string, enforcementData: Partial<InsertMalpracticeEnforcement>): Promise<MalpracticeEnforcement> {
    const [enforcement] = await db
      .update(malpracticeEnforcements)
      .set({ ...enforcementData, updatedAt: new Date() })
      .where(eq(malpracticeEnforcements.id, id))
      .returning();
    return enforcement;
  }

  // Course category operations

  // Course node operations (hierarchical structure)
  async getAllCourseNodes(): Promise<CourseNode[]> {
    return await db.select().from(courseNodes).where(eq(courseNodes.isActive, "true"));
  }

  async getCourseNode(id: string): Promise<CourseNode | undefined> {
    const [node] = await db.select().from(courseNodes).where(eq(courseNodes.id, id));
    return node || undefined;
  }

  async getRootCourseNodes(): Promise<CourseNode[]> {
    return await db.select().from(courseNodes).where(
      and(
        isNull(courseNodes.parentId),
        eq(courseNodes.isActive, "true")
      )
    );
  }

  async getCourseNodeChildren(parentId: string): Promise<CourseNode[]> {
    return await db.select().from(courseNodes).where(
      and(
        eq(courseNodes.parentId, parentId),
        eq(courseNodes.isActive, "true")
      )
    );
  }

  async getCourseNodeWithChildren(id: string): Promise<{ node: CourseNode; children: CourseNode[] } | undefined> {
    const node = await this.getCourseNode(id);
    if (!node) return undefined;
    
    const children = await this.getCourseNodeChildren(id);
    return { node, children };
  }

  async createCourseNode(nodeData: InsertCourseNode): Promise<CourseNode> {
    const result = await db
      .insert(courseNodes)
      .values(nodeData)
      .returning() as CourseNode[];
    return result[0];
  }

  async updateCourseNode(id: string, nodeData: Partial<InsertCourseNode>): Promise<CourseNode> {
    const [node] = await db
      .update(courseNodes)
      .set({ ...nodeData, updatedAt: new Date() })
      .where(eq(courseNodes.id, id))
      .returning();
    return node;
  }

  async deleteCourseNode(id: string): Promise<void> {
    await db.delete(courseNodes).where(eq(courseNodes.id, id));
  }

  async duplicateCourseNode(id: string): Promise<CourseNode> {
    const originalNode = await this.getCourseNode(id);
    if (!originalNode) {
      throw new Error('Course node not found');
    }

    // Get all assessments for the original node
    const originalAssessments = await this.getAssessmentsByCourseNode(id);

    // Create the duplicated node
    const duplicateData: InsertCourseNode = {
      name: `${originalNode.name} (Copy)`,
      parentId: originalNode.parentId,
      isActive: originalNode.isActive
    };

    const newNode = await this.createCourseNode(duplicateData);

    // Duplicate all assessments
    for (const assessment of originalAssessments) {
      const duplicateAssessmentData: InsertAssessment = {
        courseNodeId: newNode.id,
        instructionSetId: assessment.instructionSetId,
        code: `${assessment.code}_COPY_${Date.now()}`,
        name: `${assessment.name} (Copy)`,
        description: assessment.description,
        status: assessment.status,
        eligibilityPrerequisites: assessment.eligibilityPrerequisites,
        isActive: assessment.isActive
      };

      await this.createAssessment(duplicateAssessmentData);
    }

    return newNode;
  }

  // Course operations

  // Assessment operations
  async getAllAssessments(): Promise<Assessment[]> {
    return await db.select().from(assessments).where(eq(assessments.isActive, "true"));
  }

  async getAssessment(id: string): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(assessments).where(eq(assessments.id, id));
    return assessment || undefined;
  }

  async getAssessmentsByCode(code: string): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(assessments).where(eq(assessments.code, code));
    return assessment || undefined;
  }

  async getAssessmentByCode(code: string): Promise<Assessment | undefined> {
    const [assessment] = await db.select().from(assessments).where(eq(assessments.code, code));
    return assessment || undefined;
  }


  async getAssessmentsByCourseNode(courseNodeId: string): Promise<Assessment[]> {
    return await db.select().from(assessments).where(
      and(
        eq(assessments.courseNodeId, courseNodeId),
        eq(assessments.isActive, "true")
      )
    );
  }

  async createAssessment(assessment: InsertAssessment): Promise<Assessment> {
    const [newAssessment] = await db
      .insert(assessments)
      .values(assessment)
      .returning();
    return newAssessment;
  }

  async updateAssessment(id: string, assessmentData: Partial<InsertAssessment>): Promise<Assessment> {
    const [assessment] = await db
      .update(assessments)
      .set({ ...assessmentData, updatedAt: new Date() })
      .where(eq(assessments.id, id))
      .returning();
    return assessment;
  }

  async deleteAssessment(id: string): Promise<void> {
    await db.delete(assessments).where(eq(assessments.id, id));
  }

  async cloneAssessment(id: string): Promise<Assessment> {
    // Get the original assessment
    const originalAssessment = await this.getAssessment(id);
    if (!originalAssessment) {
      throw new Error('Assessment not found');
    }

    // Create the cloned assessment
    const { id: _, assessmentId: __, createdAt: ___, updatedAt: ____, ...assessmentData } = originalAssessment;
    const clonedAssessmentData: InsertAssessment = {
      ...assessmentData,
      code: `${originalAssessment.code}_COPY_${Date.now()}`,
      name: `${originalAssessment.name} (Copy)`
    };

    const clonedAssessment = await this.createAssessment(clonedAssessmentData);

    // Get all sections from the original assessment
    const originalSections = await this.getAssessmentSections(id);

    // Clone each section with its marking options
    for (const section of originalSections) {
      const { id: sectionId, assessmentId: oldAssessmentId, createdAt: sectionCreatedAt, updatedAt: sectionUpdatedAt, ...sectionData } = section;
      
      // Create the cloned section
      const clonedSection = await this.createAssessmentSection({
        ...sectionData,
        assessmentId: clonedAssessment.id
      });

      // Get and clone marking options for this section
      const originalMarkingOptions = await this.getSectionMarkingOptions(sectionId);
      for (const option of originalMarkingOptions) {
        const { id: optionId, sectionId: oldSectionId, createdAt: optionCreatedAt, updatedAt: optionUpdatedAt, ...optionData } = option;
        await this.createSectionMarkingOption({
          ...optionData,
          sectionId: clonedSection.id
        });
      }
    }

    // Get and clone grade boundaries
    const originalGradeBoundaries = await this.getAssessmentGradeBoundaries(id);
    for (const boundary of originalGradeBoundaries) {
      const { id: boundaryId, assessmentId: oldAssessmentId, createdAt: boundaryCreatedAt, updatedAt: boundaryUpdatedAt, ...boundaryData } = boundary;
      await this.createAssessmentGradeBoundary({
        ...boundaryData,
        assessmentId: clonedAssessment.id
      });
    }

    // Update total marks for the cloned assessment
    await this.updateAssessmentTotalMarks(clonedAssessment.id);

    return clonedAssessment;
  }

  // Assessment Section operations
  async getAssessmentSections(assessmentId: string): Promise<AssessmentSection[]> {
    return await db.select()
      .from(assessmentSections)
      .where(
        and(
          eq(assessmentSections.assessmentId, assessmentId),
          eq(assessmentSections.isActive, "true")
        )
      )
      .orderBy(assessmentSections.order);
  }

  async getAssessmentSection(sectionId: string): Promise<AssessmentSection | null> {
    const results = await db.select()
      .from(assessmentSections)
      .where(eq(assessmentSections.id, sectionId))
      .limit(1);
    return results[0] || null;
  }

  async createAssessmentSection(section: InsertAssessmentSection): Promise<AssessmentSection> {
    const [newSection] = await db
      .insert(assessmentSections)
      .values(section)
      .returning();
    
    // Automatically recalculate total marks when section is created
    if (newSection.assessmentId) {
      await this.updateAssessmentTotalMarks(newSection.assessmentId);
    }
    
    return newSection;
  }

  async updateAssessmentSection(id: string, sectionData: Partial<InsertAssessmentSection>): Promise<AssessmentSection> {
    const [section] = await db
      .update(assessmentSections)
      .set({ ...sectionData, updatedAt: new Date() })
      .where(eq(assessmentSections.id, id))
      .returning();
    
    // Automatically recalculate total marks when section is updated
    if (section.assessmentId) {
      await this.updateAssessmentTotalMarks(section.assessmentId);
    }
    
    return section;
  }

  async deleteAssessmentSection(id: string): Promise<void> {
    // Get the section first to get the assessment ID
    const [section] = await db.select()
      .from(assessmentSections)
      .where(eq(assessmentSections.id, id));
    
    await db.delete(assessmentSections).where(eq(assessmentSections.id, id));
    
    // Automatically recalculate total marks when section is deleted
    if (section?.assessmentId) {
      await this.updateAssessmentTotalMarks(section.assessmentId);
    }
  }

  async cloneAssessmentSection(id: string): Promise<AssessmentSection> {
    // Get the original section
    const [originalSection] = await db
      .select()
      .from(assessmentSections)
      .where(eq(assessmentSections.id, id));
    
    if (!originalSection) {
      throw new Error('Section not found');
    }

    // Get the max order for the assessment to place the clone at the end
    const maxOrderResult = await db
      .select({ maxOrder: assessmentSections.order })
      .from(assessmentSections)
      .where(eq(assessmentSections.assessmentId, originalSection.assessmentId!))
      .orderBy(desc(assessmentSections.order))
      .limit(1);
    
    const nextOrder = maxOrderResult[0]?.maxOrder ? maxOrderResult[0].maxOrder + 1 : 1;

    // Create the cloned section
    const { id: _, createdAt: __, updatedAt: ___, ...sectionData } = originalSection;
    const [clonedSection] = await db
      .insert(assessmentSections)
      .values({
        ...sectionData,
        questionText: originalSection.questionText ? `${originalSection.questionText} (Copy)` : null,
        order: nextOrder
      })
      .returning();

    // Get the original section's marking options and clone them
    const originalMarkingOptions = await db
      .select()
      .from(sectionMarkingOptions)
      .where(eq(sectionMarkingOptions.sectionId, id))
      .orderBy(sectionMarkingOptions.order);

    // Clone each marking option for the new section
    if (originalMarkingOptions.length > 0) {
      const clonedOptions = originalMarkingOptions.map(option => {
        const { id: _, sectionId: __, createdAt: ___, updatedAt: ____, ...optionData } = option;
        return {
          ...optionData,
          sectionId: clonedSection.id
        };
      });

      await db.insert(sectionMarkingOptions).values(clonedOptions);
    }

    return clonedSection;
  }

  async reorderAssessmentSections(assessmentId: string, sectionIds: string[]): Promise<void> {
    for (let i = 0; i < sectionIds.length; i++) {
      await db
        .update(assessmentSections)
        .set({ order: i + 1, updatedAt: new Date() })
        .where(eq(assessmentSections.id, sectionIds[i]));
    }
  }

  // Section Marking Option operations
  async getSectionMarkingOptions(sectionId: string): Promise<SectionMarkingOption[]> {
    return await db.select()
      .from(sectionMarkingOptions)
      .where(
        and(
          eq(sectionMarkingOptions.sectionId, sectionId),
          eq(sectionMarkingOptions.isActive, "true")
        )
      )
      .orderBy(sectionMarkingOptions.order);
  }

  async getSectionMarkingOptionById(id: string): Promise<SectionMarkingOption | null> {
    const results = await db.select()
      .from(sectionMarkingOptions)
      .where(eq(sectionMarkingOptions.id, id))
      .limit(1);
    return results[0] || null;
  }

  async createSectionMarkingOption(option: InsertSectionMarkingOption): Promise<SectionMarkingOption> {
    const [newOption] = await db
      .insert(sectionMarkingOptions)
      .values(option)
      .returning();
    return newOption;
  }

  async updateSectionMarkingOption(id: string, optionData: Partial<InsertSectionMarkingOption>): Promise<SectionMarkingOption> {
    const [option] = await db
      .update(sectionMarkingOptions)
      .set({ ...optionData, updatedAt: new Date() })
      .where(eq(sectionMarkingOptions.id, id))
      .returning();
    return option;
  }

  async deleteSectionMarkingOption(id: string): Promise<void> {
    await db.delete(sectionMarkingOptions).where(eq(sectionMarkingOptions.id, id));
  }

  async reorderSectionMarkingOptions(sectionId: string, optionIds: string[]): Promise<void> {
    for (let i = 0; i < optionIds.length; i++) {
      await db
        .update(sectionMarkingOptions)
        .set({ order: i + 1, updatedAt: new Date() })
        .where(eq(sectionMarkingOptions.id, optionIds[i]));
    }
  }

  // Assessment Grade Boundary operations
  async getAssessmentGradeBoundaries(assessmentId: string): Promise<AssessmentGradeBoundary[]> {
    return await db.select()
      .from(assessmentGradeBoundaries)
      .where(
        and(
          eq(assessmentGradeBoundaries.assessmentId, assessmentId),
          eq(assessmentGradeBoundaries.isActive, "true")
        )
      )
      .orderBy(assessmentGradeBoundaries.order);
  }

  async createAssessmentGradeBoundary(boundary: InsertAssessmentGradeBoundary): Promise<AssessmentGradeBoundary> {
    const [newBoundary] = await db
      .insert(assessmentGradeBoundaries)
      .values(boundary)
      .returning();
    return newBoundary;
  }

  async updateAssessmentGradeBoundary(id: string, boundaryData: Partial<InsertAssessmentGradeBoundary>): Promise<AssessmentGradeBoundary> {
    const [boundary] = await db
      .update(assessmentGradeBoundaries)
      .set({ ...boundaryData, updatedAt: new Date() })
      .where(eq(assessmentGradeBoundaries.id, id))
      .returning();
    return boundary;
  }

  async deleteAssessmentGradeBoundary(id: string): Promise<void> {
    await db.delete(assessmentGradeBoundaries).where(eq(assessmentGradeBoundaries.id, id));
  }

  async reorderAssessmentGradeBoundaries(assessmentId: string, boundaryIds: string[]): Promise<void> {
    for (let i = 0; i < boundaryIds.length; i++) {
      await db
        .update(assessmentGradeBoundaries)
        .set({ order: i + 1, updatedAt: new Date() })
        .where(eq(assessmentGradeBoundaries.id, boundaryIds[i]));
    }
  }

  async calculateAssessmentTotalMarks(assessmentId: string): Promise<number> {
    // Get all sections for this assessment
    const sections = await db.select()
      .from(assessmentSections)
      .where(
        and(
          eq(assessmentSections.assessmentId, assessmentId),
          eq(assessmentSections.isActive, "true")
        )
      );

    let totalMarks = 0;

    // For each section, calculate marks
    for (const section of sections) {
      // First try to get marks from marking options
      const markingOptions = await db.select()
        .from(sectionMarkingOptions)
        .where(
          and(
            eq(sectionMarkingOptions.sectionId, section.id),
            eq(sectionMarkingOptions.isActive, "true")
          )
        );

      if (markingOptions.length > 0) {
        // Get the maximum marks from the marking options for this section
        const maxMarksForSection = Math.max(...markingOptions.map(option => option.marks));
        totalMarks += maxMarksForSection;
      }
      // If no marking options exist for a section, it contributes 0 marks to the total
    }

    return totalMarks;
  }

  async updateAssessmentTotalMarks(assessmentId: string): Promise<void> {
    // Calculate the new total marks
    const totalMarks = await this.calculateAssessmentTotalMarks(assessmentId);
    
    // Update the assessment with the new total marks
    await db
      .update(assessments)
      .set({ totalMarks, updatedAt: new Date() })
      .where(eq(assessments.id, assessmentId));
  }

  // User instruction agreement operations - for audit tracking
  async createUserInstructionAgreement(agreement: InsertUserInstructionAgreement): Promise<UserInstructionAgreement> {
    const [newAgreement] = await db
      .insert(userInstructionAgreements)
      .values(agreement)
      .returning();
    return newAgreement;
  }

  async getUserInstructionAgreementBySubmission(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement | undefined> {
    const [agreement] = await db
      .select()
      .from(userInstructionAgreements)
      .where(and(
        eq(userInstructionAgreements.assignmentSubmissionId, assignmentSubmissionId),
        eq(userInstructionAgreements.instructionSetId, instructionSetId)
      ));
    return agreement || undefined;
  }

  async updateUserInstructionAgreement(id: string, agreementData: Partial<InsertUserInstructionAgreement>): Promise<UserInstructionAgreement> {
    const [agreement] = await db
      .update(userInstructionAgreements)
      .set({ ...agreementData, updatedAt: new Date() })
      .where(eq(userInstructionAgreements.id, id))
      .returning();
    return agreement;
  }

  async upsertUserInstructionAgreement(agreement: InsertUserInstructionAgreement): Promise<UserInstructionAgreement> {
    // Check if agreement already exists
    const existing = await this.getUserInstructionAgreementBySubmission(agreement.assignmentSubmissionId!, agreement.instructionSetId!);
    
    if (existing) {
      // Update existing agreement
      return await this.updateUserInstructionAgreement(existing.id, agreement);
    } else {
      // Create new agreement
      return await this.createUserInstructionAgreement(agreement);
    }
  }

  async updateStepAgreement(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement> {
    const timestamp = new Date();
    
    // Get or create agreement record
    const existing = await this.getUserInstructionAgreementBySubmission(assignmentSubmissionId, instructionSetId);
    
    if (existing) {
      return await this.updateUserInstructionAgreement(existing.id, {
        stepAgreementAt: timestamp
      });
    } else {
      // Create new agreement with step agreement timestamp
      return await this.createUserInstructionAgreement({
        assignmentSubmissionId,
        instructionSetId,
        stepAgreementAt: timestamp,
        turnitinAgreementAt: null,
        finalSubmissionAt: null
      });
    }
  }

  async updateTurnitinAgreement(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement> {
    const timestamp = new Date();
    
    // Get or create agreement record
    const existing = await this.getUserInstructionAgreementBySubmission(assignmentSubmissionId, instructionSetId);
    
    if (existing) {
      return await this.updateUserInstructionAgreement(existing.id, {
        turnitinAgreementAt: timestamp
      });
    } else {
      // Create new agreement with TurnItIn agreement
      return await this.createUserInstructionAgreement({
        assignmentSubmissionId,
        instructionSetId,
        stepAgreementAt: null,
        turnitinAgreementAt: timestamp,
        finalSubmissionAt: null
      });
    }
  }

  async markFinalSubmission(assignmentSubmissionId: string, instructionSetId: string): Promise<UserInstructionAgreement> {
    const timestamp = new Date();
    
    // Get existing agreement record
    const existing = await this.getUserInstructionAgreementBySubmission(assignmentSubmissionId, instructionSetId);
    
    if (existing) {
      return await this.updateUserInstructionAgreement(existing.id, {
        finalSubmissionAt: timestamp
      });
    } else {
      // Create new agreement with final submission
      return await this.createUserInstructionAgreement({
        assignmentSubmissionId,
        instructionSetId,
        stepAgreementAt: null,
        turnitinAgreementAt: null,
        finalSubmissionAt: timestamp
      });
    }
  }

  async getAssignmentSubmissionByLtiLaunchId(ltiLaunchId: string): Promise<AssignmentSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(assignmentSubmissions)
      .where(eq(assignmentSubmissions.ltiLaunchId, ltiLaunchId))
      .orderBy(desc(assignmentSubmissions.submittedAt))
      .limit(1);
    return submission || undefined;
  }

  async getOrCreatePlaceholderSubmission(ltiLaunchId: string): Promise<AssignmentSubmission> {
    // Try to get existing submission first
    const existing = await this.getAssignmentSubmissionByLtiLaunchId(ltiLaunchId);
    if (existing) {
      return existing;
    }

    // Get LTI session record to populate submission data
    const sessionRecord = await this.getLtiSessionRecord(ltiLaunchId);
    if (!sessionRecord) {
      throw new Error(`LTI session record not found for launch ID: ${ltiLaunchId}`);
    }

    // Create placeholder submission
    const placeholderSubmission: InsertAssignmentSubmission = {
      ltiSessionRecordId: sessionRecord.id,
      ltiLaunchId: ltiLaunchId,
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
      customInstructionSet: null,
      fileCount: 0,
      totalFileSize: '0MB'
    };

    return await this.createSubmission(placeholderSubmission);
  }

  // Submission marking methods
  async getSubmissionGrade(submissionId: string): Promise<SubmissionGrade | undefined> {
    const [grade] = await db
      .select()
      .from(submissionGrades)
      .where(eq(submissionGrades.submissionId, submissionId));
    return grade || undefined;
  }

  async getSubmissionSectionMarks(submissionId: string): Promise<SubmissionSectionMark[]> {
    return await db
      .select()
      .from(submissionSectionMarks)
      .where(eq(submissionSectionMarks.submissionId, submissionId));
  }

  async createSubmissionGrade(gradeData: InsertSubmissionGrade): Promise<SubmissionGrade> {
    const [grade] = await db
      .insert(submissionGrades)
      .values(gradeData)
      .returning();
    return grade;
  }

  async updateSubmissionGrade(submissionId: string, gradeData: Partial<InsertSubmissionGrade>): Promise<SubmissionGrade> {
    const [grade] = await db
      .update(submissionGrades)
      .set({ ...gradeData, updatedAt: new Date() })
      .where(eq(submissionGrades.submissionId, submissionId))
      .returning();
    return grade;
  }

  async updateSubmissionGradeWordCount(submissionId: string, wordCount: number): Promise<void> {
    const existingGrade = await this.getSubmissionGrade(submissionId);
    
    if (existingGrade) {
      await db
        .update(submissionGrades)
        .set({ wordCount, updatedAt: new Date() })
        .where(eq(submissionGrades.submissionId, submissionId));
    } else {
      await db
        .insert(submissionGrades)
        .values({
          submissionId,
          wordCount,
        });
    }
  }

  async createSubmissionSectionMark(markData: InsertSubmissionSectionMark): Promise<SubmissionSectionMark> {
    const [mark] = await db
      .insert(submissionSectionMarks)
      .values(markData)
      .returning();
    return mark;
  }

  async updateSubmissionSectionMark(id: string, markData: Partial<InsertSubmissionSectionMark>): Promise<SubmissionSectionMark> {
    const [mark] = await db
      .update(submissionSectionMarks)
      .set({ ...markData, updatedAt: new Date() })
      .where(eq(submissionSectionMarks.id, id))
      .returning();
    return mark;
  }

  async deleteSubmissionSectionMark(id: string): Promise<void> {
    await db.delete(submissionSectionMarks).where(eq(submissionSectionMarks.id, id));
  }
}

export const storage = new DatabaseStorage();
