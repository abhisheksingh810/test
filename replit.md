# Overview

Avado is a full-stack e-assessment platform designed to streamline assessment processes and user management for educational institutions. It supports diverse roles (superadmins, admins, markers, tutors, IQA, students) with hierarchical access control. The platform offers comprehensive user management, flexible system settings, and advanced assessment capabilities to provide a versatile and scalable solution for academic environments.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Technology Stack**: React with TypeScript, functional components, and hooks.
- **Styling**: Tailwind CSS and shadcn/ui.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **Form Handling**: React Hook Form with Zod.
- **Build Tool**: Vite.

## Backend Architecture
- **Technology Stack**: Node.js with Express and TypeScript.
- **Authentication**: Session-based authentication using bcrypt.
- **Database Layer**: Drizzle ORM.
- **Middleware**: Custom authentication and RBAC middleware.
- **API Design**: RESTful endpoints with structured error handling.

## Database Design
- **Database System**: PostgreSQL on Neon serverless.
- **Schema Management**: Drizzle migrations.
- **Core Tables**: Users (with roles), User Sessions, System Settings, Course Nodes (hierarchical), Assessments, Assessment Sections, Grade Boundaries, Skip Reasons, Malpractice Levels, LTI Viewer Sessions.
- **Hierarchical Data**: Unlimited nesting for course nodes (e.g., departments → programs).
- **Role Hierarchy**: Structured permission system where higher roles inherit lower role permissions.
- **UTC Timestamps**: All timestamps stored in UTC.
- **Data Integrity**: Unique constraints on assessment codes/names; foreign key relationships for marking settings.
- **Token Security**: Viewer tokens stored as SHA-256 hashes with access tracking and automatic expiry.

## Authentication & Authorization
- **Session Management**: Cookie-based sessions.
- **Role-Based Access Control (RBAC)**: Hierarchical permissions.
- **Route Protection**: Frontend and backend.
- **Password Security**: Bcrypt hashing.

## Project Structure
- **Monorepo**: `client/`, `server/`, `shared/` directories.
- **Shared Types**: Common TypeScript interfaces.

## Key Features
- **Hierarchical Course Management**: File system-like organization with drag-and-drop, assessment management, and breadcrumbs.
- **Assessment Management**: Section-based marking, automatic total marks, grade boundaries, real-time updates.
- **LTI Integration**: Full LTI 1.3 compatible for assignment submissions with secure viewer token system for unauthenticated result viewing.
- **Instruction Sets Management**: Centralized, admin-controlled assessment instructions.
- **Marking Settings Management**: Centralized CRUD for skip reasons and malpractice levels in system settings, integrated into submission marking. Admin-only access to these fields during marking.
- **Role-Based Marking Tab Visibility**: Markers see only relevant tabs (Being Marked, On Hold, Approval Needed) on the marking list page, while admins/superadmins access all status tabs (All, Waiting, Being Marked, On Hold, Approval Needed, Marking Skipped, Released). Server-side status filtering with independent pagination per tab.
- **Malpractice Levels Enforcement System**: Automated submission restriction and grading based on malpractice levels (Moderate, Considerable, Severe), overriding grades to 'Fail/Refer'. Includes confirmation dialogs and intelligent enforcement record management.
- **Skip Reason Resubmission Rules**: Allows resubmission for 'marking_skipped' status, excluding them from attempt limits. Prevents resubmission when attempts are 'waiting', 'being_marked', or 'on_hold'.
- **Assignment Submission Workflow**: File uploads linked to LTI sessions, concurrent submission prevention, attempt counting.
- **Auto-Fill Marking from Previous Attempts**: Pre-populates marking forms with data from the highest-scoring previous attempt if no current marking data exists.
- **Bulk Approval & CSV Export**: Admins can bulk-release 'approval_needed' submissions and export comprehensive submission data to CSV.
- **Cloud Storage Integration**: Azure Blob Storage for file storage.
- **Timezone-Aware System**: UTC-based datetime storage with system-configurable display timezones and conversion utilities.
- **LTI Viewer Token System**: Secure, cryptographically-hashed token-based authentication for students to view all their submission details without full platform authentication. Tokens are short-lived (24 hours), automatically generated for all submissions (regardless of marking status), and use SHA-256 hashing for security.

# External Dependencies

## Database
- **Neon PostgreSQL**
- **Drizzle ORM**
- **@neondatabase/serverless**

## UI Framework & Styling
- **Radix UI**
- **Tailwind CSS**
- **Lucide React**
- **Class Variance Authority**

## Development & Build Tools
- **Vite**
- **TypeScript**
- **ESBuild**
- **PostCSS**

## Authentication & Security
- **bcrypt**
- **connect-pg-simple**
- **cookie-parser**

## State Management & API
- **TanStack React Query**
- **React Hook Form**
- **Zod**

## Cloud Storage
- **Azure Blob Storage**

## Third-Party Integrations
- **TurnItIn Core API**: For plagiarism detection.
- **Marking Buddy Integration**: External marking assistance tool, accessible via URL with submission ID.
- **API Key Authentication System**: For third-party tools to access/modify submission data, with secure API key generation and validation.
- **Third-Party API Endpoints**:
    - **GET /api/submissions/:submissionId/details-with-attempts**: Retrieve submission details.
    - **POST /api/submissions/:submissionId/marking**: Save in-progress marking data.
    - **POST /api/submissions/:submissionId/complete-marking**: Complete marking.

## Timezone Handling
- **PostgreSQL `timestamp with time zone`**: For UTC storage.
- **Timezone Utilities**: Custom utilities for conversion and formatting.