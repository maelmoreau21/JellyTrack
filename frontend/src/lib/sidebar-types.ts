import type { Translate } from './migration-bridge';
export interface SidebarConfig {
  user(): { isAdmin?: boolean; jellyfinUserId?: string; authServerIsPrimary?: boolean; authServerName?: string } | null;
  context(): { multiServer?: boolean; wrappedVisible?: boolean; appVersion?: string };
  locale(): string;
  t: Translate;
  escape(value: unknown): string;
  getJSON(path: string, options?: { signal?: AbortSignal }): Promise<SidebarSearchResults>;
  postJSON(path: string, body: unknown): Promise<unknown>;
  navigate?(path: string): void;
  refreshContext(): Promise<unknown>;
  changeLocale(locale: string): Promise<unknown>;
}
export interface SidebarSearchItem { id?: string; jellyfinMediaId?: string; jellyfinUserId?: string; type?: string; title?: string; username?: string; subtitle?: string }
export interface SidebarSearchResults { media?: SidebarSearchItem[]; users?: SidebarSearchItem[] }
export interface SidebarController {
  render(): void;
  updateTheme(): void;
  updateRoute(): void;
  openMobile(): void;
  closeMobile(): void;
  openSearch(): void;
  closeSearch(clear?: boolean): void;
  search(): Promise<void>;
}
