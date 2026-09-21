export const sanitizeError = (error: unknown): string => {
  if (!error) return 'An unexpected error occurred.';

  const message = typeof error === 'string' ? error : (error as Error)?.message || '';

  if (!message) return 'An unexpected error occurred.';

  const technicalJargon = [
    'TypeError',
    'undefined',
    'is not a function',
    'JSON at position',
    'Unexpected token',
    'ENOENT',
    'path is',
    'spawn',
  ];

  const hasTechnicalJargon = technicalJargon.some((jargon) => message.toLowerCase().includes(jargon.toLowerCase()));

  if (hasTechnicalJargon) {
    return 'The file could not be processed due to an invalid format or corrupted data. Please try another file.';
  }

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Could not connect to the server. Please check your internet connection.';
  }

  if (message.includes('500') || message.includes('Internal Server Error')) {
    return 'Our server encountered an issue. Please try again later.';
  }

  return message;
};
