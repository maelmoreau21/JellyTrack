export interface UserSummary {
 id: string; serverId: string; jellyfinUserId: string; username: string;
 totalHours: number; sessionsCount: number; transcodeCount: number;
 directPlayCount: number; transcodeRatio: number; favoriteClient: string; lastActive: string | null;
}
export interface UsersContext {
 API: {
  getJSON(url: string): Promise<{ items?: Partial<UserSummary>[]; users?: Partial<UserSummary>[]; total?: number }>;
  postJSON(url: string, body: Record<string, unknown>): Promise<{ result?: { totalPruned?: number; prunedUsers?: string[] }; totalPruned?: number; prunedUsers?: string[] }>;
  delete(url: string): Promise<unknown>;
 };
 State: { user: { isAdmin?: boolean } | null; locale: string; pageController: AbortController };
 I18n: { t(key: string): string };
 Router: { navigate(url: string): unknown };
}
