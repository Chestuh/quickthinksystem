import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, getToken, setToken } from './services/api.js'
import { extractDocumentText, parseQuestions } from './services/questionImport.js'
import './App.css'

function getLocalDateString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyExam() {
  return {
    id: '',
    title: '',
    subject: '',
    durationMinutes: 45,
    date: getLocalDateString(),
    status: 'Draft',
    questions: [
      { id: `q-${Date.now()}`, text: 'Question text', options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 'Option A' },
    ],
  }
}

async function sendExamAttempt({
  automatic,
  examId,
  answers,
  timeLeft,
  saveAnswers,
  submitAnswers,
  submitLock,
  setIsSubmitting,
  setMessage,
  setSubmitted,
}) {
  if (submitLock.current) return
  submitLock.current = true
  setIsSubmitting(true)
  setMessage('')

  try {
    if (!automatic && timeLeft > 0) await saveAnswers(examId, answers)
    const result = await submitAnswers(examId, answers)
    setSubmitted(true)
    setMessage(`Submitted successfully! Final score: ${result.percentage}%`)
  } catch (error) {
    setMessage(error.message)
    submitLock.current = false
    setIsSubmitting(false)
  }
}

async function loadServerData(setData, includeUsers = false) {
  const [exams, results, announcements, users, signInActivity] = await Promise.all([
    api.exams(),
    api.results(),
    api.announcements(),
    includeUsers ? api.users() : Promise.resolve([]),
    includeUsers ? api.signInActivity() : Promise.resolve([]),
  ])
  setData({ exams, results, announcements, users, signInActivity })
}

function startExamRequest(examId) {
  return api.startExam(examId)
}

function saveAnswersRequest(examId, answers) {
  return api.saveAnswers(examId, answers)
}

const roleDetails = {
  admin: {
    label: 'Administrator',
    summary: 'Manage users, policies, exams, and reporting with secure oversight.',
    accent: '#7c3aed',
  },
  teacher: {
    label: 'Teacher',
    summary: 'Build question banks, schedule exams, and release performance insights.',
    accent: '#0ea5e9',
  },
  student: {
    label: 'Student',
    summary: 'Take assessments, track progress, and view results in one streamlined hub.',
    accent: '#10b981',
  },
}

const moduleCards = [
  { icon: '🔐', title: 'Authentication & User Management', text: 'Hashed-password sign-in, role-based access, and account management for administrators, teachers, and students.' },
  { icon: '🧠', title: 'Question Bank', text: 'Create and organize multiple-choice and short-answer content by subject, topic, and difficulty.' },
  { icon: '📝', title: 'Examination Management', text: 'Set exam duration, schedule assessments, and control publishing rules for all assigned learners.' },
  { icon: '🎯', title: 'Online Examination', text: 'Deliver timed assessments, allow navigation between questions, and ensure secure submissions.' },
  { icon: '📊', title: 'Automatic Grading & Results', text: 'Score objective questions automatically and release performance insights to each student.' },
  { icon: '📈', title: 'Reports & Monitoring', text: 'Track exam participation, pending result reviews, and performance trends in real time.' },
]

