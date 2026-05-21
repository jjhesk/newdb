import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import md5 from 'md5'
import './PostgresSetup.css'
import databaseIcon from './assets/database-com.svg'
import { getTheme, toggleTheme, type Theme } from './theme'

const STORAGE_KEY = 'newdb:postgres-setup'

/** SQL string literal: escape single quotes by doubling. */
function escapeSqlString(s: string): string {
  return s.replaceAll("'", "''")
}

/** `md5` + hex( UTF-8( password + role ) ) for PostgreSQL legacy password format. */
function postgresMd5PasswordText(roleName: string): string {
  const role = roleName.trim() || 'hohoho'
  const timex = Date.now().toString()
  return 'fdx' + md5(timex + role)
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function validateIdent(
  name: string,
  label: string,
): { ok: true } | { ok: false; message: string } {
  if (!name.trim()) {
    return { ok: false, message: `${label} is required` }
  }
  if (!IDENT_RE.test(name)) {
    return {
      ok: false,
      message: `${label} may only contain letters, numbers, and underscores, and must not start with a number`,
    }
  }
  return { ok: true }
}

function buildConnectHeaderComments(
  style: ConnectDockerStyle,
  su: string,
  connectTarget: string,
): string[] {
  const psqlU = 'psql -U ' + su
  const d = connectTarget
  switch (style) {
    case 'exec-shell':
      return [
        '-- Run as a database superuser (e.g. inside the container:)',
        '--   docker exec -it ' + d + ' bash',
        '--   ' + psqlU,
      ]
    case 'exec-psql':
      return [
        '-- Run as a database superuser, e.g.:',
        '--   docker exec -it ' + d + ' ' + psqlU,
      ]
    case 'compose-exec-shell':
      return [
        '-- Run as a database superuser (e.g. with Docker Compose:)',
        '--   docker compose exec -it ' + d + ' bash',
        '--   ' + psqlU,
      ]
    case 'compose-exec-psql':
      return [
        '-- Run as a database superuser, e.g.:',
        '--   docker compose exec -it ' + d + ' ' + psqlU,
      ]
    case 'no-docker':
      return [
        '-- Run as a database superuser, e.g.:',
        '--   ' + psqlU,
        '-- (Adjust host/role if you connect to Postgres on the host or a remote address.)',
      ]
  }
}

/** Single command to get a <code>psql</code> as the connect superuser (for UI preview; shell-in-two-lines styles collapse to direct psql). */
function buildConnectOneLiner(style: ConnectDockerStyle, su: string, connectTarget: string): string {
  const u = 'psql -U ' + su
  const d = connectTarget
  switch (style) {
    case 'exec-shell':
    case 'exec-psql':
      return 'docker exec -it ' + d + ' ' + u
    case 'compose-exec-shell':
    case 'compose-exec-psql':
      return 'docker compose exec -it ' + d + ' ' + u
    case 'no-docker':
      return u
  }
}

export const EXTENSIONS = [
  {
    id: 'vector',
    name: 'vector' as const,
    label: 'pgvector',
    blurb: 'Vector similarity (embeddings, AI search).',
  },
  {
    id: 'postgis',
    name: 'postgis' as const,
    label: 'PostGIS',
    blurb: 'Geographic objects and queries.',
  },
  {
    id: 'pg_trgm',
    name: 'pg_trgm' as const,
    label: 'pg_trgm',
    blurb: 'Trigram similarity and index support for text search.',
  },
  {
    id: 'unaccent',
    name: 'unaccent' as const,
    label: 'unaccent',
    blurb: 'Strip accents for search; often used with full-text search.',
  },
  {
    id: 'btree_gin',
    name: 'btree_gin' as const,
    label: 'btree_gin',
    blurb: 'Combine B-tree and GIN capabilities in GIN operator classes.',
  },
  {
    id: 'btree_gist',
    name: 'btree_gist' as const,
    label: 'btree_gist',
    blurb: 'B-tree–like behavior in GiST indexes.',
  },
  {
    id: 'uuid-ossp',
    name: 'uuid-ossp' as const,
    label: 'uuid-ossp',
    blurb: 'UUID generation functions (uuid_generate_v4, etc.).',
  },
  {
    id: 'pgcrypto',
    name: 'pgcrypto' as const,
    label: 'pgcrypto',
    blurb: 'Cryptographic functions and digest helpers.',
  },
  {
    id: 'citext',
    name: 'citext' as const,
    label: 'citext',
    blurb: 'Case-insensitive text type.',
  },
  {
    id: 'hstore',
    name: 'hstore' as const,
    label: 'hstore',
    blurb: 'Key/value pairs in a single column.',
  },
] as const

type ExtensionName = (typeof EXTENSIONS)[number]['name']

/** Extensions that ship in Debian/Ubuntu <code>postgresql-&lt;N&gt;-contrib</code>. */
const CONTRIB_EXTENSION_NAMES: ReadonlySet<ExtensionName> = new Set([
  'pg_trgm',
  'unaccent',
  'btree_gin',
  'btree_gist',
  'uuid-ossp',
  'pgcrypto',
  'citext',
  'hstore',
])

function isPgMajorForApt(s: string): boolean {
  if (!/^\d{1,2}$/.test(s.trim())) return false
  const n = Number(s)
  return n >= 9 && n <= 20
}

/** How the “connect” header comments describe reaching <code>psql</code> (Docker / Compose / host). */
type ConnectDockerStyle =
  | 'exec-shell'
  | 'exec-psql'
  | 'compose-exec-shell'
  | 'compose-exec-psql'
  | 'no-docker'

type PostgresForm = {
  roleName: string
  password: string
  databaseName: string
  /**
   * User in <code>psql -U …</code> in comments; often <code>root</code> in a container, or
   * <code>postgres</code> in official images. Empty in storage resolves to <code>root</code>.
   */
  connectPsqlUser: string
  /**
   * Container name or ID for <code>docker exec</code>, or compose service name for
   * <code>docker compose exec</code>. Default <code>postgres_container</code>.
   */
  dockerConnectTarget: string
  /** Shown in SQL header comments: docker exec, compose, or local <code>psql</code> only. */
  connectDockerStyle: ConnectDockerStyle
  /** Major version for <code>postgresql-&lt;N&gt;-*</code> apt package names. */
  pgMajorForApt: string
  extensions: Record<ExtensionName, boolean>
}

const DEFAULT_CONNECT_PSQL_USER = 'root'

/** Superuser name used in connect comments and one-liner (must match <code>buildSql</code>). */
function connectPsqlUserResolved(
  f: Pick<PostgresForm, 'connectPsqlUser'>,
): string {
  const t = f.connectPsqlUser.trim()
  return t || DEFAULT_CONNECT_PSQL_USER
}

const DEFAULT_DOCKER_CONNECT_TARGET = 'postgres_container'

function connectDockerTargetResolved(
  f: Pick<PostgresForm, 'dockerConnectTarget'>,
): string {
  const t = f.dockerConnectTarget.trim()
  return t || DEFAULT_DOCKER_CONNECT_TARGET
}

const defaultForm: PostgresForm = {
  roleName: 'myapp',
  password: '',
  databaseName: 'myapp',
  connectPsqlUser: DEFAULT_CONNECT_PSQL_USER,
  dockerConnectTarget: DEFAULT_DOCKER_CONNECT_TARGET,
  connectDockerStyle: 'exec-shell',
  pgMajorForApt: '16',
  extensions: {
    vector: false,
    postgis: false,
    pg_trgm: false,
    unaccent: false,
    btree_gin: false,
    btree_gist: false,
    'uuid-ossp': false,
    pgcrypto: false,
    citext: false,
    hstore: false,
  },
}

/** Legacy <code>superuserForDocs</code> + <code>customSuperuser</code> before a single <code>connectPsqlUser</code> field. */
type LegacySuperuser = {
  superuserForDocs?: 'postgres' | 'root' | 'custom'
  customSuperuser?: string
}

function connectPsqlUserFromStorage(
  parsed: (Partial<PostgresForm> & LegacySuperuser) | null,
): string {
  if (parsed == null) return defaultForm.connectPsqlUser
  const connectUser = parsed.connectPsqlUser
  if (typeof connectUser === 'string' && connectUser.trim() !== '') {
    return connectUser.trim()
  }
  if (parsed.superuserForDocs === 'custom' && parsed.customSuperuser?.trim()) {
    return parsed.customSuperuser.trim()!
  }
  if (parsed.superuserForDocs === 'postgres' || parsed.superuserForDocs === 'root') {
    return parsed.superuserForDocs
  }
  return defaultForm.connectPsqlUser
}

function loadForm(): PostgresForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultForm, extensions: { ...defaultForm.extensions } }
    const parsed = JSON.parse(raw) as Partial<PostgresForm> & LegacySuperuser
    const { superuserForDocs: _s, customSuperuser: _c, ...rest } = parsed
    const ex = { ...defaultForm.extensions, ...rest.extensions }
    return {
      ...defaultForm,
      ...rest,
      connectPsqlUser: connectPsqlUserFromStorage(parsed),
      extensions: { ...defaultForm.extensions, ...ex },
    }
  } catch {
    return { ...defaultForm, extensions: { ...defaultForm.extensions } }
  }
}

