export interface ApiState {
  locale: string;
  user: { csrfToken?: string } | null;
  pageController?: AbortController | null;
}
export type ApiRequestOptions = Omit<RequestInit, 'body'> & { body?: BodyInit | Record<string, unknown> | unknown[] | null };
export function createAPI(state: ApiState, updateUserUI: () => unknown, navigate: (path: string) => unknown) {
  return {
    async request(url: string, options: ApiRequestOptions = {}): Promise<Response> {
      const method = (options.method || 'GET').toUpperCase();
      const headers = new Headers(options.headers);
      let body = options.body;
      if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && !(body instanceof URLSearchParams) && !(body instanceof ReadableStream)) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(body);
      }
      if (state.user?.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers.set('X-CSRF-Token', state.user.csrfToken);
      const opts: RequestInit = { ...options, headers, body: body as BodyInit | null | undefined };
      if (!opts.signal && method === 'GET' && state.pageController) opts.signal = state.pageController.signal;
      let response: Response;
      if (method === 'GET') {
        const sourceSignal = opts.signal;
        const controller = new AbortController();
        let timedOut = false;
        const abort = () => controller.abort(sourceSignal?.reason);
        if (sourceSignal?.aborted) abort();
        else sourceSignal?.addEventListener('abort', abort, { once: true });
        opts.signal = controller.signal;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
        try { response = await fetch(url, opts); }
        catch (error) {
          if (timedOut && !sourceSignal?.aborted) throw new Error(state.locale === 'fr' ? 'Le serveur ne répond pas. Réessayez dans quelques instants.' : 'The server did not respond. Please try again shortly.');
          throw error;
        } finally { clearTimeout(timer); sourceSignal?.removeEventListener('abort', abort); }
      } else response = await fetch(url, opts);
      if (response.status === 401 && !url.includes('/api/auth/me') && !url.includes('/api/auth/login')) {
        state.user = null;
        updateUserUI();
        navigate('/login');
        throw new Error('Session expirée');
      }
      return response;
    },
    async readJSON<T = unknown>(response: Response): Promise<T> {
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || `Erreur HTTP ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    async getJSON<T = unknown>(url: string, options: { signal?: AbortSignal } = {}): Promise<T> { return this.readJSON<T>(await this.request(url, options)); },
    async postJSON<T = unknown>(url: string, body: ApiRequestOptions['body']): Promise<T> { return this.readJSON<T>(await this.request(url, { method: 'POST', body })); },
    async patchJSON<T = unknown>(url: string, body: ApiRequestOptions['body']): Promise<T> { return this.readJSON<T>(await this.request(url, { method: 'PATCH', body })); },
    async delete<T = unknown>(url: string): Promise<T> { return this.readJSON<T>(await this.request(url, { method: 'DELETE' })); }
  };
}
