import type { ApiRequestOptions } from './runtime/api';
export interface AccountEntry { id: string; username: string; serverName: string; current?: boolean }
export interface AccountContext {
  API: {
    getJSON(url: string): Promise<{ accounts?: AccountEntry[]; servers?: Array<{ name: string; users: number; media: number; plays: number }> }>;
    postJSON(url: string, body: Record<string, unknown>): Promise<{ code?: string; expiresIn?: number }>;
    request(url: string, options: ApiRequestOptions): Promise<Response>;
  };
  State: { user: { role?: string } | null; navigation: { multiServer?: boolean }; pageController: AbortController };
}
