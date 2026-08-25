"use client";

import SchedulerTasksPage from "./tasks/page";
import SchedulerSchedulesPage from "./schedules/page";
import { WrappedSchedulerCard } from "./WrappedSchedulerCard";

export default function SettingsSchedulerPage() {
    return (
        <div className="p-4 md:p-8 max-w-[1100px] mx-auto space-y-6 pb-20 md:pb-12">
            <SchedulerTasksPage />
            <SchedulerSchedulesPage />
            <WrappedSchedulerCard />
        </div>
    );
}
