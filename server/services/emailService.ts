import nodemailer from 'nodemailer';
import type { SystemSetting, EmailTemplate } from "@shared/schema";

interface EmailVariables {
  [key: string]: string;
}

interface EmailOptions {
  to: string;
  templateKey: string;
  variables: EmailVariables;
}

interface HubSpotSMTPConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private getHubSpotSMTPConfig(settings: SystemSetting[]): HubSpotSMTPConfig {
    const settingsMap = new Map(settings.map(s => [s.key, s.value || '']));
    
    // Get HubSpot SMTP settings
    const region = settingsMap.get('hubspot_smtp_region') || 'global'; // 'global' or 'eu'
    const hostname = region === 'eu' ? 'smtp-eu1.hubapi.com' : 'smtp.hubapi.com';
    const port = parseInt(settingsMap.get('hubspot_smtp_port') || '587'); // 25, 587 for STARTTLS or 465 for TLS
    const username = settingsMap.get('hubspot_smtp_username') || ''; // SMTP token ID
    const password = settingsMap.get('hubspot_smtp_password') || ''; // SMTP token password
    const fromEmail = settingsMap.get('hubspot_smtp_from_email') || '';
    const fromName = settingsMap.get('hubspot_smtp_from_name') || 'Avado Assessment Platform';
    
