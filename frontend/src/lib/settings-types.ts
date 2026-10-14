import type { ApiRequestOptions } from './runtime/api';

export interface SettingsContext {
  api: { getJSON<T = Record<string, any>>(url: string): Promise<T>; request(url: string, options: ApiRequestOptions): Promise<Response> };
  i18n: { t(key: string, values?: Record<string, string>): string; locale?: string };
  signal?: AbortSignal;
  user: { isAdmin?: boolean } | null;
  navigate(url: string): unknown;
  tabs: string;
  page: 'jellyfin' | 'media' | 'plugin/security';
}
