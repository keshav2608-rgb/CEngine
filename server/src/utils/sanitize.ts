import sanitizeHtml from 'sanitize-html';

/**
 * Strips dangerous HTML tags and scripts to prevent XSS.
 * Allows safe text and basic formatting if necessary.
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  return sanitizeHtml(input, {
    allowedTags: [], // Strip all HTML tags in chat messages to prevent XSS
    allowedAttributes: {},
  }).trim();
}
