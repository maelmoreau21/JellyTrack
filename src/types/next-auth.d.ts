import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
    interface Session extends DefaultSession {
        user: DefaultSession["user"] & {
            isAdmin: boolean;
            jellyfinUserId: string;
            authServerName?: string;
            authServerUrl?: string;
            authServerJellyfinServerId?: string;
            authServerIsPrimary?: boolean;
            authProvider?: "oidc" | "local" | "jellyfin";
            groups?: string[];
        };
    }
    interface User extends DefaultUser {
        isAdmin: boolean;
        jellyfinUserId: string;
        authServerName?: string;
        authServerUrl?: string;
        authServerJellyfinServerId?: string;
        authServerIsPrimary?: boolean;
        rememberMe?: boolean;
        authProvider?: "oidc" | "local" | "jellyfin";
        groups?: string[];
    }
}

declare module "next-auth/jwt" {
    interface JWT extends DefaultJWT {
        isAdmin?: boolean;
        jellyfinUserId?: string;
        authServerName?: string;
        authServerUrl?: string;
        authServerJellyfinServerId?: string;
        authServerIsPrimary?: boolean;
        rememberMe?: boolean;
        rememberSessionLimitedTo30Days?: boolean;
        sessionExpiresAt?: number;
        sessionIssuedAt?: number;
        sessionExpired?: boolean;
        authProvider?: "oidc" | "local" | "jellyfin";
        groups?: string[];
    }
}
