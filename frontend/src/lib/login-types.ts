export interface LoginContext {
  API: { getJSON(path: string): Promise<LoginOptions> };
  Auth: { login(username: string, password: string, remember: boolean, serverId: string): Promise<unknown> };
  I18n: { t(key: string): string; changeLocale(locale: string): Promise<unknown> };
  Theme: { isDark(): boolean; toggle(): void };
  State: { locale: string };
  Toast: { success(message: string): void };
  Router: { navigate(target: string, replace: boolean, force: boolean): void };
  StreamsPoller: { stop(): void };
  icon(name: string): string;
}
export interface LoginOptions {
  servers?: Array<{ id: string; name: string }>;
  ssoButtonLabel?: string;
  oidc?: boolean;
  autoRedirect?: boolean;
  localAdmin?: boolean;
  jellyfin?: boolean;
}
