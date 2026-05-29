import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function SettingsNetworkPage() {
    return (
        <div className="p-4 md:p-8 pt-4 md:pt-6 w-full">
            <div className="max-w-[1400px] mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Network</h2>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Network configuration</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Network settings and diagnostics (proxies, plugin endpoint, etc.).</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
