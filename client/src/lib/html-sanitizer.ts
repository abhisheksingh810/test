import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks while allowing safe HTML tags
 * commonly used in instructional content.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Configure DOMPurify to allow common safe HTML tags used in instructional content
  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'td', 'th'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
      'class', 'title', 'id'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp):\/\/|data:image\/)/i,
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'style']
  };

  // Add hook to automatically secure external links
  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    // Add rel attributes to external links for security
    if (node.tagName === 'A') {
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
  });

  const result = DOMPurify.sanitize(html, config);
  
  // Remove hook to avoid affecting other sanitization calls
  DOMPurify.removeAllHooks();
  
  return result;
}

/**
 * Creates a safe props object for dangerouslySetInnerHTML with sanitized content
 */
export function createSafeHtml(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}

/**
 * Strips HTML tags from a string to get plain text
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Creates a safe text preview by sanitizing HTML first, then extracting plain text and truncating
 */
export function createSafePreview(html: string, maxLength: number = 200): { __html: string } {
  if (!html) return { __html: '' };
  
  // First sanitize to ensure security
  const sanitized = sanitizeHtml(html);
  // Then strip tags to get plain text
  const plainText = stripHtmlTags(sanitized);
  // Finally truncate
  const truncated = plainText.length > maxLength 
    ? plainText.substring(0, maxLength) + '...' 
    : plainText;
  
  return { __html: truncated };
}