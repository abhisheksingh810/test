import "dotenv/config";
import { storage } from './storage';

const defaultEmailTemplates = [
  {
    templateKey: 'invite_user',
    hubspotEmailId: '',
    templateName: 'User Invitation Email',
    description: 'Email sent when inviting new users to the platform. Available variables: {{ user_name }}, {{ user_role }}, {{ temp_password }}, {{ login_url }}, {{ platform_name }}',
    subject: 'You have been invited to join {{ platform_name }}',
    htmlContent: `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #2563eb; margin: 0;">Welcome to {{ platform_name }}!</h2>
          </div>
          
          <p>Hello {{ user_name }},</p>
          
          <p>You have been invited to join the Assessment Platform as a <strong>{{ user_role }}</strong>.</p>
          
          <p>Your account has been created with the following login credentials:</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Username:</strong> {{ user_name }}</p>
            <p><strong>Temporary Password:</strong> <code style="background-color: #e9ecef; padding: 2px 4px; border-radius: 3px; font-family: monospace;">{{ temp_password }}</code></p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{ login_url }}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Login to Platform</a>
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #2563eb;">{{ login_url }}</p>
          
          <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Important:</strong> You will be required to change your password on first login for security reasons.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </body>
      </html>
    `,
    textContent: `Welcome to {{ platform_name }}!

Hello {{ user_name }},

You have been invited to join the Assessment Platform as a {{ user_role }}.

Your account has been created with the following login credentials:
Username: {{ user_name }}
Temporary Password: {{ temp_password }}

To log in and set up your account, please visit:
{{ login_url }}

Important: You will be required to change your password on first login for security reasons.

If you didn't expect this invitation, you can safely ignore this email.`,
    isActive: 'true'
  },
  {
    templateKey: 'forgot_password',
    hubspotEmailId: '',
    templateName: 'Forgot Password Email',
    description: 'Email sent when users request a password reset. Available variables: {{ reset_url }}, {{ user_name }}, {{ platform_name }}',
    subject: 'Password Reset Request - {{ platform_name }}',
    htmlContent: `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #dc3545; margin: 0;">Password Reset Request</h2>
          </div>
          
          <p>Hello {{ user_name }},</p>
          
          <p>We received a request to reset your password for your {{ platform_name }} account.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="{{ reset_url }}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
          </div>
          
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #dc3545;">{{ reset_url }}</p>
          
          <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Security Notice:</strong> This link will expire in 1 hour for your security.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
          </p>
        </body>
      </html>
    `,
    textContent: `Password Reset Request - {{ platform_name }}

Hello {{ user_name }},

We received a request to reset your password for your {{ platform_name }} account.

To reset your password, please visit:
{{ reset_url }}

Security Notice: This link will expire in 1 hour for your security.

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.`,
    isActive: 'true'
  }
];

export async function seedEmailTemplates() {
  console.log('🌱 Seeding default email templates...');
  
  for (const template of defaultEmailTemplates) {
    try {
      // Check if template already exists
      const existing = await storage.getEmailTemplateByKey(template.templateKey);
      if (!existing) {
        await storage.createEmailTemplate(template);
        console.log(`✅ Created email template: ${template.templateName}`);
      } else {
        console.log(`⏭️  Email template already exists: ${template.templateName}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create email template ${template.templateName}:`, error);
    }
  }
  
  console.log('🌱 Email templates seeding completed');
}

// Run seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedEmailTemplates()
    .then(() => {
      console.log('Email templates seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Email templates seeding failed:', error);
      process.exit(1);
    });
}