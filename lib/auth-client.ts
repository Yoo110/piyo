import { createAuthClient } from 'better-auth/react';
import { getBaseURL } from '@/lib/get-base-url';
import { interAdditionalClient } from 'better-auth/client/plugins';
import { auth } from '@/lib/auth';

export const authClient = createAuthClient({
    baseURL: getBaseURL(),
    plugins: [inferAdditionalFields<typeof auth>()],
});