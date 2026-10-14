import type { ApiRequestOptions } from './runtime/api';

export interface BackupEntry {
  name: string;
  date: string;
  type?: string;
  sizeMb?: number;
  size?: number;
}
export interface BackupContext {
  api: {
    getJSON(url: string): Promise<{ backups?: BackupEntry[] }>;
    request(url: string, options: ApiRequestOptions): Promise<Response>;
  };
  i18n: { t(key: string): string; locale?: string };
  signal?: AbortSignal;
  user: { isAdmin?: boolean } | null;
  navigate(url: string): unknown;
  tabs: string;
  icon(name: string): string;
}
