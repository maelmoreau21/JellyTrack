import { cookies } from "next/headers";

/**
 * Lightweight i18n helper for API Route Handlers.
 * Reads the `locale` cookie and returns the matching message.
 * Falls back to 'fr' if no cookie is set.
 */

const messages: Record<string, Record<string, string>> = {
  fr: {
    adminOnly: "Accès réservé aux administrateurs.",
    unauthenticated: "Non authentifié.",
    internalError: "Erreur Serveur Interne",
    // Sync
    syncSuccess: "Synchronisation {mode} terminée. {users} utilisateurs et {media} médias à jour.",
    syncRecent: "récente",
    syncFull: "complète",
    serverNotConfigured: "Serveur non configuré (JELLYFIN_URL/JELLYFIN_API_KEY env vars manquants).",
    // Settings validation
    discordUrlDomain: "L'URL du webhook Discord doit pointer vers discord.com",
    discordUrlHttps: "L'URL du webhook doit utiliser HTTPS",
    discordUrlInvalid: "URL du webhook invalide.",
    alertConditionInvalid: "Condition d'alerte invalide.",
    intervalActiveRange: "monitorIntervalActive doit être entre 500ms et 60000ms.",
    intervalIdleRange: "monitorIntervalIdle doit être entre 1000ms et 300000ms.",
    syncCronHourRange: "syncCronHour doit être entre 0 et 23.",
    syncCronMinuteRange: "syncCronMinute doit être entre 0 et 59.",
    backupCronHourRange: "backupCronHour doit être entre 0 et 23.",
    backupCronMinuteRange: "backupCronMinute doit être entre 0 et 59.",
    localeInvalid: "Langue invalide. Valeurs acceptées: fr, en",
    // Kill stream
    jellyfinNotConfigured: "JELLYFIN_URL ou JELLYFIN_API_KEY non configurées.",
    killStreamFailed: "Echec de l'arrêt du flux côté serveur Jellyfin.",
    killStreamSuccess: "Flux arrêté avec succès.",
    // Backup
    backupCreated: "Sauvegarde manuelle créée : {fileName}",
    backupError: "Erreur lors de la sauvegarde.",
    fileNameMissing: "Nom de fichier manquant.",
    fileNameInvalid: "Nom de fichier invalide.",
    fileInvalid: "Fichier invalide.",
    fileAutoOnly: "Fichier invalide — seuls les fichiers de sauvegarde automatiques sont autorisés.",
    fileNotFound: "Fichier de sauvegarde introuvable.",
    backupFormatInvalid: "Format de sauvegarde invalide.",
    backupDeleted: "Sauvegarde {fileName} supprimée.",
    deleteError: "Erreur lors de la suppression.",
    restoreSuccess: "Restauration depuis {fileName} terminée avec succès.",
    restoreError: "Erreur lors de la restauration.",
    // Webhook
    payloadUnrecognized: "Payload non reconnu.",
    incompleteData: "Données incomplètes (UserId ou ItemId manquant)",
    eventProcessed: "Événement {eventType} traité.",
    serverError500: "Erreur serveur HTTP 500",
    // Auth
    tooManyAttempts: "Trop de tentatives de connexion. Réessayez dans {minutes} minutes.",
    jellyfinUrlMissing: "JELLYFIN_URL non configurée dans les variables d'environnement.",
    badCredentials: "Identifiants Jellyfin incorrects.",
    connectionError: "Erreur de connexion à Jellyfin.",
  },
  en: {
    adminOnly: "Admin access only.",
    unauthenticated: "Not authenticated.",
    internalError: "Internal Server Error",
    // Sync
    syncSuccess: "{mode} sync completed. {users} users and {media} media updated.",
    syncRecent: "Recent",
    syncFull: "Full",
    serverNotConfigured: "Server not configured (JELLYFIN_URL/JELLYFIN_API_KEY env vars missing).",
    // Settings validation
    discordUrlDomain: "Discord webhook URL must point to discord.com",
    discordUrlHttps: "Webhook URL must use HTTPS",
    discordUrlInvalid: "Invalid webhook URL.",
    alertConditionInvalid: "Invalid alert condition.",
    intervalActiveRange: "monitorIntervalActive must be between 500ms and 60000ms.",
    intervalIdleRange: "monitorIntervalIdle must be between 1000ms and 300000ms.",
    syncCronHourRange: "syncCronHour must be between 0 and 23.",
    syncCronMinuteRange: "syncCronMinute must be between 0 and 59.",
    backupCronHourRange: "backupCronHour must be between 0 and 23.",
    backupCronMinuteRange: "backupCronMinute must be between 0 and 59.",
    localeInvalid: "Invalid language. Accepted values: fr, en",
    // Kill stream
    jellyfinNotConfigured: "JELLYFIN_URL or JELLYFIN_API_KEY not configured.",
    killStreamFailed: "Failed to stop stream on Jellyfin server.",
    killStreamSuccess: "Stream stopped successfully.",
    // Backup
    backupCreated: "Manual backup created: {fileName}",
    backupError: "Backup error.",
    fileNameMissing: "File name missing.",
    fileNameInvalid: "Invalid file name.",
    fileInvalid: "Invalid file.",
    fileAutoOnly: "Invalid file — only automatic backup files are allowed.",
    fileNotFound: "Backup file not found.",
    backupFormatInvalid: "Invalid backup format.",
    backupDeleted: "Backup {fileName} deleted.",
    deleteError: "Deletion error.",
    restoreSuccess: "Restore from {fileName} completed successfully.",
    restoreError: "Restore error.",
    // Webhook
    payloadUnrecognized: "Unrecognized payload.",
    incompleteData: "Incomplete data (UserId or ItemId missing)",
    eventProcessed: "Event {eventType} processed.",
    serverError500: "HTTP 500 Server Error",
    // Auth
    tooManyAttempts: "Too many login attempts. Try again in {minutes} minutes.",
    jellyfinUrlMissing: "JELLYFIN_URL not configured in environment variables.",
    badCredentials: "Invalid Jellyfin credentials.",
    connectionError: "Jellyfin connection error.",
  },
};

/**
 * Get the current locale from the request cookie.
 * Must be called inside a Route Handler or Server Component.
 */
export async function getApiLocale(): Promise<string> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("locale")?.value || "fr";
  } catch {
    return "fr";
  }
}

/**
 * Get a localized API message. Supports simple {placeholder} interpolation.
 */
export async function apiT(key: string, params?: Record<string, string | number>): Promise<string> {
  const locale = await getApiLocale();
  let msg = messages[locale]?.[key] || messages["fr"][key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, String(v));
    }
  }
  return msg;
}

/**
 * Synchronous version — pass locale explicitly (for middleware / authorize where cookies() is unavailable).
 */
export function apiTSync(locale: string, key: string, params?: Record<string, string | number>): string {
  let msg = messages[locale]?.[key] || messages["fr"][key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, String(v));
    }
  }
  return msg;
}
