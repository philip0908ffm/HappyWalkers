import { createAuthClient } from 'better-auth/react';
import { magicLinkClient, phoneNumberClient } from 'better-auth/client/plugins';

/** Better-Auth-Client (Magic Link, SMS-Code). */
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  basePath: '/api/auth',
  plugins: [magicLinkClient(), phoneNumberClient()],
});