function App() {
  const [data, setData] = useState({ exams: [], results: [], announcements: [], users: [], signInActivity: [] })
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [loadError, setLoadError] = useState('')
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [welcomeNotice, setWelcomeNotice] = useState('')
  const dataRequestId = useRef(0)

  const refreshData = useCallback(async (includeUsers = false) => {
    const requestId = ++dataRequestId.current
    setDataLoading(true)
    setDataError('')

    try {
      await loadServerData((nextData) => {
        if (requestId === dataRequestId.current) setData(nextData)
      }, includeUsers)
    } catch (error) {
      if (requestId === dataRequestId.current) {
        setDataError(error.message)
      }
      throw error
    } finally {
      if (requestId === dataRequestId.current) {
        setDataLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!getToken()) return

    let active = true
    const restoreSession = async () => {
      try {
        const user = await api.me()
        if (!active) return
        setSession(user)
        void refreshData(user.role === 'admin').catch(() => {})
      } catch (error) {
        setToken(null)
        if (active && !(error instanceof ApiError && error.status === 401)) {
          setLoadError(error.message)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    restoreSession()
    return () => { active = false }
  }, [refreshData])

  const login = async (email, password) => {
    const user = await api.login(email, password)
    setSession(user)
    setWelcomeNotice(`Welcome back, ${user.name}. You’re signed in.`)
    void refreshData(user.role === 'admin').catch(() => {})
    return user
  }

  const register = async (form) => {
    const user = await api.register(form)
    setSession(user)
    setWelcomeNotice(`Welcome, ${user.name}. Your account is ready.`)
    void refreshData(false).catch(() => {})
    return user
  }

  const updateSignInActivity = useCallback((newSignIns) => {
    setData((current) => ({
      ...current,
      signInActivity: [...newSignIns, ...current.signInActivity]
        .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index)
        .sort((left, right) => Number(right.id) - Number(left.id))
        .slice(0, 10),
    }))
  }, [])
  const dismissWelcome = useCallback(() => setWelcomeNotice(''), [])

  const logout = async () => {
    dataRequestId.current += 1
    setDataLoading(false)
    setDataError('')
    setWelcomeNotice('')
    try {
      await api.logout()
    } finally {
      setSession(null)
      setData({ exams: [], results: [], announcements: [], users: [], signInActivity: [] })
    }
  }

  const saveExam = async (examPayload) => {
    if (examPayload.id) await api.updateExam(examPayload.id, examPayload)
    else await api.createExam(examPayload)
    await refreshData(session?.role === 'admin')
  }

  const deleteExam = async (examId) => {
    await api.deleteExam(examId)
    await refreshData(session?.role === 'admin')
  }

  const submitExam = async (examId, answers) => {
    const result = await api.submitExam(examId, answers)
    await refreshData(session?.role === 'admin')
    return result
  }

  const saveAnnouncement = async (announcement) => {
    await api.createAnnouncement(announcement)
    await refreshData()
  }

  const deleteAnnouncement = async (announcementId) => {
    await api.deleteAnnouncement(announcementId)
    await refreshData()
  }

  const startExam = startExamRequest
  const saveAnswers = saveAnswersRequest

  const manageUsers = {
    create: async (user) => {
      await api.createUser(user)
      await refreshData(true)
    },
    update: async (id, user) => {
      await api.updateUser(id, user)
      await refreshData(true)
    },
    delete: async (id) => {
      await api.deleteUser(id)
      await refreshData(true)
    },
  }

  return (
    <BrowserRouter>
      {loading ? (
        <div className="app-shell"><div className="message-box">Connecting to QuickThink…</div></div>
      ) : loadError ? (
        <div className="app-shell"><div className="message-box error">{loadError}</div></div>
      ) : (
        <AppShell
          user={session}
          data={data}
          dataLoading={dataLoading}
          dataError={dataError}
          welcomeNotice={welcomeNotice}
          onDismissWelcome={dismissWelcome}
          onSignInActivityUpdate={updateSignInActivity}
          onLogin={login}
          onRegister={register}
          onLogout={logout}
          onSaveExam={saveExam}
          onDeleteExam={deleteExam}
          onSubmitExam={submitExam}
          onStartExam={startExam}
          onSaveAnswers={saveAnswers}
          manageUsers={manageUsers}
          onSaveAnnouncement={saveAnnouncement}
          onDeleteAnnouncement={deleteAnnouncement}
        />
      )}
    </BrowserRouter>
  )
}

function AppShell({ user, data, dataLoading, dataError, welcomeNotice, onDismissWelcome, onSignInActivityUpdate, onLogin, onRegister, onLogout, onSaveExam, onDeleteExam, onSubmitExam, onStartExam, onSaveAnswers, manageUsers, onSaveAnnouncement, onDeleteAnnouncement }) {
  const [logoutError, setLogoutError] = useState('')
  const [signInNotice, setSignInNotice] = useState('')
  const [signInActivityError, setSignInActivityError] = useState('')
  const knownSignIns = useRef(new Set())

  useEffect(() => {
    knownSignIns.current = new Set(data.signInActivity.map((entry) => entry.id))
  }, [data.signInActivity])

  useEffect(() => {
    if (user?.role !== 'admin') return undefined
    let active = true

    const checkForSignIns = async () => {
      try {
        const afterId = Math.max(0, ...Array.from(knownSignIns.current, Number))
        const newSignIns = await api.signInActivity(afterId)
        if (!active) return
        const otherUserSignIns = newSignIns.filter((entry) => entry.userId !== user.id)
        for (const entry of newSignIns) knownSignIns.current.add(entry.id)
        onSignInActivityUpdate(newSignIns)
        setSignInActivityError('')
        if (otherUserSignIns.length) {
          const latest = otherUserSignIns[otherUserSignIns.length - 1]
          setSignInNotice(`${latest.name} (${latest.role}) just signed in.`)
        }
      } catch (error) {
        if (active) setSignInActivityError(error.message)
      }
    }

    const intervalId = window.setInterval(checkForSignIns, 15000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [user, onSignInActivityUpdate])

  useEffect(() => {
    if (!welcomeNotice) return undefined
    const timeoutId = window.setTimeout(onDismissWelcome, 6000)
    return () => window.clearTimeout(timeoutId)
  }, [welcomeNotice, onDismissWelcome])

  useEffect(() => {
    if (!signInNotice) return undefined
    const timeoutId = window.setTimeout(() => setSignInNotice(''), 8000)
    return () => window.clearTimeout(timeoutId)
  }, [signInNotice])

  const handleLogout = async () => {
    setLogoutError('')
    try {
      await onLogout()
    } catch (error) {
      setLogoutError(`Signed out on this device, but the API could not confirm token revocation: ${error.message}`)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-icon">Q</div>
          <div>
            <span className="brand-name">QuickThink</span>
            <small>Examination Portal</small>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/">Home</NavLink>
          {user ? (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/exams">Exams</NavLink>
              <NavLink to="/announcements">Announcements</NavLink>
              <NavLink to="/results">Results</NavLink>
              {user.role === 'admin' ? <NavLink to="/users">Users</NavLink> : null}
            </>
          ) : (
            <>
              <a href="/#about-us">About us</a>
              <a href="/#contact">Contact</a>
            </>
          )}
        </nav>

        {user ? (
          <div className="user-panel">
            <span>{user.name}</span>
            <button type="button" className="login-button" onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <NavLink to="/login" className="login-button">Login Portal</NavLink>
        )}
      </header>

      {logoutError ? <div className="message-box error">{logoutError}</div> : null}
      {welcomeNotice ? (
        <div className="notice-banner welcome-notice" role="status" aria-live="polite">
          <span>{welcomeNotice}</span>
          <button type="button" aria-label="Dismiss welcome notice" onClick={onDismissWelcome}>Dismiss</button>
        </div>
      ) : null}
      {user?.role === 'admin' && signInNotice ? (
        <div className="notice-banner sign-in-notice" role="status" aria-live="polite">{signInNotice}</div>
      ) : null}
      {user?.role === 'admin' && signInActivityError ? (
        <div className="message-box error" role="alert">Could not check recent sign-ins: {signInActivityError}</div>
      ) : null}
      {user && dataLoading ? (
        <div className="message-box data-loading-message" role="status" aria-live="polite">Loading your latest data…</div>
      ) : null}
      {user && dataError ? (
        <div className="message-box error" role="alert">Could not load the latest data: {dataError}</div>
      ) : null}

      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={onLogin} onRegister={onRegister} />} />
        <Route path="/dashboard" element={user ? <DashboardPage user={user} data={data} dataLoading={dataLoading} /> : <Navigate to="/login" replace />} />
        <Route path="/exams" element={user ? <ExamPage user={user} exams={data.exams} dataLoading={dataLoading} onSaveExam={onSaveExam} onDeleteExam={onDeleteExam} /> : <Navigate to="/login" replace />} />
        <Route path="/announcements" element={user ? <AnnouncementsPage user={user} announcements={data.announcements} dataLoading={dataLoading} onSave={onSaveAnnouncement} onDelete={onDeleteAnnouncement} /> : <Navigate to="/login" replace />} />
        <Route path="/results" element={user ? <ResultsPage user={user} data={data} dataLoading={dataLoading} /> : <Navigate to="/login" replace />} />
        <Route path="/users" element={user?.role === 'admin' ? <UsersPage users={data.users} dataLoading={dataLoading} manageUsers={manageUsers} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/student-exam/:examId" element={user?.role === 'student' ? <StudentExamPage exams={data.exams} onStartExam={onStartExam} onSaveAnswers={onSaveAnswers} onSubmitExam={onSubmitExam} /> : <Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  )
}

function LandingPage() {
  const [activeRole, setActiveRole] = useState('student')
  const selected = roleDetails[activeRole]

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Modern assessment platform</span>
          <h1>Build smarter exams for every learner.</h1>
          <p>
            QuickThink helps schools and universities manage assessments from question bank creation to automatic grading,
            result publishing, and live monitoring.
          </p>

          <div className="cta-row">
            <a href="/login" className="primary-btn">Create account</a>
            <a href="/dashboard" className="secondary-btn">View Features</a>
          </div>

          <div className="mini-trust">
            <span>Admin</span>
            <span>Teacher</span>
            <span>Student</span>
            <span>Secure</span>
          </div>
        </div>

        <div className="hero-panel">
          <div className="panel-header">
            <span className="dot green"></span>
            <span>Portal status</span>
            <span className="live-pill">Preview</span>
          </div>

          <div className="role-switcher" aria-label="Select role">
            {Object.entries(roleDetails).map(([key, role]) => (
              <button
                key={key}
                type="button"
                className={activeRole === key ? 'role-button active' : 'role-button'}
                style={{ '--role-accent': role.accent }}
                onClick={() => setActiveRole(key)}
              >
                {role.label}
              </button>
            ))}
          </div>

          <div className="role-card" style={{ '--role-accent': selected.accent }}>
            <div className="card-topline">
              <span className="badge">{selected.label}</span>
              <span className="small-tag">Ready</span>
            </div>
            <h3>{selected.label} dashboard</h3>
            <p>{selected.summary}</p>
          </div>

          <div className="float-metrics">
            <div>
              <strong>Timed</strong>
              <span>Server-enforced exam windows</span>
            </div>
            <div>
              <strong>Saved</strong>
              <span>Answers persist during an attempt</span>
            </div>
          </div>
        </div>
      </section>

      <section className="module-section">
        <div className="section-head">
          <span className="eyebrow">Core modules</span>
          <h2>Everything needed for a complete testing workflow</h2>
        </div>

        <div className="module-grid">
          {moduleCards.map((module) => (
            <article key={module.title} className="module-card">
              <div className="module-emoji">{module.icon}</div>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-info-section" id="about-us">
        <div className="landing-info-card">
          <span className="eyebrow">About us</span>
          <h2>Making assessments easier to manage</h2>
          <p>
            QuickThink brings exam creation, timed assessments, saved answers, and results together in one
            straightforward portal for administrators, teachers, and students.
          </p>
        </div>
      </section>

      <section className="landing-info-section" id="contact">
        <div className="landing-info-card contact-card">
          <span className="eyebrow">Contact</span>
          <h2>How can we help?</h2>
          <p>
            For help with your account, exams, or results, please contact your school or institution's
            QuickThink administrator.
          </p>
          <a href="/login" className="secondary-btn">Go to Login Portal</a>
        </div>
      </section>
    </main>
  )
}

function LoginPage({ onLogin, onRegister }) {
  const [mode, setMode] = useState('login')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' })
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleLoginSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setMessage('')
    try {
      await onLogin(loginForm.email, loginForm.password)
      navigate('/dashboard')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegisterSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setMessage('')
    try {
      await onRegister(registerForm)
      navigate('/dashboard')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-toggle">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} disabled={isSubmitting}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} disabled={isSubmitting}>Register</button>
        </div>

        {message ? <div className="message-box error" role="alert">{message}</div> : null}

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="auth-form">
            <h2>Welcome back</h2>
            <label>
              Email
              <input type="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} required />
            </label>
            <button type="submit" className="primary-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="auth-form">
            <h2>Create account</h2>
            <label>
              Full name
              <input type="text" value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} required />
            </label>
            <label>
              Email
              <input type="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} required />
            </label>
            <p className="import-note">Public registrations create student accounts. Administrators can create teacher and admin accounts from User Management.</p>
            <button type="submit" className="primary-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

function DashboardPage({ user, data, dataLoading }) {
  const totalResults = data.results.length
  const averageScore = totalResults ? Math.round(data.results.reduce((sum, item) => sum + item.score, 0) / totalResults) : 0
  const examCount = data.exams.length

  const upcoming = data.exams.slice(0, 3)

  return (
    <main className="content-page">
      <section className="section-head">
        <span className="eyebrow">Dashboard</span>
        <h2>Welcome, {user.name}</h2>
      </section>

      <div className="stats-grid dashboard-stats">
        <article className="stat-card violet">
          <span>Available Exams</span>
          <strong>{dataLoading ? '…' : examCount}</strong>
          <small>Current catalog</small>
        </article>
        <article className="stat-card blue">
          <span>Average Score</span>
          <strong>{dataLoading ? '…' : `${averageScore}%`}</strong>
          <small>Across results</small>
        </article>
        <article className="stat-card green">
          <span>Submissions</span>
          <strong>{dataLoading ? '…' : totalResults}</strong>
          <small>Total attempts</small>
        </article>
      </div>

      <div className="dashboard-section split-grid">
        <div className="panel-block">
          <div className="section-head left compact">
            <span className="eyebrow">Scheduled</span>
            <h2>Upcoming tests</h2>
          </div>

          <div className="exam-list">
            {upcoming.map((exam) => (
              <div key={exam.id} className="exam-row">
                <div>
                  <strong>{exam.title}</strong>
                  <small>{exam.subject}</small>
                </div>
                <span>{exam.date}</span>
                <span className={`status ${exam.status.toLowerCase()}`}>{exam.status}</span>
              </div>
            ))}
            {!upcoming.length ? (
              <div className="message-box">
                {dataLoading ? 'Loading exams…' : 'No upcoming exams yet.'}
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel-block">
          <div className="section-head left compact">
            <span className="eyebrow">Quick actions</span>
            <h2>Actions</h2>
          </div>

          <div className="action-stack">
            {user.role !== 'student' ? <a href="/exams" className="action-item">Manage exams</a> : <a href="/exams" className="action-item">View available exams</a>}
            <a href="/results" className="action-item">Review results</a>
            {user.role === 'student' && data.exams[0] ? <a href={`/student-exam/${data.exams[0].id}`} className="action-item">Take available exam</a> : null}
          </div>
        </div>
      </div>

      <section className="panel-block announcement-dashboard">
        <div className="section-head left compact announcement-heading">
          <div>
            <span className="eyebrow">Notice board</span>
            <h2>Announcements</h2>
          </div>
          <a href="/announcements" className="secondary-btn tiny">View all</a>
        </div>
        <AnnouncementList announcements={data.announcements.slice(0, 3)} isLoading={dataLoading} />
      </section>

      {user.role === 'admin' ? (
        <section className="panel-block sign-in-dashboard">
          <div className="section-head left compact">
            <span className="eyebrow">Account activity</span>
            <h2>Recent sign-ins</h2>
          </div>
          {data.signInActivity.length ? (
            <div className="sign-in-list">
              {data.signInActivity.slice(0, 10).map((entry) => (
                <article className="sign-in-row" key={entry.id}>
                  <div>
                    <strong>{entry.name}</strong>
                    <small>{entry.email} · {entry.role}</small>
                  </div>
                  <time dateTime={entry.signedInAt}>{new Date(entry.signedInAt).toLocaleString()}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="message-box">{dataLoading ? 'Loading sign-in activity…' : 'No sign-ins recorded yet.'}</div>
          )}
        </section>
      ) : null}
    </main>
  )
}

function AnnouncementList({ announcements, onDelete, isAdmin = false, isLoading = false }) {
  if (!announcements.length) {
    return <div className="message-box">{isLoading ? 'Loading announcements…' : 'No announcements have been posted yet.'}</div>
  }

  return (
    <div className="announcement-list">
      {announcements.map((announcement) => (
        <article key={announcement.id} className="announcement-card">
          <div className="announcement-meta">
            <span>{announcement.authorName || 'QuickThink Admin'}</span>
            <time dateTime={announcement.createdAt}>{new Date(announcement.createdAt).toLocaleString()}</time>
          </div>
          <h3>{announcement.title}</h3>
          <p>{announcement.body}</p>
          {isAdmin ? (
            <button
              type="button"
              className="danger-btn"
              onClick={() => onDelete(announcement.id)}
            >
              Delete post
            </button>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function AnnouncementsPage({ user, announcements, dataLoading, onSave, onDelete }) {
  const [form, setForm] = useState({ title: '', body: '' })
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      await onSave(form)
      setForm({ title: '', body: '' })
      setMessage('Announcement published.')
    } catch (error) {
      setMessage(error.message)
      setIsError(true)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (announcementId) => {
    const announcement = announcements.find((item) => item.id === announcementId)
    if (!window.confirm(`Delete "${announcement?.title || 'this announcement'}"?`)) return
    setMessage('')
    setIsError(false)
    try {
      await onDelete(announcementId)
      setMessage('Announcement deleted.')
    } catch (error) {
      setMessage(error.message)
      setIsError(true)
    }
  }

  return (
    <main className="content-page">
      <section className="section-head">
        <span className="eyebrow">Notice board</span>
        <h2>Announcements</h2>
        <p className="page-intro">Important updates and notices for the QuickThink community.</p>
      </section>

      {user.role === 'admin' ? (
        <section className="panel-block announcement-composer">
          <div className="section-head left compact">
            <span className="eyebrow">Administrator</span>
            <h2>Post an announcement</h2>
          </div>
          <form className="announcement-form" onSubmit={handleSubmit}>
            <label>
              Headline
              <input
                type="text"
                maxLength="180"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </label>
            <label>
              Announcement
              <textarea
                rows="4"
                maxLength="5000"
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                required
              />
            </label>
            {message ? <div className={isError ? 'message-box error' : 'message-box'}>{message}</div> : null}
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Publishing…' : 'Publish announcement'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="announcement-page-list" aria-label="Published announcements">
        <AnnouncementList announcements={announcements} onDelete={handleDelete} isAdmin={user.role === 'admin'} isLoading={dataLoading} />
      </section>
    </main>
  )
}

function ExamPage({ user, exams, dataLoading, onSaveExam, onDeleteExam }) {
  const [form, setForm] = useState(createEmptyExam)
  const [today] = useState(getLocalDateString)
  const [importState, setImportState] = useState({ busy: false, message: '', error: false })
  const [saveError, setSaveError] = useState('')

  const handleImport = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImportState({ busy: true, message: '', error: false })
    try {
      const extractedText = await extractDocumentText(file)
      const result = parseQuestions(extractedText)

      if (!result.questions.length) {
        throw new Error('No multiple-choice questions were found. Use numbered questions with options labeled A) through D). Scanned PDFs need OCR before import.')
      }

      const missingAnswers = result.questions.filter((question) => !question.answer).length
      setForm((current) => ({ ...current, questions: result.questions }))
      setImportState({
        busy: false,
        error: false,
        message: `Imported ${result.questions.length} question${result.questions.length === 1 ? '' : 's'} from ${file.name}.${result.skipped ? ` Skipped ${result.skipped} item${result.skipped === 1 ? '' : 's'} that did not contain enough multiple-choice options.` : ''}${missingAnswers ? ` Set the correct answer for ${missingAnswers} question${missingAnswers === 1 ? '' : 's'} before saving.` : ' Review the questions before saving.'}`,
      })
    } catch (error) {
      setImportState({
        busy: false,
        message: error instanceof Error ? error.message : 'Could not read this file.',
        error: true,
      })
    } finally {
      input.value = ''
    }
  }

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = [...form.questions]
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value }
    setForm({ ...form, questions: updatedQuestions })
  }

  const addQuestion = () => {
    setForm({
      ...form,
      questions: [
        ...form.questions,
        { id: `q-${Date.now()}-${Math.random()}`, text: 'New question', options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 'Option A' },
      ],
    })
  }

  const deleteQuestion = (index) => {
    if (form.questions.length <= 1) return
    setForm({ ...form, questions: form.questions.filter((_, idx) => idx !== index) })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaveError('')
    try {
      await onSaveExam(form)
      setForm(createEmptyExam())
    } catch (error) {
      setSaveError(error.message)
    }
  }

  const startEdit = (exam) => {
    setForm({ ...exam, questions: exam.questions.map((q) => ({ ...q })) })
  }

  return (
    <main className="content-page">
      <div className="section-head">
        <span className="eyebrow">Exams</span>
        <h2>{user.role === 'student' ? 'Available Exams' : 'Exam Manager'}</h2>
      </div>

      {user.role !== 'student' ? (
        <div className="panel-block exam-manager">
          {saveError ? <div className="message-box error">{saveError}</div> : null}
          {user.role === 'admin' ? (
            <section className="document-import" aria-labelledby="document-import-title">
              <div>
                <span className="eyebrow">Admin question import</span>
                <h3 id="document-import-title">Create questions from a document</h3>
                <p>Import text-based PDF or .docx files. Number questions and label multiple-choice options A) to D). Matching answer keys are detected when present.</p>
              </div>
              <label className="upload-control">
                <span>{importState.busy ? 'Reading document…' : 'Choose PDF or Word file'}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleImport}
                  disabled={importState.busy}
                />
              </label>
              {importState.message ? (
                <div className={importState.error ? 'message-box error' : 'message-box'}>
                  {importState.message}
                </div>
              ) : null}
              <small className="import-note">Files are processed in this browser and are not uploaded to a server. Scanned/image-only PDFs and old .doc files are not supported.</small>
            </section>
          ) : null}

          <form onSubmit={handleSubmit} className="exam-form">
            <div className="form-row two-col">
              <label>
                Exam title
                <input type="text" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
              </label>
              <label>
                Subject
                <input type="text" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} required />
              </label>
            </div>

            <div className="form-row two-col">
              <label>
                Duration (minutes)
                <input type="number" min="10" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} required />
              </label>
              <label>
                Date
                <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
              </label>
            </div>

            <div className="form-row" style={{ justifyContent: 'space-between' }}>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="Draft">Draft</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Published">Published</option>
                </select>
              </label>
              <button type="button" className="secondary-btn" onClick={addQuestion}>Add Question</button>
            </div>

            {form.questions.map((question, index) => (
              <div key={question.id} className="question-builder">
                <div className="builder-header">
                  <strong>Question {index + 1}</strong>
                  <button type="button" className="danger-btn" onClick={() => deleteQuestion(index)}>Remove</button>
                </div>

                <label>
                  Question text
                  <textarea rows="2" value={question.text} onChange={(event) => updateQuestion(index, 'text', event.target.value)} required />
                </label>

                <div className="option-grid">
                  {question.options.map((option, optionIndex) => (
                    <label key={`${question.id}-option-${optionIndex}`}>
                      Option {optionIndex + 1}
                      <input type="text" value={option} onChange={(event) => {
                        const nextOptions = [...question.options]
                        nextOptions[optionIndex] = event.target.value
                        updateQuestion(index, 'options', nextOptions)
                      }} required />
                    </label>
                  ))}
                </div>

                <label>
                  Correct answer
                  <select value={question.answer} onChange={(event) => updateQuestion(index, 'answer', event.target.value)} required>
                    <option value="" disabled>Select the correct answer</option>
                    {question.options.map((option) => (
                      <option key={`${question.id}-answer-${option}`} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
            ))}

            <button type="submit" className="primary-btn">Save Exam</button>
          </form>
        </div>
      ) : null}

      <div className="panel-block">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exam</th>
                <th>Subject</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td>{exam.title}</td>
                  <td>{exam.subject}</td>
                  <td>{exam.durationMinutes} min</td>
                  <td><span className={`status ${exam.status.toLowerCase()}`}>{exam.status}</span></td>
                  <td className="action-cell">
                    {user.role !== 'student' ? (
                      <>
                        <button type="button" className="secondary-btn tiny" onClick={() => startEdit(exam)}>Edit</button>
                        <button type="button" className="danger-btn tiny" onClick={async () => {
                          if (!window.confirm(`Delete "${exam.title}" and all its attempts?`)) return
                          try {
                            await onDeleteExam(exam.id)
                            setSaveError('')
                          } catch (error) {
                            setSaveError(error.message)
                          }
                        }}>Delete</button>
                      </>
                    ) : (
                      exam.date && exam.date > today
                        ? <span className="status scheduled">Opens {exam.date}</span>
                        : <a href={`/student-exam/${exam.id}`} className="secondary-btn tiny inline-link">Take Exam</a>
                    )}
                  </td>
                </tr>
              ))}
              {!exams.length ? (
                <tr>
                  <td colSpan="5">{dataLoading ? 'Loading exams…' : 'No exams found.'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}

function ResultsPage({ user, data, dataLoading }) {
  const visibleResults = user.role === 'student'
    ? data.results.filter((result) => result.studentId === user.id)
    : data.results

  return (
    <main className="content-page">
      <div className="section-head">
        <span className="eyebrow">Results</span>
        <h2>{user.role === 'student' ? 'Your performance' : 'Exam results dashboard'}</h2>
      </div>

      <div className="results-grid">
        {visibleResults.map((result) => (
          <div key={result.id} className="result-summary">
            <div className="score-pill">{result.score}%</div>
            <h3>{result.examTitle}</h3>
            <p>{result.studentName}</p>
            <small>{result.date}</small>
          </div>
        ))}
        {!visibleResults.length ? (
          <div className="message-box">{dataLoading ? 'Loading results…' : 'No submitted exam results yet.'}</div>
        ) : null}
      </div>
    </main>
  )
}

function UsersPage({ users, dataLoading, manageUsers }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'teacher' })
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [busy, setBusy] = useState(false)

  const createUser = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await manageUsers.create(form)
      setForm({ name: '', email: '', password: '', role: 'teacher' })
      setMessage('Account created.')
    } catch (error) {
      setIsError(true)
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const updateUser = async (id, values) => {
    setMessage('')
    try {
      await manageUsers.update(id, values)
      setIsError(false)
      setMessage('Account updated.')
    } catch (error) {
      setIsError(true)
      setMessage(error.message)
    }
  }

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete the account for ${user.name}?`)) return
    setMessage('')
    try {
      await manageUsers.delete(user.id)
      setIsError(false)
      setMessage('Account deleted.')
    } catch (error) {
      setIsError(true)
      setMessage(error.message)
    }
  }

  return (
    <main className="content-page">
      <div className="section-head">
        <span className="eyebrow">Administration</span>
        <h2>User management</h2>
      </div>

      {message ? <div className={isError ? 'message-box error' : 'message-box'}>{message}</div> : null}

      <section className="panel-block exam-manager">
        <h3>Create an account</h3>
        <form className="exam-form" onSubmit={createUser}>
          <div className="form-row two-col">
            <label>
              Full name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
          </div>
          <div className="form-row two-col">
            <label>
              Temporary password
              <input type="password" minLength="10" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Creating…' : 'Create Account'}</button>
        </form>
      </section>

      <section className="panel-block">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{person.email}</td>
                  <td>
                    <select aria-label={`Role for ${person.name}`} value={person.role} onChange={(event) => updateUser(person.id, { role: event.target.value })}>
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{person.isActive ? 'Active' : 'Disabled'}</td>
                  <td className="action-cell">
                    <button type="button" className="secondary-btn tiny" onClick={() => updateUser(person.id, { isActive: !person.isActive })}>
                      {person.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button type="button" className="danger-btn tiny" onClick={() => deleteUser(person)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!users.length ? (
                <tr><td colSpan="5">{dataLoading ? 'Loading user accounts…' : 'No user accounts found.'}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function StudentExamPage({ exams, onStartExam, onSaveAnswers, onSubmitExam }) {
  const { examId } = useParams()
  const exam = exams.find((item) => item.id === examId)
  const currentExamId = exam?.id
  const [answers, setAnswers] = useState({})
  const [answerRevision, setAnswerRevision] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')
  const [startState, setStartState] = useState('loading')
  const [expiresAt, setExpiresAt] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitLock = useRef(false)

  useEffect(() => {
    let active = true
    if (!currentExamId) return () => { active = false }
    onStartExam(currentExamId)
      .then((attempt) => {
        if (!active) return
        setAnswers(attempt.answers ?? {})
        const expiry = new Date(attempt.expiresAt).getTime()
        setExpiresAt(expiry)
        setTimeLeft(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)))
        setStartState('ready')
      })
      .catch((error) => {
        if (!active) return
        setMessage(error.message)
        setStartState('error')
      })
    return () => { active = false }
  }, [currentExamId, onStartExam])

  useEffect(() => {
    if (!expiresAt) return undefined
    const updateRemaining = () => setTimeLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    const interval = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(interval)
  }, [expiresAt])

  useEffect(() => {
    if (answerRevision === 0 || startState !== 'ready' || !expiresAt || Date.now() >= expiresAt || submitted) return undefined
    const timeout = window.setTimeout(() => {
      onSaveAnswers(currentExamId, answers).catch((error) => setMessage(error.message))
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [answerRevision, answers, currentExamId, expiresAt, onSaveAnswers, startState, submitted])

  const handleAnswer = (questionId, value) => {
    if (timeLeft === 0 || submitted) return
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setAnswerRevision((revision) => revision + 1)
  }

  const handleSubmit = (event) => {
    event?.preventDefault()
    if (submitLock.current || submitted || startState !== 'ready' || !currentExamId) return
    void sendExamAttempt({
      automatic: timeLeft === 0,
      examId: currentExamId,
      answers,
      timeLeft,
      saveAnswers: onSaveAnswers,
      submitAnswers: onSubmitExam,
      submitLock,
      setIsSubmitting,
      setMessage,
      setSubmitted,
    })
  }

  useEffect(() => {
    if (startState === 'ready' && timeLeft === 0 && !submitted) {
      void sendExamAttempt({
        automatic: true,
        examId: currentExamId,
        answers,
        timeLeft,
        saveAnswers: onSaveAnswers,
        submitAnswers: onSubmitExam,
        submitLock,
        setIsSubmitting,
        setMessage,
        setSubmitted,
      })
    }
  }, [answers, currentExamId, onSaveAnswers, onSubmitExam, startState, submitted, timeLeft])

  const timerLabel = timeLeft === null
    ? '--:--'
    : `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}`

  if (!exam) return <Navigate to="/dashboard" replace />

  return (
    <main className="content-page">
      <div className="section-head">
        <span className="eyebrow">Student exam</span>
        <h2>{exam.title}</h2>
      </div>

      <form onSubmit={handleSubmit} className="exam-taking-panel">
        {message ? <div className="message-box">{message}</div> : null}
        <div className="question-topbar">
          <span>{startState === 'loading' ? 'Starting exam…' : startState === 'ready' ? 'Your answers save automatically' : 'Exam unavailable'}</span>
          <span className="timer" role="timer" aria-live="polite">{timerLabel}</span>
        </div>

        {exam.questions.map((question, index) => (
          <div key={question.id} className="question-card">
            <p className="question-text">{index + 1}. {question.text}</p>
            <div className="options-list">
              {question.options.map((option) => (
                <label key={`${question.id}-${option}`} className="option-item">
                  <input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => handleAnswer(question.id, option)} disabled={submitted || startState !== 'ready' || timeLeft === 0} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <button type="submit" className="primary-btn" disabled={submitted || isSubmitting || startState !== 'ready'}>
          {isSubmitting ? 'Submitting…' : timeLeft === 0 ? 'Time ended — submitting' : 'Submit Exam'}
        </button>
      </form>
    </main>
  )
}

export default App