function redactPasswordInScript(sql: string, rawPassword: string): string {
  if (!rawPassword.trim()) return sql
  const esc = escapeSqlString(rawPassword)
  return sql.replaceAll(`'${esc}'`, "'********'")
}

function buildSql(
  f: PostgresForm,
): { lines: string[]; errors: string[]; passwordOk: boolean } {
  const err: string[] = []
  const r = validateIdent(f.roleName.trim(), 'User name (role)')
  if (!r.ok) err.push(r.message)
  const d = validateIdent(f.databaseName.trim(), 'Database name')
  if (!d.ok) err.push(d.message)
  const hasPwd = f.password.length > 0
  if (!hasPwd) err.push('Password is required for the generated CREATE USER line')

  const su = connectPsqlUserResolved(f)
  {
    const t = f.connectPsqlUser.trim()
    if (t && !IDENT_RE.test(t)) {
      err.push('psql -U (connect as): use letters, numbers, underscores only; or leave empty for root')
    }
  }

  const user = f.roleName.trim() || 'myapp'
  const db = f.databaseName.trim() || 'myapp'
  const passEsc = escapeSqlString(f.password)

  const extLines: string[] = (EXTENSIONS as readonly { name: ExtensionName; label: string }[])
    .filter((e) => f.extensions[e.name])
    .map((e) => `CREATE EXTENSION IF NOT EXISTS ${e.name}; -- ${e.label}`)

  const extBlock =
    extLines.length > 0
      ? [
          '',
          '-- Optional extensions (require packages on the server image; use a superuser if CREATE EXTENSION is denied).',
          ...extLines,
        ]
      : []

  const connectTarget = connectDockerTargetResolved(f)
  const connectLines = buildConnectHeaderComments(f.connectDockerStyle, su, connectTarget)
  const lines: string[] = [
    ...connectLines,
    '--  (Do not put CREATE DATABASE inside a transaction.)',
    hasPwd
      ? `CREATE USER ${user} WITH PASSWORD '${passEsc}';`
      : `-- CREATE USER ${user} WITH PASSWORD '…';  -- set password in the form first`,
    '',
    `CREATE DATABASE ${db} OWNER ${user};`,
    '',
    `-- Connect to the new database`,
    `\\c ${db}`,
    '',
    `-- App role & schema (same idea as a manual setup)`,
    `GRANT CONNECT ON DATABASE ${db} TO ${user};`,
    `GRANT USAGE ON SCHEMA public TO ${user};`,
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ' + user + ';',
    'GRANT CREATE ON SCHEMA public TO ' + user + ';',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public',
    '    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ' + user + ';',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public',
    '    GRANT ALL ON TABLES TO ' + user + ';',
    ...extBlock,
  ]

  return { lines, errors: err, passwordOk: hasPwd }
}

