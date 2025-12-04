# Avado - E-Assessment Platform

## Overview

Avado is a comprehensive e-assessment platform designed as a full-stack web application for educational institutions. It empowers educational organizations to efficiently manage users, conduct diverse assessments, and streamline various educational roles including superadmins, admins, markers, tutors, IQA (Internal Quality Assurance), and students. 

The platform features robust role-based access control with hierarchical permissions, comprehensive user management, flexible system settings, and advanced assessment capabilities designed to revolutionize assessment processes with a versatile and scalable solution for academic environments.

## Key Features

### 🏢 Hierarchical Course Management
- Modern file system-like organization with unlimited nesting levels for course structure
- Drag-and-drop functionality for course organization
- Comprehensive assessment management
- Intuitive navigation with breadcrumbs
- Supports departments → programs → modules → assessments hierarchy

### 📋 Assessment Management
- Section-based marking system with automatic total marks calculation
- Grade boundaries with flexible marking options
- Real-time updates and validation
- Support for different assessment types (formative, summative, diagnostic, competency)
- Comprehensive marking workflow with status tracking

### 🔗 LTI Integration
- Full LTI 1.3 compatible integration for assignment submissions
- Seamless integration with Learning Management Systems
- Assessment code mapping and custom parameter parsing
- Comprehensive LTI data capture for every submission
- Session management with expiry tracking

### 📚 Instruction Sets Management
- Centralized management of assessment instructions
- Data isolation with default steps
- Admin-level access control
- Support for different instruction types (info, checkbox, upload)

### ☁️ Cloud Storage Integration
- Azure Blob Storage for secure and scalable file storage
- Support for multiple file uploads per submission
- Robust error handling and fallbacks
- File type validation and size management

### 🌍 Timezone-Aware System
- Comprehensive UTC-based datetime system
- Timezone conversion utilities
- All dates stored in UTC and displayed in configured system timezone
- Support for relative time formatting

### 🔐 Advanced User Management
- Role-based access control with hierarchical permissions
- Support for multiple user roles with different privilege levels
- User status management (active, inactive, pending)
- Profile management with customizable fields

### 📧 Email Management
- Configurable email templates for various notifications
- Support for both HTML and plain text formats
- Integration with email services (currently Hubspot)
- Template versioning and management

## User Roles & Permissions

The platform supports a hierarchical role system with the following roles (in order of privilege level):

1. **Superadmin** (Level 6) - Highest privileges, full system access
2. **Admin** (Level 5) - Administrative access, user and course management
3. **Marker** (Level 3) - Assessment marking and grading capabilities
4. **Tutor** (Level 3) - Course content management and student interaction
5. **IQA** (Level 3) - Internal Quality Assurance functions
6. **Student** (Level 1) - Basic access for assignment submission and viewing

Higher roles inherit permissions from lower roles, ensuring a consistent security model.

## Technical Architecture

### Frontend Stack
- **React** with **TypeScript** - Modern UI development with type safety
- **Wouter** - Lightweight routing solution
- **TanStack React Query** - Data fetching and state management
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Consistent design system built on Radix UI
- **Lucide React** - Icon library
- **React Hook Form** - Form state management and validation
- **Framer Motion** - Animation library

### Backend Stack
- **Node.js** with **Express** - Server-side runtime and web framework
- **TypeScript** - Type-safe backend development
- **Drizzle ORM** - Type-safe database interactions
- **Passport.js** - Authentication middleware
- **Express Session** - Session management
- **Bcrypt** - Password hashing

### Database
- **PostgreSQL** (Neon serverless) - Primary database
- **Drizzle Kit** - Database migrations and schema management
- UTC timestamp storage for timezone consistency

### External Services
- **Azure Blob Storage** - File storage and management
- **SendGrid/Nodemailer** - Email services
- **TurnItIn** - Plagiarism detection integration

### Development & Build Tools
- **Vite** - Fast build tool and development server
- **ESBuild** - JavaScript bundler
- **PostCSS** - CSS processing
- **TypeScript Compiler** - Type checking

## Project Structure

```
avado/
├── client/                     # Frontend React application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # Utility functions and configurations
│   │   ├── pages/              # Page components for routing
│   │   ├── App.tsx             # Main application component
│   │   └── main.tsx            # Application entry point
│   └── index.html              # HTML template
├── server/                     # Backend Express application
│   ├── services/               # Business logic services
│   │   ├── azureBlobService.ts # Azure storage integration
│   │   ├── emailService.ts     # Email handling
│   │   ├── turnitinService.ts  # TurnItIn integration
│   │   └── ...
│   ├── db.ts                   # Database connection
│   ├── index.ts                # Server entry point
│   ├── routes.ts               # API route definitions
│   └── storage.ts              # Data access layer
├── shared/                     # Shared code between frontend and backend
│   ├── schema.ts               # Database schema definitions
│   └── timezone-utils.ts       # Timezone utility functions
├── package.json                # Dependencies and scripts
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite configuration
```

## Database Schema

### Core Tables

