CREATE TYPE "public"."assessment_status" AS ENUM('active', 'inactive', 'draft', 'archived');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('formative', 'summative', 'diagnostic', 'competency');--> statement-breakpoint
CREATE TYPE "public"."instruction_step_type" AS ENUM('info', 'checkbox', 'upload');--> statement-breakpoint
CREATE TYPE "public"."marking_status" AS ENUM('waiting', 'being_marked', 'on_hold', 'approval_needed', 'marking_skipped', 'released');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'admin', 'marker', 'tutor', 'iqa', 'student');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'pending');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_identifier" text NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_key_identifier_unique" UNIQUE("key_identifier")
);
--> statement-breakpoint
CREATE TABLE "assessment_grade_boundaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" varchar,
	"grade_label" text NOT NULL,
	"marks_from" integer NOT NULL,
	"marks_to" integer NOT NULL,
	"is_pass" boolean DEFAULT false NOT NULL,
	"order" integer NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessment_sections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" varchar,
	"type" text,
	"question_text" text,
	"order" integer NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_node_id" varchar,
	"instruction_set_id" varchar,
	"assessment_id" text DEFAULT 'ASS_' || substr(gen_random_uuid()::text, 1, 8) NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "assessment_type" DEFAULT 'summative' NOT NULL,
	"status" "assessment_status" DEFAULT 'active' NOT NULL,
	"eligibility_prerequisites" text[],
	"total_marks" integer DEFAULT 0 NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "assessments_assessment_id_unique" UNIQUE("assessment_id"),
	CONSTRAINT "assessments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "assignment_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lti_session_record_id" varchar,
	"lti_launch_id" varchar NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"total_file_size" text,
	"submitted_at" timestamp with time zone DEFAULT now(),
	"attempt_number" integer,
	"lms_user_id" text,
	"consumer_name" text,
	"role" text,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"email" text,
	"custom_instruction_set" text,
	"custom_assessment_code" text,
	"custom_action" text,
	"context_type" text,
	"context_title" text,
	"context_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "course_nodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" varchar,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"hubspot_email_id" text,
	"template_name" text NOT NULL,
	"description" text,
	"subject" text,
	"html_content" text,
	"text_content" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "email_templates_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
