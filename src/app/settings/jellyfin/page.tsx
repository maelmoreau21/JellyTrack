"use client";

import { JellyfinServersSettings } from "../plugin/JellyfinServersSettings";
import { IntegrityCleanupSettings } from "../plugin/IntegrityCleanupSettings";

export default function SettingsJellyfinPage() {
  return (
    <div className="p-4 max-w-[1100px] mx-auto space-y-6">
      <JellyfinServersSettings />
      <IntegrityCleanupSettings />
    </div>
  );
}
