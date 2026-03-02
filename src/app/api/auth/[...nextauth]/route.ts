import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { checkLoginRateLimit, recordFailedLogin, resetLoginRateLimit } from "@/lib/rateLimit";
import { headers, cookies } from "next/headers";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Jellyfin",
            credentials: {
                username: { label: "Nom d'utilisateur", type: "text", placeholder: "Admin" },
                password: { label: "Mot de passe Administrateur", type: "password", placeholder: "********" }
            },
            async authorize(credentials, req) {
                if (!credentials?.username || !credentials?.password) return null;

                // Read locale from cookie for error messages
                let locale = 'fr';
                try { const c = await cookies(); locale = c.get('locale')?.value || 'fr'; } catch {}
                const { apiTSync } = await import("@/lib/i18n-api");

                // SECURITY: Rate-limit login attempts by IP
                const headersList = await headers();
                const forwarded = headersList.get("x-forwarded-for");
                const clientIp = forwarded?.split(",")[0]?.trim() || headersList.get("x-real-ip") || "unknown";
                
                const { allowed, retryAfterSeconds } = await checkLoginRateLimit(clientIp);
                if (!allowed) {
                    throw new Error(apiTSync(locale, 'tooManyAttempts', { minutes: Math.ceil((retryAfterSeconds || 900) / 60) }));
                }

                const jellyfinUrl = process.env.JELLYFIN_URL;
                if (!jellyfinUrl) {
                    throw new Error(apiTSync(locale, 'jellyfinUrlMissing'));
                }

                try {
                    const res = await fetch(`${jellyfinUrl}/Users/AuthenticateByName`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `MediaBrowser Client="JellyTulli", Device="Server", DeviceId="JellyTulli-1", Version="1.0.0"`
                        },
                        body: JSON.stringify({
                            Username: credentials.username,
                            Pw: credentials.password
                        })
                    });

                    if (!res.ok) {
                        await recordFailedLogin(clientIp);
                        throw new Error(apiTSync(locale, 'badCredentials'));
                    }

                    const data = await res.json();
                    const isAdmin = !!data.User?.Policy?.IsAdministrator;

                    // Successful login — reset rate limit counter
                    await resetLoginRateLimit(clientIp);

                    return {
                        id: data.User.Id,
                        name: data.User.Name,
                        isAdmin,
                        jellyfinUserId: data.User.Id,
                    };
                } catch (error: any) {
                    // Record as failed attempt if it's not already a rate limit error
                    if (!error.message?.includes("Too many") && !error.message?.includes("Trop de tentatives")) {
                        await recordFailedLogin(clientIp);
                    }
                    throw new Error(error.message || apiTSync(locale, 'connectionError'));
                }
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            // On first sign-in, `user` is defined — persist custom fields into the JWT
            if (user) {
                token.isAdmin = (user as any).isAdmin ?? false;
                token.jellyfinUserId = (user as any).jellyfinUserId ?? user.id;
            }
            return token;
        },
        async session({ session, token }) {
            // Expose custom fields on session.user for client-side access
            if (session.user) {
                (session.user as any).isAdmin = token.isAdmin ?? false;
                (session.user as any).jellyfinUserId = token.jellyfinUserId ?? "";
            }
            return session;
        },
    },
    session: {
        strategy: "jwt",
        maxAge: 7 * 24 * 60 * 60, // 7 jours (réduit depuis 30 pour limiter l'exploitation d'un JWT compromis)
    },
    pages: {
        signIn: '/login', // Redirection vers notre page custom
    },
    secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
