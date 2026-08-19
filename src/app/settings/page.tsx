import { redirect } from "next/navigation";

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
    const resolvedSearchParams = (await searchParams) || {};
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(resolvedSearchParams)) {
        if (Array.isArray(value)) {
            if (value[0]) params.set(key, value[0]);
            continue;
        }
        if (typeof value === 'string' && value.length > 0) {
            params.set(key, value);
        }
    }

    const query = params.toString();
    redirect(query ? `/settings/jellyfin?${query}` : '/settings/jellyfin');
}
