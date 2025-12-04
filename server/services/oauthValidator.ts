import { createHmac } from 'crypto';
import type { Request } from 'express';

/**
 * Validates OAuth 1.0a signature for LTI requests
 * This is a simplified implementation for LTI 1.1 compatibility
 */
export function validateOAuthSignature(req: Request, consumerSecret: string): boolean {
  try {
    const {
      oauth_consumer_key,
      oauth_timestamp,
      oauth_nonce,
      oauth_version,
      oauth_signature_method,
      oauth_signature
    } = req.body;

    // Basic validation - in a production environment, you'd want more robust validation
    if (!oauth_consumer_key || !oauth_timestamp || !oauth_nonce || !oauth_signature) {
      console.log('Missing required OAuth parameters');
      return false;
    }

    // Check OAuth version
    if (oauth_version !== '1.0') {
      console.log(`Unsupported OAuth version: ${oauth_version}`);
      return false;
    }

    // Check signature method
    if (oauth_signature_method !== 'HMAC-SHA1') {
      console.log(`Unsupported signature method: ${oauth_signature_method}`);
      return false;
    }

    // Check timestamp (should be within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const timestamp = parseInt(oauth_timestamp);
    if (Math.abs(now - timestamp) > 300) { // 5 minutes
      console.log(`OAuth timestamp too old or too far in the future: ${timestamp} vs ${now}`);
      return false;
    }

    // Generate signature base string
    const httpMethod = req.method.toUpperCase();
    const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
    
    // Collect and sort parameters (excluding oauth_signature)
    const params = new URLSearchParams();
    
    // Add OAuth parameters (excluding signature)
    Object.keys(req.body).forEach(key => {
      if (key !== 'oauth_signature' && req.body[key]) {
        params.append(key, req.body[key]);
      }
    });

    // Add query parameters
    Object.keys(req.query).forEach(key => {
      if (req.query[key]) {
        params.append(key, req.query[key] as string);
      }
    });

    // Sort parameters
    params.sort();
    const paramString = params.toString();

    // Create signature base string
    const signatureBaseString = [
      httpMethod,
      encodeURIComponent(baseUrl),
      encodeURIComponent(paramString)
    ].join('&');

    // Create signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&`; // No token secret for LTI

    // Generate signature
    const expectedSignature = createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');

    // Compare signatures
    const isValid = expectedSignature === oauth_signature;
    
    if (!isValid) {
      console.log('OAuth signature validation failed');
      console.log(`Expected: ${expectedSignature}`);
      console.log(`Received: ${oauth_signature}`);
      console.log(`Base string: ${signatureBaseString}`);
      console.log(`Signing key: ${signingKey}`);
    }

    return isValid;
  } catch (error) {
    console.error('Error validating OAuth signature:', error);
    return false;
  }
}

/**
 * Simplified OAuth signature validation for development/testing
 * This should NOT be used in production
 */
export function validateOAuthSignatureSimplified(req: Request, consumerSecret: string): boolean {
  try {
    const { oauth_consumer_key, oauth_signature } = req.body;
    
    // Basic validation only - for development purposes
    if (!oauth_consumer_key || !oauth_signature) {
      console.log('Missing OAuth consumer key or signature');
      return false;
    }

    // In development, we can be more lenient
    // You might want to implement a simpler check or skip validation entirely
    // For demo purposes, we'll just check if the signature is not empty
    return oauth_signature.length > 0;
  } catch (error) {
    console.error('Error in simplified OAuth validation:', error);
    return false;
  }
}