    return {
      hostname,
      port,
      username,
      password,
      fromEmail,
      fromName
    };
  }

  async initialize(settings: SystemSetting[]) {
    const config = this.getHubSpotSMTPConfig(settings);
    
    if (!config.username || !config.password) {
      throw new Error('HubSpot SMTP credentials not configured. Please set up SMTP token ID and password.');
    }

    if (!config.fromEmail) {
      throw new Error('From email address not configured');
    }

    // Configure nodemailer for HubSpot SMTP
    this.transporter = nodemailer.createTransport({
      host: config.hostname,
      port: config.port,
      secure: config.port === 465, // Use SSL for port 465, STARTTLS for 25/587
      auth: {
        user: config.username, // SMTP token ID
        pass: config.password, // SMTP token password
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates if needed
      },
    });
  }

  private replaceVariables(content: string, variables: EmailVariables): string {
    let result = content;
    
    // Replace variables in the format {{ variable_name }}
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, value);
    }
    
    return result;
  }

  private getDefaultEmailContent(templateKey: string) {
    switch (templateKey) {
      case 'invite_user':
        return {
          subject: 'You have been invited to join the Avado Assessment Platform',
          htmlContent: `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #2563eb;">Welcome to {{ platform_name }}!</h2>
                  <p>Hello {{ user_name }},</p>
                  <p>You have been invited to join the Assessment Platform as a <strong>{{ user_role }}</strong>.</p>
                  <p>Your account has been created with the following login credentials:</p>
                  <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Username:</strong> {{ user_name }}</p>
                    <p><strong>Temporary Password:</strong> <code style="background-color: #e9ecef; padding: 2px 4px; border-radius: 3px;">{{ temp_password }}</code></p>
                  </div>
                  <p>To log in and set up your account, please click the button below:</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="{{ login_url }}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Login to Platform</a>
                  </div>
                  <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; color: #2563eb;">{{ login_url }}</p>
                  <p><strong>Important:</strong> You will be required to change your password on first login for security reasons.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                  <p style="font-size: 12px; color: #666;">
                    If you didn't expect this invitation, you can safely ignore this email.
                  </p>
                </div>
              </body>
            </html>
          `,
          textContent: `
Welcome to {{ platform_name }}!

Hello {{ user_name }},

You have been invited to join the Assessment Platform as a {{ user_role }}.

Your account has been created with the following login credentials:
Username: {{ user_name }}
Temporary Password: {{ temp_password }}

To log in and set up your account, please visit:
{{ login_url }}

Important: You will be required to change your password on first login for security reasons.

If you didn't expect this invitation, you can safely ignore this email.
          `
        };
        
      case 'forgot_password':
        return {
          subject: 'Password Reset Request',
          htmlContent: `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #2563eb;">Password Reset Request</h2>
                  <p>Hello {{ user_name }},</p>
                  <p>We received a request to reset your password for your {{ platform_name }} account.</p>
                  <p>To reset your password, please click the button below:</p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="{{ reset_url }}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
                  </div>
                  <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; color: #dc2626;">{{ reset_url }}</p>
                  <p>This password reset link will expire in 1 hour for security reasons.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                  <p style="font-size: 12px; color: #666;">
                    If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
                  </p>
                </div>
              </body>
            </html>
          `,
          textContent: `
Password Reset Request

Hello {{ user_name }},

We received a request to reset your password for your {{ platform_name }} account.

To reset your password, please visit:
{{ reset_url }}

This password reset link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
          `
        };
        
      default:
        return {
          subject: 'Notification from Avado Assessment Platform',
          htmlContent: '<p>{{ message }}</p>',
          textContent: '{{ message }}'
        };
    }
  }

  async sendEmail(
    settings: SystemSetting[],
    emailTemplate: EmailTemplate,
    options: EmailOptions
  ): Promise<void> {
    await this.initialize(settings);
    
    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    const config = this.getHubSpotSMTPConfig(settings);

    if (!emailTemplate || emailTemplate.isActive !== 'true') {
      throw new Error(`Email template '${options.templateKey}' not found or inactive`);
    }

    // Determine email content source
    let subject = emailTemplate.subject || emailTemplate.templateName;
    let htmlContent = '';
    let textContent = '';

    // Use custom HTML content if available, otherwise fall back to defaults
    if (emailTemplate.htmlContent) {
      htmlContent = emailTemplate.htmlContent;
      textContent = emailTemplate.textContent || emailTemplate.htmlContent.replace(/<[^>]*>/g, '');
    } else {
      // Use default templates based on template key
      const defaultContent = this.getDefaultEmailContent(options.templateKey);
      subject = emailTemplate.subject || defaultContent.subject;
      htmlContent = defaultContent.htmlContent;
      textContent = defaultContent.textContent;
    }

    // Replace variables in content
    const finalSubject = this.replaceVariables(subject, options.variables);
    const finalHtmlContent = this.replaceVariables(htmlContent, options.variables);
    const finalTextContent = this.replaceVariables(textContent, options.variables);

    const mailOptions = {
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      to: options.to,
      subject: finalSubject,
      text: finalTextContent.trim(),
      html: finalHtmlContent,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('📧 Email sent successfully via HubSpot SMTP:', result.messageId);
    } catch (error) {
      console.error('❌ Failed to send email via HubSpot SMTP:', error);
      throw error;
    }
  }

  async sendInvitationEmail(
    to: string,
    variables: {
      userName: string;
      userRole: string;
      tempPassword: string;
      loginUrl: string;
    },
    settings: SystemSetting[],
    storage?: any
  ): Promise<void> {
    // Try to get email template from database
    let emailTemplate: EmailTemplate | undefined;
    
    if (storage) {
      try {
        emailTemplate = await storage.getEmailTemplateByKey('invite_user');
      } catch (error) {
        console.warn('Failed to fetch email template from storage:', error);
      }
    }

    // Fallback to default template if not found in database
    if (!emailTemplate) {
      const defaultContent = this.getDefaultEmailContent('invite_user');
      emailTemplate = {
        id: 'default',
        templateKey: 'invite_user',
        templateName: defaultContent.subject,
        hubspotEmailId: null,
        subject: defaultContent.subject,
        htmlContent: defaultContent.htmlContent,
        textContent: defaultContent.textContent,
        description: null,
        isActive: 'true',
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    return this.sendEmail(settings, emailTemplate, {
      to,
      templateKey: 'invite_user',
      variables: {
        user_name: variables.userName,
        user_role: variables.userRole,
        temp_password: variables.tempPassword,
        login_url: variables.loginUrl,
        platform_name: 'Avado Assessment Platform'
      }
    });
  }

  async sendInviteUserEmail(
    settings: SystemSetting[],
    emailTemplate: EmailTemplate,
    options: {
      to: string;
      inviteUrl: string;
      inviterName: string;
      role: string;
      platformName?: string;
    }
  ): Promise<void> {
    return this.sendEmail(settings, emailTemplate, {
      to: options.to,
      templateKey: 'invite_user',
      variables: {
        invite_url: options.inviteUrl,
        inviter_name: options.inviterName,
        user_role: options.role,
        platform_name: options.platformName || 'Avado Assessment Platform'
      }
    });
  }

  async sendForgotPasswordEmail(
    settings: SystemSetting[],
    emailTemplate: EmailTemplate,
    options: {
      to: string;
      resetUrl: string;
      userName?: string;
      platformName?: string;
    }
  ): Promise<void> {
    return this.sendEmail(settings, emailTemplate, {
      to: options.to,
      templateKey: 'forgot_password',
      variables: {
        reset_url: options.resetUrl,
        user_name: options.userName || '',
        platform_name: options.platformName || 'Avado Assessment Platform'
      }
    });
  }

  async sendTransactionalEmail(
    settings: SystemSetting[],
    emailTemplate: EmailTemplate,
    options: {
      to: string;
      templateKey: string;
      customProperties?: Record<string, any>;
      contactProperties?: Record<string, any>;
    }
  ): Promise<void> {
    const variables: EmailVariables = {};
    
    if (options.customProperties) {
      Object.assign(variables, options.customProperties);
    }
    
    if (options.contactProperties) {
      Object.assign(variables, options.contactProperties);
    }
    
    return this.sendEmail(settings, emailTemplate, {
      to: options.to,
      templateKey: options.templateKey,
      variables
    });
  }

  async testConnection(settings: SystemSetting[]): Promise<boolean> {
    try {
      await this.initialize(settings);
      
      if (!this.transporter) {
        return false;
      }

      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('❌ HubSpot SMTP connection test failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();