CREATE TABLE "instruction_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"instruction_set_code" text,
	"completion_message" text,
	"submission_title" text,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "instruction_sets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "instruction_sets_instruction_set_code_unique" UNIQUE("instruction_set_code")
);
--> statement-breakpoint
CREATE TABLE "instruction_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instruction_set_id" varchar,
	"step_number" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"step_type" "instruction_step_type" DEFAULT 'info' NOT NULL,
	"checkbox_items" text[],
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lti_launch_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"launch_id" text NOT NULL,
	"consumer_key" text NOT NULL,
	"user_id" text,
	"user_email" text,
	"user_name" text,
	"course_name" text,
	"return_url" text,
	"resource_link_id" text,
	"context_id" text,
	"tool_consumer_instance_guid" text,
	"custom_params" text,
	"lti_message_type" text,
	"context_type" text,
	"context_title" text,
	"roles" text,
	"lis_person_name_given" text,
	"lis_person_name_family" text,
	"lis_person_name_full" text,
	"lis_person_contact_email_primary" text,
	"tool_consumer_instance_name" text,
	"custom_action" text,
	"assignment_title" text,
	"custom_instruction_set" text,
	"custom_assessment_code" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lti_launch_sessions_launch_id_unique" UNIQUE("launch_id")
);
--> statement-breakpoint
CREATE TABLE "lti_session_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"launch_id" text NOT NULL,
	"lms_user_id" text,
	"consumer_name" text,
	"role" text,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"email" text,
	"custom_action" text,
	"custom_instruction_set" text,
	"custom_assessment_code" text,
	"context_type" text,
	"context_title" text,
	"resource_link_id" text,
	"resource_link_title" text,
	"context_id" text,
	"consumer_key" text,
	"tool_consumer_instance_guid" text,
	"return_url" text,
	"has_file_submission" text DEFAULT 'false',
	"session_expiry" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lti_session_records_launch_id_unique" UNIQUE("launch_id")
);
--> statement-breakpoint
CREATE TABLE "lti_viewer_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_token" text NOT NULL,
	"launch_id" text NOT NULL,
	"lms_user_id" text NOT NULL,
	"submission_id" varchar NOT NULL,
	"context_id" text,
	"attempt_number" integer,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "lti_viewer_sessions_viewer_token_unique" UNIQUE("viewer_token")
);
--> statement-breakpoint
CREATE TABLE "malpractice_enforcements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lms_user_id" text NOT NULL,
	"custom_assessment_code" text NOT NULL,
	"context_id" text,
	"context_title" text,
	"malpractice_level_id" varchar NOT NULL,
	"submission_id" varchar,
	"attempt_number" integer,
	"enforced_max_attempts" integer,
	"rule_applied_by" varchar NOT NULL,
	"rule_applied_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "malpractice_levels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_text" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "section_marking_options" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" varchar,
	"label" text NOT NULL,
	"marks" integer NOT NULL,
	"order" integer NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skip_reasons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason_text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" varchar,
	"file_name" text NOT NULL,
	"original_file_name" text NOT NULL,
	"file_size" text,
	"file_type" text,
	"file_mime_type" text,
	"file_url" text NOT NULL,
	"azure_blob_url" text,
	"azure_container_name" text DEFAULT 'rogoreplacement',
	"azure_blob_name" text,
	"upload_order" integer DEFAULT 1 NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now(),
	"turnitin_submission_id" text,
	"turnitin_status" text DEFAULT 'pending',
	"turnitin_similarity_score" integer,
	"turnitin_processed_at" timestamp with time zone,
	"turnitin_error_message" text,
	"turnitin_pdf_id" text,
	"turnitin_pdf_status" text DEFAULT 'pending',
	"turnitin_pdf_url" text,
	"turnitin_report_url" text,
	"turnitin_pdf_generated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "submission_grades" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" varchar,
	"assessment_id" varchar,
	"marker_id" varchar,
	"total_marks_awarded" real DEFAULT 0,
	"total_marks_possible" real DEFAULT 0,
	"percentage_score" real DEFAULT 0,
	"final_grade" text,
	"overall_summary" text,
	"skip_reason_id" varchar,
	"skipped_reason" text,
	"malpractice_level_id" varchar,
	"malpractice_notes" text,
	"word_count" integer,
	"is_complete" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "submission_grades_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "submission_marking_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" varchar,
	"assigned_marker_id" varchar,
	"marking_status" "marking_status" DEFAULT 'waiting' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"status_updated_at" timestamp with time zone DEFAULT now(),
	"status_updated_by" varchar,
	"notes" text,
	"hold_reason" text,
	"priority" integer DEFAULT 0,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "submission_section_marks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" varchar,
	"section_id" varchar,
	"marker_id" varchar,
	"selected_option_id" varchar,
	"feedback" text,
	"marks_awarded" real DEFAULT 0,
	"marking_criterias" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" varchar,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "turnitin_eula_acceptances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"eula_version" text NOT NULL,
	"language" text DEFAULT 'en-US' NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_instruction_agreements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_submission_id" varchar,
	"instruction_set_id" varchar,
	"step_agreement_at" timestamp with time zone,
	"turnitin_agreement_at" timestamp with time zone,
	"final_submission_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"session_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"department" text,
	"profile_image_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_grade_boundaries" ADD CONSTRAINT "assessment_grade_boundaries_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_node_id_course_nodes_id_fk" FOREIGN KEY ("course_node_id") REFERENCES "public"."course_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_instruction_set_id_instruction_sets_id_fk" FOREIGN KEY ("instruction_set_id") REFERENCES "public"."instruction_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_lti_session_record_id_lti_session_records_id_fk" FOREIGN KEY ("lti_session_record_id") REFERENCES "public"."lti_session_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruction_steps" ADD CONSTRAINT "instruction_steps_instruction_set_id_instruction_sets_id_fk" FOREIGN KEY ("instruction_set_id") REFERENCES "public"."instruction_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lti_viewer_sessions" ADD CONSTRAINT "lti_viewer_sessions_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malpractice_enforcements" ADD CONSTRAINT "malpractice_enforcements_malpractice_level_id_malpractice_levels_id_fk" FOREIGN KEY ("malpractice_level_id") REFERENCES "public"."malpractice_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malpractice_enforcements" ADD CONSTRAINT "malpractice_enforcements_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "malpractice_enforcements" ADD CONSTRAINT "malpractice_enforcements_rule_applied_by_users_id_fk" FOREIGN KEY ("rule_applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_marking_options" ADD CONSTRAINT "section_marking_options_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_marker_id_users_id_fk" FOREIGN KEY ("marker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_skip_reason_id_skip_reasons_id_fk" FOREIGN KEY ("skip_reason_id") REFERENCES "public"."skip_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_grades" ADD CONSTRAINT "submission_grades_malpractice_level_id_malpractice_levels_id_fk" FOREIGN KEY ("malpractice_level_id") REFERENCES "public"."malpractice_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_marking_assignments" ADD CONSTRAINT "submission_marking_assignments_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_marking_assignments" ADD CONSTRAINT "submission_marking_assignments_assigned_marker_id_users_id_fk" FOREIGN KEY ("assigned_marker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_marking_assignments" ADD CONSTRAINT "submission_marking_assignments_status_updated_by_users_id_fk" FOREIGN KEY ("status_updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_section_marks" ADD CONSTRAINT "submission_section_marks_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_section_marks" ADD CONSTRAINT "submission_section_marks_section_id_assessment_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."assessment_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_section_marks" ADD CONSTRAINT "submission_section_marks_marker_id_users_id_fk" FOREIGN KEY ("marker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnitin_eula_acceptances" ADD CONSTRAINT "turnitin_eula_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_instruction_agreements" ADD CONSTRAINT "user_instruction_agreements_assignment_submission_id_assignment_submissions_id_fk" FOREIGN KEY ("assignment_submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_instruction_agreements" ADD CONSTRAINT "user_instruction_agreements_instruction_set_id_instruction_sets_id_fk" FOREIGN KEY ("instruction_set_id") REFERENCES "public"."instruction_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assignment_submissions_context_title" ON "assignment_submissions" USING btree ("context_title");