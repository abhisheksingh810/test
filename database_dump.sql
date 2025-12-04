-- Complete database dump for OGOR Platform
-- Generated on August 12, 2025

-- Create ENUM types
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'admin', 'marker', 'tutor', 'iqa', 'student');
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'pending');
CREATE TYPE "public"."instruction_step_type" AS ENUM('info', 'checkbox', 'upload');

-- Create tables
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" text NOT NULL UNIQUE,
	"email" text NOT NULL UNIQUE,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"role" "user_role" NOT NULL DEFAULT 'student',
	"status" "user_status" NOT NULL DEFAULT 'active',
	"department" text,
	"profile_image_url" text,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text NOT NULL UNIQUE,
	"value" text,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_key" text NOT NULL UNIQUE,
	"hubspot_email_id" text,
	"template_name" text NOT NULL,
	"description" text,
	"subject" text,
	"html_content" text,
	"text_content" text,
	"is_active" text NOT NULL DEFAULT 'true',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" varchar NOT NULL REFERENCES "users"("id"),
	"session_token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" varchar NOT NULL REFERENCES "users"("id"),
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"used" text NOT NULL DEFAULT 'false',
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lti_session_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"launch_id" text NOT NULL UNIQUE,
	"lms_user_id" text,
	"consumer_name" text,
	"role" text,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"email" text,
	"custom_assessment_code" text,
	"custom_action" text,
	"context_type" text,
	"context_title" text,
	"resource_link_id" text,
	"resource_link_title" text,
	"context_id" text,
	"consumer_key" text,
	"tool_consumer_instance_guid" text,
	"return_url" text,
	"has_file_submission" text DEFAULT 'false',
	"session_expiry" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "assignment_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"lti_session_record_id" varchar REFERENCES "lti_session_records"("id"),
	"lti_launch_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_size" text,
	"file_type" text,
	"file_url" text NOT NULL,
	"azure_blob_url" text,
	"azure_container_name" text DEFAULT 'rogoreplacement',
	"azure_blob_name" text,
	"submitted_at" timestamp DEFAULT now(),
	"lms_user_id" text,
	"consumer_name" text,
	"role" text,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"email" text,
	"custom_assessment_code" text,
	"custom_action" text,
	"context_type" text,
	"context_title" text,
	"student_user_id" text,
	"student_email" text,
	"student_name" text,
	"course_name" text,
	"assignment_title" text
);

CREATE TABLE IF NOT EXISTS "lti_launch_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"launch_id" text NOT NULL UNIQUE,
	"consumer_key" text NOT NULL,
	"user_id" text,
	"user_email" text,
	"user_name" text,
	"course_name" text,
	"assignment_title" text,
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
	"custom_assessment_code" text,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "instruction_sets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"slug" text NOT NULL UNIQUE,
	"assessment_code" text UNIQUE,
	"is_active" text NOT NULL DEFAULT 'true',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "instruction_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
	"instruction_set_id" varchar REFERENCES "instruction_sets"("id") ON DELETE CASCADE,
	"step_number" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"step_type" "instruction_step_type" NOT NULL DEFAULT 'info',
	"checkbox_items" text[],
	"is_active" text NOT NULL DEFAULT 'true',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Insert users data
INSERT INTO "users" ("id", "username", "email", "password", "first_name", "last_name", "role", "status", "department", "profile_image_url", "last_login_at", "created_at", "updated_at") VALUES
('763a82a0-f9ee-4e84-89e4-85110b4e8efc', 'abhinav', 'Abhinav.Das@avadolearning.com', '$2b$10$CtyQujQd7PEmccabW3fhTeBl2UsEAY8ldcGw7zwd4ol4tB7GaY7We', 'Abhinav', 'Das', 'superadmin', 'active', NULL, NULL, NULL, '2025-08-06 02:52:46.232805', '2025-08-06 10:12:41.433'),
('483b9e51-7f46-4db7-b70e-1563ece70340', 'abhinavdas', 'abhinav.das@blenheimchalcot.com', '$2b$10$I4YAjshPqH/tJb9/EjHzk.6avzAZHfT/eRwybYWQXjIpBMJZZDLZW', NULL, NULL, 'admin', 'pending', NULL, NULL, NULL, '2025-08-11 10:50:58.139986', '2025-08-11 10:50:58.139986');

