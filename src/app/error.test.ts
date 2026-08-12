import { describe, it, expect } from 'vitest';

function getDisplayErrorMessage(error: { message?: string; digest?: string }): string {
  const isMinifiedReactError =
    error?.message?.includes("Minified React error #441") ||
    error?.message?.includes("Minified React error");

  return isMinifiedReactError
    ? "An error occurred on the server while rendering this page."
    : error?.message || "An unexpected error occurred while rendering the page.";
}

describe('Error Boundary Message Resolver', () => {
  it('replaces minified React error #441 with a user-friendly message', () => {
    const error = {
      message: 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
      digest: '2983719402',
    };

    expect(getDisplayErrorMessage(error)).toBe(
      'An error occurred on the server while rendering this page.'
    );
  });

  it('preserves custom exception messages when not minified React errors', () => {
    const error = { message: 'Failed to connect to database cluster' };
    expect(getDisplayErrorMessage(error)).toBe('Failed to connect to database cluster');
  });

  it('uses default fallback message when error message is empty', () => {
    const error = { message: '' };
    expect(getDisplayErrorMessage(error)).toBe('An unexpected error occurred while rendering the page.');
  });
});
