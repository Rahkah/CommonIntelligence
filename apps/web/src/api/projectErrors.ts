import { ApiRequestError } from './client';

export function projectErrorKey(error: unknown) {
  if (error instanceof ApiRequestError) {
    switch (error.status) {
      case 401: return 'signIn';
      case 403: return 'forbidden';
      case 400: return 'invalid';
      case 409: return 'conflict';
      case 429: return 'rateLimited';
    }
  }
  return 'requestError';
}
