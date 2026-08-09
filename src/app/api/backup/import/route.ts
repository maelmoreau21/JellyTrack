import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { requireAdminMutation } from "@/lib/adminRequestGuard";
import { revalidateDashboardCache } from "@/lib/revalidate";
import { restoreBackupBuffer } from "@/lib/backupUtils";

export const dynamic = "force-dynamic";

const parsedMaxBackupImportBytes = Number(process.env.BACKUP_IMPORT_MAX_BYTES);
const MAX_BACKUP_IMPORT_BYTES =
    Number.isFinite(parsedMaxBackupImportBytes) && parsedMaxBackupImportBytes > 0
        ? Math.floor(parsedMaxBackupImportBytes)
        : 100 * 1024 * 1024; // 100MB max payload limit

class BackupPayloadTooLargeError extends Error {
    constructor() {
        super("backup_payload_too_large");
        this.name = "BackupPayloadTooLargeError";
    }
}

async function readRequestBodyAsBuffer(req: NextRequest): Promise<Buffer> {
    const contentLength = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BACKUP_IMPORT_BYTES) {
        throw new BackupPayloadTooLargeError();
    }

    const contentType = req.headers.get("content-type") || "";

    // Strategy 1: Multipart Form Data
    if (contentType.includes("multipart/form-data")) {
        try {
            const formData = await req.formData();
            const file = formData.get("file") as File | null;
            if (file) {
                if (file.size > MAX_BACKUP_IMPORT_BYTES) {
                    throw new BackupPayloadTooLargeError();
                }
                const arrayBuf = await file.arrayBuffer();
                return Buffer.from(arrayBuf);
            }
        } catch (err) {
            if (err instanceof BackupPayloadTooLargeError) throw err;
        }
    }

    // Strategy 2: Stream request body
    if (req.body) {
        try {
            const reader = req.body.getReader();
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.byteLength > 0) {
                    totalBytes += value.byteLength;
                    if (totalBytes > MAX_BACKUP_IMPORT_BYTES) {
                        throw new BackupPayloadTooLargeError();
                    }
                    chunks.push(value);
                }
            }

            if (chunks.length > 0) {
                return Buffer.concat(chunks);
            }
        } catch (err: unknown) {
            if (err instanceof BackupPayloadTooLargeError) throw err;
        }
    }

    // Strategy 3: Direct ArrayBuffer
    try {
        const arrayBuf = await req.arrayBuffer();
        if (arrayBuf && arrayBuf.byteLength > 0) {
            if (arrayBuf.byteLength > MAX_BACKUP_IMPORT_BYTES) {
                throw new BackupPayloadTooLargeError();
            }
            return Buffer.from(arrayBuf);
        }
    } catch {}

    throw new Error("Empty backup payload");
}

export async function POST(req: NextRequest) {
    const auth = await requireAdminMutation(req);
    if (isAuthError(auth)) return auth;

    try {
        const buffer = await readRequestBodyAsBuffer(req);
        const result = await restoreBackupBuffer(buffer);

        revalidateDashboardCache();

        return NextResponse.json({ success: true, mode: result.mode }, { status: 200 });

    } catch (e: unknown) {
        if (e instanceof BackupPayloadTooLargeError) {
            return NextResponse.json({ error: "Fichier de sauvegarde trop volumineux (max 100 Mo)." }, { status: 413 });
        }
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[BackupImport] Restoration failed:", e);
        return NextResponse.json({ error: msg || "Échec de la restauration de la sauvegarde" }, { status: 500 });
    }
}
