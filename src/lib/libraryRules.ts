import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { readStateFile } from "@/lib/appStateStorage";
import { sanitizeLibraryRules, type LibraryRuleMap } from "@/lib/mediaPolicy";

const LIBRARY_RULES_FILE = "JellyTrack-library-rules.json";

let legacyMigrationPromise: Promise<void> | null = null;

async function migrateLegacyLibraryRulesIfNeeded() {
    if (!legacyMigrationPromise) {
        legacyMigrationPromise = (async () => {
            const settings = await prisma.globalSettings.findUnique({
                where: { id: "global" },
                select: { libraryRules: true },
            });

            if (settings?.libraryRules) {
                return;
            }

            const legacyRules = sanitizeLibraryRules(readStateFile<LibraryRuleMap>(LIBRARY_RULES_FILE, {}));
            if (Object.keys(legacyRules).length === 0) {
                return;
            }

            await prisma.globalSettings.upsert({
                where: { id: "global" },
                update: { libraryRules: legacyRules as Prisma.InputJsonValue },
                create: {
                    id: "global",
                    libraryRules: legacyRules as Prisma.InputJsonValue,
                },
            });
        })().catch((error) => {
            legacyMigrationPromise = null;
            throw error;
        });
    }

    await legacyMigrationPromise;
}

export async function loadLibraryRules(discoveredNames?: string[]): Promise<LibraryRuleMap> {
    await migrateLegacyLibraryRulesIfNeeded();

    const settings = await prisma.globalSettings.findUnique({
        where: { id: "global" },
        select: { libraryRules: true },
    });

    return sanitizeLibraryRules((settings?.libraryRules as LibraryRuleMap | null | undefined) || {}, discoveredNames);
}

export async function saveLibraryRules(rules: LibraryRuleMap, discoveredNames?: string[]) {
    const sanitized = sanitizeLibraryRules(rules, discoveredNames);

    await prisma.globalSettings.upsert({
        where: { id: "global" },
        update: { libraryRules: sanitized as Prisma.InputJsonValue },
        create: {
            id: "global",
            libraryRules: sanitized as Prisma.InputJsonValue,
        },
    });

    return sanitized;
}
