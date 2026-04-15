import { NextRequest, NextResponse } from "next/server";
import * as pluginEventsRoute from "@/app/api/plugin/events/route";

const parsedMaxPluginEventBytes = Number(process.env.PLUGIN_EVENT_MAX_BYTES);
const MAX_PLUGIN_EVENT_BYTES = Number.isFinite(parsedMaxPluginEventBytes)
	? parsedMaxPluginEventBytes
	: 1024 * 1024;

function parseAllowedHosts(rawValue: string | undefined): Set<string> {
	return new Set(
		String(rawValue || "")
			.split(",")
			.map((entry) => entry.trim().toLowerCase())
			.filter((entry) => entry.length > 0)
	);
}

const ALLOWED_JELLYFIN_HOSTS = parseAllowedHosts(process.env.ALLOWED_JELLYFIN_HOSTS);

function extractHostFromUrl(rawUrl: unknown): string | null {
	const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
	if (!value) return null;

	try {
		return new URL(value).hostname.toLowerCase();
	} catch {
		return null;
	}
}

function resolvePayloadServerUrl(payload: Record<string, unknown>): string | null {
	const serverNode = (payload.server && typeof payload.server === "object" ? payload.server : null) as Record<string, unknown> | null;
	const serverNodeAlt = (payload.Server && typeof payload.Server === "object" ? payload.Server : null) as Record<string, unknown> | null;

	const candidate =
		payload.serverUrl ??
		payload.ServerUrl ??
		payload.url ??
		payload.Url ??
		serverNode?.serverUrl ??
		serverNode?.ServerUrl ??
		serverNode?.url ??
		serverNode?.Url ??
		serverNodeAlt?.serverUrl ??
		serverNodeAlt?.ServerUrl ??
		serverNodeAlt?.url ??
		serverNodeAlt?.Url;

	return typeof candidate === "string" ? candidate : null;
}

async function readRequestBodyWithLimit(req: NextRequest, maxBytes: number): Promise<string> {
	const reader = req.body?.getReader();
	if (!reader) return "";

	const decoder = new TextDecoder();
	let totalBytes = 0;
	let raw = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				try {
					await reader.cancel();
				} catch {
					// Ignore cancellation errors while enforcing cap.
				}
				throw new Error("payload_too_large");
			}

			raw += decoder.decode(value, { stream: true });
		}

		raw += decoder.decode();
		return raw;
	} finally {
		reader.releaseLock();
	}
}

export const GET = pluginEventsRoute.GET;
export const OPTIONS = pluginEventsRoute.OPTIONS;

export async function POST(req: NextRequest) {
	if (ALLOWED_JELLYFIN_HOSTS.size === 0) {
		return NextResponse.json(
			{ error: "Webhook disabled: ALLOWED_JELLYFIN_HOSTS is empty." },
			{ status: 503 }
		);
	}

	const contentType = (req.headers.get("content-type") || "").toLowerCase();
	if (!contentType.includes("application/json")) {
		return NextResponse.json(
			{ error: "Unsupported content type. Expected application/json." },
			{ status: 415 }
		);
	}

	let rawPayload = "";
	try {
		rawPayload = await readRequestBodyWithLimit(req, MAX_PLUGIN_EVENT_BYTES);
	} catch (error) {
		if (error instanceof Error && error.message === "payload_too_large") {
			return NextResponse.json({ error: "Payload too large." }, { status: 413 });
		}
		return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
	}

	let payload: Record<string, unknown>;
	try {
		const parsed = JSON.parse(rawPayload);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
		}
		payload = parsed as Record<string, unknown>;
	} catch {
		return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
	}

	const payloadServerUrl = resolvePayloadServerUrl(payload);
	const payloadServerHost = extractHostFromUrl(payloadServerUrl);

	if (!payloadServerHost) {
		return NextResponse.json(
			{ error: "Forbidden webhook source: missing or invalid payload server URL." },
			{ status: 403 }
		);
	}

	if (!ALLOWED_JELLYFIN_HOSTS.has(payloadServerHost)) {
		return NextResponse.json(
			{ error: "Forbidden webhook source host." },
			{ status: 403 }
		);
	}

	const forwardedHeaders = new Headers(req.headers);
	const forwardedRequest = new Request(req.url, {
		method: "POST",
		headers: forwardedHeaders,
		body: rawPayload,
	});

	return pluginEventsRoute.POST(forwardedRequest);
}
