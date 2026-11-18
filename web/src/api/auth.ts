import { createAuthClient } from 'better-auth/react';
import { adminClient, magicLinkClient, phoneNumberClient } from 'better-auth/client/plugins';

/** Better-Auth-Client (Magic Link, SMS-Code, Passwort; Personenverwaltung für Admins). */
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  basePath: '/api/auth',
  plugins: [magicLinkClient(), phoneNumberClient(), adminClient()],
});
