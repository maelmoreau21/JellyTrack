export async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("unauthorized");
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erreur (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function mutateJSON<T = any>(
  path: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  body?: any,
  csrfToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: window.location.origin,
  };
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  let reqBody: any = undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    reqBody = JSON.stringify(body);
  }

  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body: reqBody,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erreur (${response.status})`);
  }
  return data as T;
}
