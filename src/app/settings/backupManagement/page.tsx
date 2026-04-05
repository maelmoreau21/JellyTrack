import { redirect } from "next/navigation";

export default function SettingsBackupManagementRedirect() {
    redirect('/settings/dataBackups');
}