/**
 * Linux (Debian/Ubuntu) bash: <code>apt-get install</code> for the selected extension packages.
 * <code>vector</code> and <code>postgis</code> have their own packages; the other toggles are covered by
 * <code>postgresql-&lt;N&gt;-contrib</code> on current Debian/Ubuntu.
 */
function buildAptBash(f: PostgresForm): { text: string; hasPackages: boolean; majorInvalid: boolean } {
  const vRaw = f.pgMajorForApt.trim() || '16'
  if (!isPgMajorForApt(vRaw)) {
    return {
      text: [
        '#!/usr/bin/env bash',
        "# Set a valid PostgreSQL major in the form (9–20), e.g. 16, 15, 14, then copy again.\n",
      ].join("\n"),
      hasPackages: false,
      majorInvalid: true,
    }
  }
  const v = vRaw

  const ex = f.extensions
  const needContrib = (Object.keys(ex) as ExtensionName[]).some(
    (name) => ex[name] && CONTRIB_EXTENSION_NAMES.has(name),
  )
  const needVector = ex.vector
  const needPostgis = ex.postgis

  const pkgs: string[] = []
  if (needContrib) pkgs.push(`postgresql-${v}-contrib`)
  if (needVector) pkgs.push(`postgresql-${v}-pgvector`)
  if (needPostgis) pkgs.push(`postgresql-${v}-postgis-3`)

  if (pkgs.length === 0) {
    return {
      text: [
        '#!/usr/bin/env bash',
        '# No extension is selected. Enable at least one under “Optional extensions”, then copy again.',
        'set -euo pipefail',
        "echo 'Nothing to install.'",
        'exit 0',
        '',
      ].join('\n'),
      hasPackages: false,
      majorInvalid: false,
    }
  }

  const body: string[] = [
    '#!/usr/bin/env bash',
    '# Debian / Ubuntu: install selected PostgreSQL extension packages (apt).',
    '# Run on a system with apt (e.g. Ubuntu, Debian) — host or a container that has root/apt.',
    '# The major version should match: psql -c "SHOW server_version;"  (e.g. 16.x ➜ PGVER=16)',
    '#',
    'set -euo pipefail',
    `export PGVER="\${PGVER:-${v}}"`,
    'export DEBIAN_FRONTEND=noninteractive',
    'SUDO=""',
    'if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1; then',
    '  SUDO="sudo"',
    'fi',
    '${SUDO} apt-get update',
    '${SUDO} apt-get install -y \\',
  ]
  for (let i = 0; i < pkgs.length; i++) {
    body.push(i < pkgs.length - 1 ? `  ${pkgs[i]} \\` : `  ${pkgs[i]}`)
  }
  body.push("")
  body.push("echo 'Packages installed. Then run the generated SQL in psql (CREATE EXTENSION) as a superuser.'")
  if (needPostgis) {
    body.push(
      "echo 'Note: if postgresql-$PGVER-postgis-3 is missing, try: apt search postgresql-$PGVER-postgis' >&2",
    )
  }
  if (needVector) {
    body.push(
      "echo 'Note: if pgvector is missing, your release may not ship that package; try a backport, newer release, or a pre-built image with pgvector.' >&2",
    )
  }
  return {
    text: body.join("\n") + "\n",
    hasPackages: true,
    majorInvalid: false,
  }
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="ps-section" id={id} aria-labelledby={`${id}-title`}>
      <h2 className="ps-section-title" id={`${id}-title`}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function PostgresSetup() {
  const [f, setF] = useState<PostgresForm>(loadForm)
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const [aptCopiedAt, setAptCopiedAt] = useState<number | null>(null)
  const [theme, setTheme] = useState<Theme>(getTheme)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  const commitForm = useCallback(
    (updater: PostgresForm | ((prev: PostgresForm) => PostgresForm)) => {
      setF((prev) => {
        const next = typeof updater === 'function' ? (updater as (p: PostgresForm) => PostgresForm)(prev) : updater
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [],
  )

  const patch = useCallback(
    (partial: Partial<PostgresForm>) => {
      commitForm((prev) => ({ ...prev, ...partial }))
    },
    [commitForm],
  )

  const patchEx = useCallback(
    (name: ExtensionName, on: boolean) => {
      commitForm((prev) => ({
        ...prev,
        extensions: { ...prev.extensions, [name]: on },
      }))
    },
    [commitForm],
  )

  const generated = useMemo(() => buildSql(f), [f])
  const script = generated.lines.join('\n')
  const canCopy = generated.passwordOk && generated.errors.length === 0
  const displayScript = canCopy ? script : redactPasswordInScript(script, f.password)

  const roleValidation = useMemo(
    () => validateIdent(f.roleName.trim(), 'User name (role)'),
    [f.roleName],
  )
  const dbValidation = useMemo(
    () => validateIdent(f.databaseName.trim(), 'Database name'),
    [f.databaseName],
  )

  const aptBash = useMemo(() => buildAptBash(f), [f])
  const aptMajorValid = isPgMajorForApt(f.pgMajorForApt.trim() || '16')
  const canCopyApt = !aptBash.majorInvalid

  useEffect(() => {
    if (copiedAt == null) return
    const t = window.setTimeout(() => setCopiedAt(null), 2000)
    return () => clearTimeout(t)
  }, [copiedAt])

  useEffect(() => {
    if (aptCopiedAt == null) return
    const t = window.setTimeout(() => setAptCopiedAt(null), 2000)
    return () => clearTimeout(t)
  }, [aptCopiedAt])

  const copy = async () => {
    if (!canCopy) return
    try {
      await navigator.clipboard.writeText(script)
      setCopiedAt(Date.now())
    } catch {
      /* ignore */
    }
  }

  const copyApt = async () => {
    if (!canCopyApt) return
    try {
      await navigator.clipboard.writeText(aptBash.text)
      setAptCopiedAt(Date.now())
    } catch {
      /* ignore */
    }
  }

  const reset = () => {
    commitForm({ ...defaultForm, extensions: { ...defaultForm.extensions } })
  }

  const applyMd5Password = useCallback(() => {
    commitForm((prev) => {
      return { ...prev, password: postgresMd5PasswordText(prev.roleName) }
    })
  }, [commitForm])

  const onThemeClick = useCallback(() => {
    setTheme(toggleTheme())
  }, [])

  const suDisplay = connectPsqlUserResolved(f)

  const connectTarget = connectDockerTargetResolved(f)

  const connectOneLiner = useMemo(
    () => buildConnectOneLiner(f.connectDockerStyle, suDisplay, connectTarget),
    [f.connectDockerStyle, suDisplay, connectTarget],
  )

  return (
    <div className="ps-app">
      <header className="ps-header">
        <div className="ps-header-brand">
          <img className="ps-app-icon" src={databaseIcon} alt="" aria-hidden="true" />
          <div>
          <p className="ps-eyebrow">PostgreSQL</p>
          <h1>Role & database setup</h1>
          <p className="ps-sub">
            Set user name, password, and database, choose optional extensions, copy SQL and (on
            Debian/Ubuntu) a separate <code>apt</code> install script. Values stay in this browser
            only. Then run the SQL in <code>psql</code> as a superuser.
          </p>
          </div>
        </div>
        <div className="ps-header-actions">
          <button
            type="button"
            className="ps-btn ps-btn-ghost"
            onClick={onThemeClick}
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          {copiedAt != null && (
            <span className="ps-copied" aria-live="polite">
              SQL copied
            </span>
          )}
          <button
            type="button"
            className="ps-btn"
            onClick={copy}
            disabled={!canCopy}
            title={canCopy ? 'Copy to clipboard' : 'Fix validation errors to copy'}
          >
            Copy SQL
          </button>
          <button type="button" className="ps-btn ps-btn-ghost" onClick={reset}>
            Reset defaults
          </button>
        </div>
      </header>

      <div className="ps-layout">
        <nav className="ps-nav" aria-label="Sections">
          <a href="#connection">Connection (docs)</a>
          <a href="#identity">User &amp; database</a>
          <a href="#extensions">Extensions</a>
          <a href="#apt">Linux apt</a>
          <a href="#output">SQL</a>
        </nav>

        <div className="ps-panels">
          <Section id="connection" title="How you connect (comments only)">
            <p className="ps-desc" style={{ marginTop: 0 }}>
              Used in the <strong>header comments</strong> of the script so the README-style steps
              match your environment.
            </p>
            <div className="ps-field">
              <label htmlFor="connectDockerStyle">Docker / connect in comments</label>
              <p className="ps-desc">
                What to print above <code>CREATE USER</code>: <code>docker exec</code>,{' '}
                <code>docker compose exec</code>, a single psql line, or host <code>psql</code> only.
                {f.connectDockerStyle === 'no-docker' ? null : (
                  <>
                    {' '}
                    For Docker/Compose, set the name or ID in the next field; leave blank to use the
                    default <code>postgres_container</code>.
                  </>
                )}
              </p>
              <select
                id="connectDockerStyle"
                className="ps-input"
                value={f.connectDockerStyle}
                onChange={(e) => {
                  const v = e.target.value as ConnectDockerStyle
                  patch({ connectDockerStyle: v })
                }}
              >
                <option value="exec-shell">
                  Docker: shell then psql (exec -it … bash, then psql -U)
                </option>
                <option value="exec-psql">Docker: one line (exec -it … psql -U)</option>
                <option value="compose-exec-shell">
                  Compose: shell then psql (compose exec -it … bash, then psql -U)
                </option>
                <option value="compose-exec-psql">Compose: one line (compose exec -it … psql -U)</option>
                <option value="no-docker">Not Docker: psql on host / your own connection</option>
              </select>
            </div>
            {f.connectDockerStyle !== 'no-docker' && (
              <div className="ps-field">
                {f.connectDockerStyle.startsWith('exec-') ? (
                  <>
                    <label htmlFor="dockerConnectTarget">Container name or ID</label>
                    <p className="ps-desc" style={{ marginTop: 0 }}>
                      For <code>docker exec -it …</code>: the container name from <code>docker ps</code>, a
                      container ID, or a partial ID. Empty uses <code>postgres_container</code>.
                    </p>
                  </>
                ) : (
                  <>
                    <label htmlFor="dockerConnectTarget">Compose service name</label>
                    <p className="ps-desc" style={{ marginTop: 0 }}>
                      The service key from your <code>docker-compose.yml</code> that runs PostgreSQL. Empty
                      uses <code>postgres_container</code> as a placeholder to replace.
                    </p>
                  </>
                )}
                <input
                  id="dockerConnectTarget"
                  className="ps-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={DEFAULT_DOCKER_CONNECT_TARGET}
                  value={f.dockerConnectTarget}
                  onChange={(e) => patch({ dockerConnectTarget: e.target.value })}
                />
              </div>
            )}
            <div className="ps-field">
              <label htmlFor="connectPsqlUser">psql -U (connect as)</label>
              <p className="ps-desc" style={{ marginTop: 0 }}>
                User shown in the generated <code>psql -U …</code> lines. Many setups use <code>root</code> in
                a container shell, or the image default <code>postgres</code>. Same identifier rules as
                unquoted SQL names. Leave empty to use <code>root</code>.
              </p>
              <input
                id="connectPsqlUser"
                className={`ps-input ${!IDENT_RE.test(f.connectPsqlUser.trim() || 'x') && f.connectPsqlUser.trim() ? 'ps-input--error' : ''}`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder={DEFAULT_CONNECT_PSQL_USER}
                value={f.connectPsqlUser}
                onChange={(e) => patch({ connectPsqlUser: e.target.value })}
              />
              {!IDENT_RE.test(f.connectPsqlUser.trim() || 'x') && f.connectPsqlUser.trim() ? (
                <p className="ps-error">Use a simple SQL identifier (a–z, 0–9, _) or clear the field for root.</p>
              ) : null}
            </div>
            <div className="ps-field" style={{ marginTop: '1rem' }}>
              <label htmlFor="connectOneLinerOut">One line command</label>
              <p className="ps-desc" style={{ marginTop: 0 }}>
                Opens <code>psql</code> as the same connect user as the generated header, using the same
                container/compose name when applicable. For &quot;bash then <code>psql</code>&quot; in the
                script, this is the equivalent one shot.
              </p>
              <pre
                id="connectOneLinerOut"
                className="ps-output"
                style={{ marginTop: '0.5rem' }}
              >
                {connectOneLiner}
              </pre>
            </div>
            <p className="ps-hint" style={{ margin: 0 }}>
              The script itself always runs in <code>psql</code> <strong>as a superuser</strong>{' '}
              (often <code>{suDisplay}</code>); your app user is <code>{f.roleName.trim() || '…'}</code>.
            </p>
          </Section>

          <Section id="identity" title="User & database">
            <div className="ps-field">
              <label htmlFor="roleName">User name (role)</label>
              <p className="ps-desc">The application role that owns the database and public schema rights.</p>
              <input
                id="roleName"
                className={`ps-input${!roleValidation.ok ? ' ps-input--error' : ''}`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="myapp"
                value={f.roleName}
                onChange={(e) => patch({ roleName: e.target.value })}
              />
              {!roleValidation.ok ? <p className="ps-error">{roleValidation.message}</p> : null}
            </div>
            <div className="ps-field">
              <label htmlFor="dbName">Database name</label>
              <p className="ps-desc">New database name; must be a valid unquoted SQL identifier.</p>
              <input
                id="dbName"
                className={`ps-input${!dbValidation.ok ? ' ps-input--error' : ''}`}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="myapp"
                value={f.databaseName}
                onChange={(e) => patch({ databaseName: e.target.value })}
              />
              {!dbValidation.ok ? <p className="ps-error">{dbValidation.message}</p> : null}
            </div>
            <div className="ps-field">
              <label htmlFor="password">Password</label>
              <p className="ps-desc">Embedded in <code>CREATE USER … WITH PASSWORD</code>. <strong>MD5 (pass)</strong> replaces
                the field with PostgreSQL’s <code>md5</code>+hex(UTF-8 of password + user name above) for legacy md5 auth.
              </p>
              <div className="ps-password-row">
                <input
                  id="password"
                  ref={passwordInputRef}
                  className="ps-input"
                  type="text"
                  name="app-db-user-password"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="••••••••"
                  value={f.password}
                  onChange={(e) => patch({ password: e.target.value })}
                />
                <button
                  type="button"
                  className="ps-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={applyMd5Password}
                >
                  MD5 (pass)
                </button>
              </div>
              {f.password.length === 0 ? <p className="ps-error">Required to generate a final script.</p> : null}
            </div>
          </Section>

          <Section id="extensions" title="Optional extensions">
            <p className="ps-desc" style={{ marginTop: 0 }}>
              Toggles add <code>CREATE EXTENSION IF NOT EXISTS …</code> <strong>after</strong>{' '}
              <code>\c your_database</code>. Your image must provide the package (e.g. PostGIS, pgvector
              builds).
            </p>
            <div className="ps-ex-list">
              {EXTENSIONS.map((e) => (
                <div key={e.id} className="ps-ex">
                  <input
                    type="checkbox"
                    id={`ex-${e.id}`}
                    checked={f.extensions[e.name]}
                    onChange={(ev) => patchEx(e.name, ev.target.checked)}
                  />
                  <div>
                    <label htmlFor={`ex-${e.id}`}>{e.label}</label>
                    <p className="ps-desc">{e.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="apt" title="Linux: apt install (Debian / Ubuntu)">
            <p className="ps-desc" style={{ marginTop: 0 }}>
              Separate <strong>bash</strong> script: installs <code>apt</code> packages that match
              the extensions you checked. <em>Contrib</em> extensions (pg_trgm, citext, pgcrypto,
              etc.) map to a single <code>postgresql-&lt;N&gt;-contrib</code> package. pgvector and
              PostGIS use <code>postgresql-&lt;N&gt;-pgvector</code> and{' '}
              <code>postgresql-&lt;N&gt;-postgis-3</code> on current releases. Adjust the major if
              your server differs.
            </p>
            <div className="ps-field">
              <label htmlFor="pgMajorApt">PostgreSQL major version (package suffix)</label>
              <p className="ps-desc">Used in <code>postgresql-16-contrib</code> style names. Check with{' '}
                <code>psql -c "SHOW server_version;"</code> (e.g. 16.4 → 16).
              </p>
              <input
                id="pgMajorApt"
                className={`ps-input${!aptMajorValid && f.pgMajorForApt.length > 0 ? ' ps-input--error' : ''}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="16"
                value={f.pgMajorForApt}
                onChange={(e) => patch({ pgMajorForApt: e.target.value.replace(/\D/g, '') })}
              />
              {!aptMajorValid && f.pgMajorForApt.length > 0 ? (
                <p className="ps-error">Use a major version from 9 to 20 (e.g. 16).</p>
              ) : null}
            </div>
            <div className="ps-apt-bar">
              {aptCopiedAt != null && (
                <span className="ps-copied" aria-live="polite">
                  Script copied
                </span>
              )}
              <button
                type="button"
                className="ps-btn"
                onClick={copyApt}
                disabled={!canCopyApt}
                title={canCopyApt ? 'Copy apt bash script' : 'Fix the PostgreSQL major value'}
              >
                Copy apt bash
              </button>
            </div>
            <pre className="ps-output" aria-label="Debian or Ubuntu apt install script">
              {aptBash.text}
            </pre>
            <p className="ps-hint" style={{ margin: '0.75rem 0 0' }}>
              Run the script on a host or image that uses <code>apt</code>. The script uses{' '}
              <code>sudo</code> when you are not root. Package names can vary by release; use{' '}
              <code>apt search postgresql-16-</code> to confirm, then run your generated SQL in{' '}
              <code>psql</code> to <code>CREATE EXTENSION</code>.
            </p>
          </Section>

          <Section id="output" title="Generated SQL">
            {!canCopy && (
              <p className="ps-error" style={{ marginTop: 0 }}>
                {generated.errors.join(' ')}
              </p>
            )}
            <pre className="ps-output" aria-label="SQL script to run">
              {displayScript}
            </pre>
            <p className="ps-hint" style={{ margin: '0.75rem 0 0' }}>
              Run in order: the first block creates the role and database; after <code>\c</code>, grants
              and extension lines apply in the new database. If an extension is missing, install the
              matching OS/package in your image or use a pre-built Postgres+PostGIS (or +pgvector) image.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
