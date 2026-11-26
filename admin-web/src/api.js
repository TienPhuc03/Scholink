// Client gọi Scholink API Gateway (proxy qua Vite -> :3000). Tự refresh access token khi 401.
const KEY = 'scholink.portal.session';

export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  },
  set(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: giữ phiên trong bộ nhớ không cần */ }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};

let onExpired = () => {};
export const setOnExpired = (fn) => { onExpired = fn; };

async function raw(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { res, data };
}

function errorMessage(data, res) {
  const e = data?.error ?? data;
  const details = Array.isArray(e?.details) ? e.details.map((d) => d.message || d).join(', ') : '';
  const msg = typeof e === 'string' ? e : Array.isArray(e?.message) ? e.message.join(', ') : e?.message;
  return [msg || `Lỗi máy chủ (${res.status})`, details].filter(Boolean).join(': ');
}

let refreshing = null;

// Backend xoay vòng refresh token và thu hồi cả family nếu token cũ bị dùng lại,
// nên chỉ được refresh đúng 1 lần cho mỗi refresh token.
async function refreshOnce(refreshToken) {
  const r = await raw('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken } });
  if (!r.res.ok || !r.data?.accessToken) return null;
  session.set({ ...session.get(), accessToken: r.data.accessToken, refreshToken: r.data.refreshToken ?? refreshToken });
  return r.data.accessToken;
}

export async function api(path, opts = {}) {
  const s = session.get();
  let { res, data } = await raw(path, { ...opts, token: s?.accessToken });

  if (res.status === 401 && s?.refreshToken) {
    const cur = session.get();
    let token;
    if (cur?.accessToken && cur.accessToken !== s.accessToken) {
      token = cur.accessToken; // request khác đã refresh xong trong lúc chờ: dùng luôn token mới
    } else {
      refreshing ??= refreshOnce(s.refreshToken).finally(() => { refreshing = null; });
      token = await refreshing;
    }
    if (!token) {
      session.clear();
      onExpired();
      throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }
    ({ res, data } = await raw(path, { ...opts, token }));
  }

  if (!res.ok) {
    const err = new Error(errorMessage(data, res));
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function login(email, password) {
  const { res, data } = await raw('/api/v1/auth/login', { method: 'POST', body: { email, password } });
  if (!res.ok) throw new Error(errorMessage(data, res));
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const patch = (p, body = {}) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });
