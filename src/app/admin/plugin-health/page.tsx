import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PluginHealthPage() {
    redirect('/admin/health');
}