#### Users
- Stores user information with role-based access
- Fields: id, username, email, password, firstName, lastName, role, status, department
- Role hierarchy from student to superadmin

#### System Settings
- Key-value pairs for platform-wide configurations
- Supports dynamic system configuration without code changes

#### Course Nodes
- Hierarchical structure for organizing courses
- Supports unlimited nesting (departments → programs → modules → assessments)
- Parent-child relationships for flexible organization

#### Assessments
- Assessment definitions with sections and grade boundaries
- Links to course nodes and instruction sets
- Support for different assessment types and status tracking

#### Assignment Submissions
- Student submission data linked to LTI sessions
- Multiple file support with Azure Blob Storage integration
- Comprehensive submission tracking and metadata

#### Submission Files
- File metadata and storage information
- TurnItIn integration for plagiarism detection
- Support for various file types and size validation

#### LTI Integration Tables
- LTI session records for tracking launches
- Comprehensive LTI parameter storage
- Session expiry and validation management

### Data Relationships

The database employs a hierarchical structure with proper foreign key relationships:
- Users → Submissions (one-to-many)
- Course Nodes → Assessments (one-to-many)
- Assessments → Submissions (one-to-many)
- Submissions → Files (one-to-many)
- LTI Sessions → Submissions (one-to-one)

## Setup and Installation

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database
- Azure Storage Account (optional, for file uploads)

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database Configuration (Required)
DATABASE_URL=postgresql://username:password@host:port/database

# Azure Storage Configuration (Optional but recommended)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_SAS_TOKEN=your-sas-token

# Email Configuration (Optional)
SENDGRID_API_KEY=your-sendgrid-key
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password

# Application Configuration
NODE_ENV=development
PORT=5000
```

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd avado
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Database setup**
   ```bash
   # Generate database migrations
   npx drizzle-kit generate
   
   # Push schema to database
   npm run db:push
   ```

4. **Seed the database** (Optional but recommended)
   ```bash
   # Seed default email templates
   node server/seedEmailTemplates.ts
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`

### Production Deployment

For Azure App Service deployment, see [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions including required configuration settings.

For local production testing:

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm start
   ```

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run check` - Type checking with TypeScript
- `npm run db:push` - Push database schema changes

## API Endpoints

The application provides RESTful API endpoints for:

- **User Management** - `/api/users/*`
- **Authentication** - `/api/auth/*`
- **Course Management** - `/api/courses/*`
- **Assessment Management** - `/api/assessments/*`
- **Submission Management** - `/api/submissions/*`
- **LTI Integration** - `/api/lti/*`
- **File Management** - `/api/files/*`
- **System Settings** - `/api/settings/*`

All endpoints support proper HTTP methods (GET, POST, PUT, DELETE) with appropriate authentication and authorization.

## Security Features

- **Password Security** - Bcrypt hashing for user passwords
- **Session Management** - Secure session handling with Express Session
- **Role-Based Access Control** - Hierarchical permission system
- **Input Validation** - Zod schema validation for all inputs
- **CSRF Protection** - Built-in protection against cross-site request forgery
- **File Upload Security** - File type validation and size limits

## Testing

The application includes comprehensive testing capabilities:
- Component testing with React Testing Library
- API endpoint testing
- Database integration testing
- End-to-end testing with Playwright

Run tests with:
```bash
npm test
```

## Contributing

1. Create a feature branch from main
2. Make your changes following the established patterns
3. Ensure all tests pass
4. Update documentation as needed
5. Submit a pull request

## Architecture Decisions

### Why This Stack?

- **TypeScript** - Type safety across frontend and backend
- **Drizzle ORM** - Type-safe database operations with excellent TypeScript support
- **React Query** - Powerful data fetching and caching for better UX
- **Wouter** - Lightweight routing without the complexity of React Router
- **Tailwind CSS** - Rapid UI development with consistent design
- **Express** - Mature and well-supported Node.js framework

### Database Design Principles

- **UTC Storage** - All timestamps stored in UTC for consistency
- **Hierarchical Organization** - Flexible course structure using parent-child relationships
- **Role-Based Security** - Clear permission hierarchy with inheritance
- **Data Integrity** - Proper foreign key relationships and constraints

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify DATABASE_URL is set correctly
   - Ensure PostgreSQL server is running
   - Check network connectivity

2. **Azure Storage Errors**
   - Verify AZURE_STORAGE_CONNECTION_STRING is correct
   - Check Azure Storage account permissions
   - Ensure container exists and is accessible

3. **Build Failures**
   - Clear node_modules and reinstall dependencies
   - Check TypeScript errors with `npm run check`
   - Verify all environment variables are set

### Performance Optimization

- Database queries are optimized with proper indexes
- React Query provides intelligent caching
- Static assets are served efficiently in production
- Database connections are pooled for better performance

## Support

For technical support or questions about the platform:
1. Check the troubleshooting section above
2. Review the API documentation
3. Check existing issues in the project repository
4. Create a new issue with detailed information about your problem

---

*This documentation is maintained alongside the codebase and should be updated when significant changes are made to the platform.*