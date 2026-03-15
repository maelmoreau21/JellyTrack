import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function LoadingMediaPage() {
    return (
        <div className="flex-col md:flex">
            <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-8 pt-4 md:pt-6">
                <div className="flex items-center justify-between mb-6">
                    <Skeleton className="h-10 w-48 bg-zinc-200 dark:bg-zinc-800" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
                    <Card className="col-span-2 bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader>
                            <Skeleton className="h-6 w-1/3 bg-zinc-200 dark:bg-zinc-800" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-[250px] w-full bg-zinc-200 dark:bg-zinc-800" />
                        </CardContent>
                    </Card>

                    <Card className="col-span-1 bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                        <CardHeader>
                            <Skeleton className="h-6 w-1/2 bg-zinc-200 dark:bg-zinc-800" />
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 mt-4">
                            <Skeleton className="h-10 w-full bg-zinc-200 dark:bg-zinc-800" />
                            <Skeleton className="h-10 w-full bg-zinc-200 dark:bg-zinc-800" />
                            <Skeleton className="h-10 w-full bg-zinc-200 dark:bg-zinc-800" />
                            <Skeleton className="h-10 w-full bg-zinc-200 dark:bg-zinc-800" />
                        </CardContent>
                    </Card>
                </div>

                <Card className="bg-white/70 dark:bg-zinc-900/50 border-zinc-200/60 dark:border-zinc-800/50">
                    <CardHeader>
                        <Skeleton className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800" />
                        <Skeleton className="h-4 w-96 bg-zinc-200 dark:bg-zinc-800 mt-2" />
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                            {Array.from({ length: 18 }).map((_, i) => (
                                <div key={i} className="flex flex-col space-y-2">
                                    <Skeleton className="aspect-square w-full rounded-md bg-zinc-200 dark:bg-zinc-800" />
                                    <Skeleton className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800" />
                                    <div className="flex justify-between">
                                        <Skeleton className="h-3 w-1/3 bg-zinc-200 dark:bg-zinc-800" />
                                        <Skeleton className="h-3 w-1/4 bg-zinc-200 dark:bg-zinc-800" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
