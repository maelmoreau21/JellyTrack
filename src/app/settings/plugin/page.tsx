"use client";

import { JellyfinServersSettings } from "./JellyfinServersSettings";

export default function SettingsPluginPage() {
  return (
    <div className="p-4 max-w-[1100px] mx-auto space-y-6">
      <JellyfinServersSettings />
    </div>
  );
}
