import { createAuthClient } from 'better-auth/react';
import { getBaseURL } from '@/lib/get-base-url';
// no extra plugins needed

export const authClient = createAuthClient({
    baseURL: getBaseURL(),
});