export function getDeviceId() {
  let id = localStorage.getItem("social-device");
  if (!id) {
    id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "d" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("social-device", id);
  }
  return id;
}

async function request(path, options = {}) {
  const headers = { "X-Device-Id": getDeviceId(), ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && data?.error === "Pick a name first") {
      window.dispatchEvent(new CustomEvent("need-name"));
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: (path, body) =>
    request(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  del: (path) => request(path, { method: "DELETE" }),
};