-- Insert system_settings data
INSERT INTO "system_settings" ("id", "key", "value", "description", "updated_at", "updated_by") VALUES
('91b65e33-07de-4b8e-bd20-c3d6519938a2', 'platform_name', 'OGOR', 'Platform display name', '2025-08-06 10:13:59.946', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('adeddee2-c7a5-4fc8-8185-7094d5f82ba0', 'turnitin_search_submitted_work', 'true', 'Search Submitted Work', '2025-08-11 14:58:02.368', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('7de20f94-8df7-4a61-9463-5cb4ca9d83ac', 'password_policy', 'standard', 'Password complexity requirements', '2025-08-11 14:58:01.98', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('d1b6489f-ca10-49ce-b47b-50dbf723284d', 'require_two_factor', 'false', 'Require 2FA for admin accounts', '2025-08-11 14:58:02.005', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('4e82acd3-78f7-40d3-b60b-b1403bef68fa', 'hubspot_smtp_host', 'smtp-eu1.hubapi.com', 'HubSpot SMTP server host', '2025-08-11 14:58:02.029', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('0b99d323-3076-40b2-ba62-99cd1952cd30', 'hubspot_smtp_port', '587', 'HubSpot SMTP server port', '2025-08-11 14:58:02.052', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('a2c47f01-d41a-4f2c-a660-b35b6860cf97', 'hubspot_smtp_username', 'pizoperoqn@511436.smtp.hubspot.net', 'HubSpot SMTP username', '2025-08-11 14:58:02.075', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('5f4fe798-72f2-4cc3-8ac2-f3d91ab11cb7', 'hubspot_smtp_password', 'Qk2rPKtJdTxYsR5OgcOayxkkwy9oJj', 'HubSpot SMTP password', '2025-08-11 14:58:02.099', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('e6394d23-77a2-4046-83be-503b1731a2d2', 'hubspot_smtp_from_email', 'abhinav.das@avadolearning.com', 'HubSpot SMTP from email address', '2025-08-11 14:58:02.123', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('6e166d5a-ff5e-4c08-8d8e-b79ed4fc83fe', 'hubspot_smtp_from_name', 'Avado OGOR Platform', 'HubSpot SMTP from name', '2025-08-11 14:58:02.148', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('7c2b8b14-900b-4f7c-8a75-beecad6785e0', 'hubspot_smtp_use_tls', 'true', 'HubSpot SMTP use TLS encryption', '2025-08-11 14:58:02.172', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('e73a5195-0638-4fc5-a462-9aa690e4e9a8', 'turnitin_api_url', 'https://avadolearning.tii-sandbox.com/api/v1', 'TurnItIn API URL', '2025-08-11 14:58:02.2', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('cb4bc7b2-c1a4-416f-bab0-a025910ac97d', 'turnitin_api_key', '17f5d0774a75437983f71ed09724e7a4', 'TurnItIn API Key', '2025-08-11 14:58:02.224', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('9831acb1-d22a-4aa8-865f-416ca65c1087', 'turnitin_index_all_submissions', 'true', 'Index all submissions', '2025-08-11 14:58:02.248', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('5afbbd57-59de-4976-965c-448bcd32f9e5', 'turnitin_search_internet', 'true', 'Search Internet', '2025-08-11 14:58:02.271', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('4875c042-027a-45d2-be13-15c558e43d7b', 'turnitin_search_publication', 'true', 'Search Publications', '2025-08-11 14:58:02.296', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('4617d332-dbed-4b98-b70d-239e9c7be70b', 'turnitin_search_crossref', 'true', 'Search Crossref', '2025-08-11 14:58:02.321', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('bf087c4d-5647-468f-b172-b6679b9d1e9d', 'turnitin_search_crossref_posted', 'true', 'Search Crossref Posted Content', '2025-08-11 14:58:02.345', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('6cb1c96c-63ab-4c43-94d9-0fda66e13fc9', 'timezone', 'Europe/London', 'Default system timezone', '2025-08-11 14:58:01.862', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('0ef3e490-3b16-41b9-ab8e-0006fa21a724', 'lti_consumer_key', 'Something', 'LTI consumer key for integration', '2025-08-11 14:58:01.907', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('5d916426-7d66-4ee2-aeea-b708b5d6e14b', 'lti_shared_secret', 'Something', 'LTI shared secret', '2025-08-11 14:58:01.931', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('e22ade8f-231f-47a5-a647-491df30fdff5', 'session_timeout', '60', 'Session timeout in minutes', '2025-08-11 14:58:01.956', '763a82a0-f9ee-4e84-89e4-85110b4e8efc'),
('1f05b9f6-6da8-454e-8672-7c3324bfe9f8', 'lti_endpoint', '', 'ThoughtIndustries LMS endpoint URL', '2025-08-06 11:56:26.263', '763a82a0-f9ee-4e84-89e4-85110b4e8efc');

-- Insert email_templates data
INSERT INTO "email_templates" ("id", "template_key", "hubspot_email_id", "template_name", "description", "is_active", "created_at", "updated_at", "subject", "html_content", "text_content") VALUES
('a5ef62d9-0578-4618-b513-b229dbc04f68', 'invite_user', NULL, 'User Invitation Email', 'Email sent when inviting new users to the platform. Available variables: {{ user_name }}, {{ user_role }}, {{ temp_password }}, {{ login_url }}, {{ platform_name }}', 'true', '2025-08-11 21:19:56.810397', '2025-08-11 21:19:56.810397', 'You have been invited to join {{ platform_name }}', '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;"><h2 style="color: #2563eb; margin: 0;">Welcome to {{ platform_name }}!</h2></div><p>Hello {{ user_name }},</p><p>You have been invited to join the E-Assessment Platform as a <strong>{{ user_role }}</strong>.</p><p>Your account has been created with the following login credentials:</p><div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;"><p><strong>Username:</strong> {{ user_name }}</p><p><strong>Temporary Password:</strong> <code style="background-color: #e9ecef; padding: 2px 4px; border-radius: 3px; font-family: monospace;">{{ temp_password }}</code></p></div><div style="text-align: center; margin: 30px 0;"><a href="{{ login_url }}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Login to Platform</a></div><p>If the button doesn''t work, you can copy and paste this link into your browser:</p><p style="word-break: break-all; color: #2563eb;">{{ login_url }}</p><div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 20px 0;"><p style="margin: 0;"><strong>Important:</strong> You will be required to change your password on first login for security reasons.</p></div><hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="font-size: 12px; color: #666;">If you didn''t expect this invitation, you can safely ignore this email.</p></body></html>', 'Welcome to {{ platform_name }}! Hello {{ user_name }}, You have been invited to join the E-Assessment Platform as a {{ user_role }}. Your account has been created with the following login credentials: Username: {{ user_name }} Temporary Password: {{ temp_password }} To log in and set up your account, please visit: {{ login_url }} Important: You will be required to change your password on first login for security reasons. If you didn''t expect this invitation, you can safely ignore this email.'),
('d74af28e-30e0-4a9f-be0f-fcd12ee52ee8', 'forgot_password', NULL, 'Forgot Password Email', 'Email sent when users request a password reset. Available variables: {{ reset_url }}, {{ user_name }}, {{ platform_name }}', 'true', '2025-08-11 21:19:56.810397', '2025-08-11 21:19:56.810397', 'Password Reset Request - {{ platform_name }}', '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;"><h2 style="color: #dc3545; margin: 0;">Password Reset Request</h2></div><p>Hello {{ user_name }},</p><p>We received a request to reset your password for your {{ platform_name }} account.</p><div style="text-align: center; margin: 30px 0;"><a href="{{ reset_url }}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a></div><p>If the button doesn''t work, you can copy and paste this link into your browser:</p><p style="word-break: break-all; color: #dc3545;">{{ reset_url }}</p><div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 5px; margin: 20px 0;"><p style="margin: 0;"><strong>Security Notice:</strong> This link will expire in 1 hour for your security.</p></div><hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;"><p style="font-size: 12px; color: #666;">If you didn''t request a password reset, you can safely ignore this email. Your password will not be changed.</p></body></html>', 'Password Reset Request - {{ platform_name }} Hello {{ user_name }}, We received a request to reset your password for your {{ platform_name }} account. To reset your password, please visit: {{ reset_url }} Security Notice: This link will expire in 1 hour for your security. If you didn''t request a password reset, you can safely ignore this email. Your password will not be changed.');

-- Insert instruction_sets data
INSERT INTO "instruction_sets" ("id", "name", "description", "slug", "is_active", "created_at", "updated_at", "assessment_code") VALUES
('368c13cc-9345-44a2-b572-a162dcd11c89', 'something', NULL, 'something', 'true', '2025-08-11 13:08:02.573466', '2025-08-11 13:08:02.573466', 'something'),
('4ae97e4b-68bf-4f33-9d9b-f89f3b65eeb2', 'TEST', NULL, 'test', 'true', '2025-08-11 13:28:39.575434', '2025-08-11 13:28:39.575434', 'TEST');

-- Insert instruction_steps data  
INSERT INTO "instruction_steps" ("id", "step_number", "title", "content", "step_type", "checkbox_items", "is_active", "created_at", "updated_at", "instruction_set_id") VALUES
('4afe2764-5481-421c-a5fa-f7bf14a817e6', '1', 'Welcome to the assessment', '<p>Welcome to your assessment submission portal. Please review the instructions carefully before proceeding with your submission.</p>', 'info', '{}', 'true', '2025-08-11 13:08:02.613519', '2025-08-11 13:08:02.613519', '368c13cc-9345-44a2-b572-a162dcd11c89'),
('643cf5b6-9c1f-48c2-99e7-0753690a90f6', '2', 'How to submit your assessment', '<p>Please ensure your submission meets all requirements:</p><ul><li>File format must be PDF, DOC, or DOCX</li><li>Include your CIPD membership number on the front cover</li><li>Add accurate word count to your front cover</li><li>Check all formatting requirements</li></ul>', 'info', '{}', 'true', '2025-08-11 13:08:02.643134', '2025-08-11 13:08:02.643134', '368c13cc-9345-44a2-b572-a162dcd11c89'),
('8ae3b4a1-f2c7-4e52-8857-135af3f8ddb5', '3', 'Please confirm agreement to the statement(s)', '<p>Before proceeding to upload your assignment, please confirm that you agree to all the following statements:</p>', 'checkbox', '{"I confirm I''ve read and understood the submission instructions and previous feedback and I answered \"Yes\" to all questions on the Submission requirements page.","I confirm that my work does not contain any AI generated content.","I confirm that I have added the first 7 digits of my CIPD membership number accurately to my front cover.","I confirm that I have added the accurate word count to my front cover.","I confirm that I have read the assessment regulations and understand that if I am found to have ''copied'' from published work without acknowledgment, or from other learner''s work, this may be regarded as plagiarism and an assessment offence and leads to failure in the relevant unit and formal disciplinary action in line with the Avado''s malpractice policy.","I agree to this work being subjected to scrutiny by textual analysis software.","I understand that my work may be used for future academic/quality assurance purposes in accordance with the provisions of Data Protection legislation.","I understand that the work/evidence submitted for assessment may not be returned to me and that I have retained a copy for my records.","I understand that until such time as the assessment grade has been confirmed through internal quality assurance and CIPD moderation it is not final.","I understand the consequences of malpractice and accept that any violation of this agreement may result in disciplinary action."}', 'true', '2025-08-11 13:08:02.667916', '2025-08-11 13:08:02.667916', '368c13cc-9345-44a2-b572-a162dcd11c89'),
('b0631e67-fc53-44d5-bd9a-6ee4f5e07aea', '1', 'TEST: Welcome to the assessment', '<p>Welcome to your assessment submission portal. Please review the instructions carefully before proceeding with your submission.</p>', 'info', '{}', 'true', '2025-08-11 13:59:52.263982', '2025-08-11 13:59:52.263982', '4ae97e4b-68bf-4f33-9d9b-f89f3b65eeb2'),
('d6ab9d85-36e5-4470-b665-c0d5f6624c5b', '2', 'TEST: How to submit your assessment', '<p>Please ensure your submission meets all requirements:</p><ul><li>File format must be PDF, DOC, or DOCX</li><li>Include your CIPD membership number on the front cover</li><li>Add accurate word count to your front cover</li><li>Check all formatting requirements</li></ul>', 'info', '{}', 'true', '2025-08-11 13:59:52.298199', '2025-08-11 13:59:52.298199', '4ae97e4b-68bf-4f33-9d9b-f89f3b65eeb2'),
('95fc1ca9-8d00-4fea-8bec-93c079dde4e1', '3', 'TEST: Please confirm agreement to the statement(s)', '<p>Before proceeding to upload your assignment, please confirm that you agree to all the following statements:</p>', 'checkbox', '{"Dummy checkbox 1"}', 'true', '2025-08-11 13:59:52.322459', '2025-08-11 13:59:52.322459', '4ae97e4b-68bf-4f33-9d9b-f89f3b65eeb2');

-- Note: LTI session data and assignment submissions contain sensitive information and file references
-- These should be migrated separately if needed
-- The structure is preserved above but data insertion is omitted for security reasons

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_lti_session_records_launch_id ON lti_session_records(launch_id);
CREATE INDEX IF NOT EXISTS idx_lti_launch_sessions_launch_id ON lti_launch_sessions(launch_id);
CREATE INDEX IF NOT EXISTS idx_instruction_sets_slug ON instruction_sets(slug);
CREATE INDEX IF NOT EXISTS idx_instruction_sets_assessment_code ON instruction_sets(assessment_code);