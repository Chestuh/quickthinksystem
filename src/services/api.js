const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')
const TOKEN_KEY = 'quickthink-api-token'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const token = getToken()
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(`Could not connect to QuickThink API at ${API_URL}. Start the Laravel server and check VITE_API_URL.`, 0)
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) setToken(null)
    const validationMessage = payload?.errors
      ? Object.values(payload.errors).flat().join(' ')
      : ''
    throw new ApiError(validationMessage || payload?.message || `Request failed (${response.status}).`, response.status)
  }
  return payload
}

export const api = {
  async login(email, password) {
    const result = await request('/login', { method: 'POST', auth: false, body: { email, password } })
    setToken(result.token)
    return result.user
  },

  async register(form) {
    const result = await request('/register', {
      method: 'POST',
      auth: false,
      body: {
        name: form.name,
        email: form.email,
        password: form.password,
        password_confirmation: form.password,
      },
    })
    setToken(result.token)
    return result.user
  },

  async me() {
    const result = await request('/me')
    return result.user
  },

  async logout() {
    try {
      await request('/logout', { method: 'POST' })
    } finally {
      setToken(null)
    }
  },

  exams: () => request('/exams'),
  createExam: (exam) => request('/exams', { method: 'POST', body: exam }),
  updateExam: (id, exam) => request(`/exams/${encodeURIComponent(id)}`, { method: 'PUT', body: exam }),
  deleteExam: (id) => request(`/exams/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  startExam: (id) => request(`/exams/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  saveAnswers: (id, answers) => request(`/exams/${encodeURIComponent(id)}/answers`, { method: 'PUT', body: { answers } }),
  submitExam: (id, answers) => request(`/exams/${encodeURIComponent(id)}/submit`, { method: 'POST', body: { answers } }),
  results: () => request('/results'),
  announcements: () => request('/announcements'),
  signInActivity: (afterId) => request(`/sign-in-activity${afterId === undefined ? '' : `?after=${encodeURIComponent(afterId)}`}`),
  createAnnouncement: (announcement) => request('/announcements', { method: 'POST', body: announcement }),
  deleteAnnouncement: (id) => request(`/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  users: () => request('/users'),
  createUser: (user) => request('/users', { method: 'POST', body: user }),
  updateUser: (id, user) => request(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: user }),
  deleteUser: (id) => request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
