import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
    interface Session extends DefaultSession {
        user: DefaultSession["user"] & {
            isAdmin: boolean;
            jellyfinUserId: string;
            authServerName?: string;
            authServerUrl?: string;
            authServerIsPrimary?: boolean;
        };
    }
    interface User extends DefaultUser {
        isAdmin: boolean;
        jellyfinUserId: string;
        authServerName?: string;
        authServerUrl?: string;
        authServerIsPrimary?: boolean;
        rememberMe?: boolean;
    }
}

declare module "next-auth/jwt" {
    interface JWT extends DefaultJWT {
        isAdmin?: boolean;
        jellyfinUserId?: string;
        authServerName?: string;
        authServerUrl?: string;
        authServerIsPrimary?: boolean;
        rememberMe?: boolean;
        sessionExpiresAt?: number;
        sessionExpired?: boolean;
    }
}
