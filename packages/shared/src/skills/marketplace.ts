import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, sep } from 'node:path'
import matter from 'gray-matter'
import { validateSkillContent } from '../config/validators.ts'
import { getWorkspaceSkillsPath } from '../workspaces/storage.ts'
import { invalidateSkillsCache, loadSkillBySlug } from './storage.ts'

export const SKILLS_MARKETPLACE_BASE_URL = 'https://skills.sh'
export const MARKETPLACE_PAGE_SIZE = 200
export const MAX_MARKETPLACE_FILES = 500
export const MAX_MARKETPLACE_FILE_BYTES = 2 * 1024 * 1024
export const MAX_MARKETPLACE_TOTAL_BYTES = 20 * 1024 * 1024

export type SkillsMarketplaceView = 'all-time' | 'trending' | 'hot'

export interface MarketplaceSkillSummary {
  source: string
  skillId: string
  name: string
  installs: number
  weeklyInstalls?: number[]
  installsYesterday?: number
  change?: number
  isOfficial?: boolean
  installable: boolean
  marketplaceUrl: string
}

export interface MarketplaceSkillsPage {
  skills: MarketplaceSkillSummary[]
  hasMore: boolean
}

export interface MarketplaceSkillFile {
  path: string
  size: number
}

export interface MarketplaceSkillDetail extends MarketplaceSkillSummary {
  description: string
  content: string
  files: MarketplaceSkillFile[]
  hash: string
  repositoryUrl?: string
}

export interface MarketplaceInstallResult {
  slug: string
  path: string
  source: string
  hash: string
}

interface SnapshotFile {
  path: string
  contents: string
}

interface SkillSnapshot {
  files: SnapshotFile[]
  hash: string
}

export type MarketplaceFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface MarketplaceRequestOptions {
  baseUrl?: string
  fetchImpl?: MarketplaceFetch
  timeoutMs?: number
}

const GITHUB_SOURCE_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]*$/
const DEFAULT_TIMEOUT_MS = 10_000

function marketplaceUrl(source: string, skillId: string): string {
  if (GITHUB_SOURCE_RE.test(source)) {
    return `${SKILLS_MARKETPLACE_BASE_URL}/${source}/${skillId}`
  }
  return `${SKILLS_MARKETPLACE_BASE_URL}/site/${encodeURIComponent(source)}/${encodeURIComponent(skillId)}`
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseSummary(value: unknown): MarketplaceSkillSummary | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const source = typeof item.source === 'string' ? item.source.trim() : ''
  const skillId = typeof item.skillId === 'string'
    ? item.skillId.trim()
    : typeof item.id === 'string'
      ? item.id.split('/').at(-1)?.trim() ?? ''
      : ''
  const name = typeof item.name === 'string' ? item.name.trim() : skillId
  if (!source || !skillId || !name) return null

  return {
    source,
    skillId,
    name,
    installs: asFiniteNumber(item.installs),
    weeklyInstalls: Array.isArray(item.weeklyInstalls)
      ? item.weeklyInstalls.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
      : undefined,
    installsYesterday: typeof item.installsYesterday === 'number' ? item.installsYesterday : undefined,
    change: typeof item.change === 'number' ? item.change : undefined,
    isOfficial: item.isOfficial === true || undefined,
    installable: GITHUB_SOURCE_RE.test(source) && SKILL_ID_RE.test(skillId),
    marketplaceUrl: marketplaceUrl(source, skillId),
  }
}

async function fetchJson(url: string, options: MarketplaceRequestOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`skills.sh request failed (${response.status})`)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('skills.sh request timed out')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function baseUrl(options: MarketplaceRequestOptions): string {
  return (options.baseUrl ?? SKILLS_MARKETPLACE_BASE_URL).replace(/\/$/, '')
}

export async function listMarketplaceSkills(
  view: SkillsMarketplaceView,
  page = 0,
  options: MarketplaceRequestOptions = {},
): Promise<MarketplaceSkillsPage> {
  if (!['all-time', 'trending', 'hot'].includes(view)) throw new Error('Invalid marketplace view')
  if (!Number.isInteger(page) || page < 0) throw new Error('Invalid marketplace page')
  const data = await fetchJson(`${baseUrl(options)}/api/skills/${view}/${page}`, options)
  if (!data || typeof data !== 'object' || !Array.isArray((data as { skills?: unknown }).skills)) {
    throw new Error('skills.sh returned an invalid skills list')
  }
  const raw = data as { skills: unknown[]; hasMore?: unknown }
  return {
    skills: raw.skills.map(parseSummary).filter((skill): skill is MarketplaceSkillSummary => skill !== null),
    hasMore: raw.hasMore === true,
  }
}

export async function searchMarketplaceSkills(
  query: string,
  options: MarketplaceRequestOptions = {},
): Promise<MarketplaceSkillSummary[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) return []
  const params = new URLSearchParams({ q: normalizedQuery, limit: '100' })
  const data = await fetchJson(`${baseUrl(options)}/api/search?${params}`, options)
  if (!data || typeof data !== 'object' || !Array.isArray((data as { skills?: unknown }).skills)) {
    throw new Error('skills.sh returned invalid search results')
  }
  return (data as { skills: unknown[] }).skills
    .map(parseSummary)
    .filter((skill): skill is MarketplaceSkillSummary => skill !== null)
    .sort((a, b) => b.installs - a.installs)
}

function assertInstallableIdentity(source: string, skillId: string): void {
  if (!GITHUB_SOURCE_RE.test(source)) throw new Error('This skill source is not available for direct installation')
  if (!SKILL_ID_RE.test(skillId)) throw new Error('Invalid marketplace skill ID')
}

async function fetchSnapshot(
  source: string,
  skillId: string,
  options: MarketplaceRequestOptions,
): Promise<SkillSnapshot> {
  assertInstallableIdentity(source, skillId)
  const [owner, repo] = source.split('/')
  const url = `${baseUrl(options)}/api/download/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}/${encodeURIComponent(skillId)}`
  const data = await fetchJson(url, options)
  if (!data || typeof data !== 'object') throw new Error('skills.sh returned an invalid skill snapshot')
  const snapshot = data as { files?: unknown; hash?: unknown }
  if (!Array.isArray(snapshot.files) || typeof snapshot.hash !== 'string' || !snapshot.hash) {
    throw new Error('skills.sh returned an invalid skill snapshot')
  }
  if (snapshot.files.length === 0 || snapshot.files.length > MAX_MARKETPLACE_FILES) {
    throw new Error(`Skill snapshot must contain 1-${MAX_MARKETPLACE_FILES} files`)
  }

  let totalBytes = 0
  const seen = new Set<string>()
  const files: SnapshotFile[] = snapshot.files.map((value) => {
    if (!value || typeof value !== 'object') throw new Error('Skill snapshot contains an invalid file')
    const file = value as { path?: unknown; contents?: unknown }
    if (typeof file.path !== 'string' || typeof file.contents !== 'string') {
      throw new Error('Skill snapshot contains an invalid file')
    }
    const rawPath = file.path.replace(/\\/g, '/')
    const normalizedPath = normalize(rawPath).split(sep).join('/')
    if (!rawPath || isAbsolute(rawPath) || rawPath.startsWith('/') || normalizedPath === '..' || normalizedPath.startsWith('../')) {
      throw new Error(`Unsafe skill file path: ${file.path}`)
    }
    if (seen.has(normalizedPath)) throw new Error(`Duplicate skill file path: ${normalizedPath}`)
    seen.add(normalizedPath)
    const bytes = Buffer.byteLength(file.contents, 'utf8')
    if (bytes > MAX_MARKETPLACE_FILE_BYTES) throw new Error(`Skill file is too large: ${normalizedPath}`)
    totalBytes += bytes
    if (totalBytes > MAX_MARKETPLACE_TOTAL_BYTES) throw new Error('Skill snapshot is too large')
    return { path: normalizedPath, contents: file.contents }
  })

  const skillFile = files.find((file) => file.path.toLowerCase() === 'skill.md')
  if (!skillFile) throw new Error('Skill snapshot does not contain a root SKILL.md')
  const validation = validateSkillContent(skillFile.contents, skillId)
  if (!validation.valid) {
    throw new Error(`Invalid SKILL.md: ${validation.errors.map((issue) => issue.message).join('; ')}`)
  }

  return { files, hash: snapshot.hash }
}

export async function getMarketplaceSkillDetail(
  summary: Pick<MarketplaceSkillSummary, 'source' | 'skillId' | 'name' | 'installs'>,
  options: MarketplaceRequestOptions = {},
): Promise<MarketplaceSkillDetail> {
  const snapshot = await fetchSnapshot(summary.source, summary.skillId, options)
  const skillFile = snapshot.files.find((file) => file.path.toLowerCase() === 'skill.md')!
  const parsed = matter(skillFile.contents)
  const parsedSummary = parseSummary(summary)!
  return {
    ...parsedSummary,
    description: typeof parsed.data.description === 'string' ? parsed.data.description : '',
    content: parsed.content,
    files: snapshot.files.map((file) => ({ path: file.path, size: Buffer.byteLength(file.contents, 'utf8') })),
    hash: snapshot.hash,
    repositoryUrl: `https://github.com/${summary.source}`,
  }
}

export async function installMarketplaceSkill(
  workspaceRoot: string,
  source: string,
  skillId: string,
  options: MarketplaceRequestOptions & { projectRoot?: string } = {},
): Promise<MarketplaceInstallResult> {
  assertInstallableIdentity(source, skillId)
  if (loadSkillBySlug(workspaceRoot, skillId, options.projectRoot)) {
    throw new Error(`A skill named "${skillId}" is already installed`)
  }

  const skillsDir = getWorkspaceSkillsPath(workspaceRoot)
  const destination = join(skillsDir, skillId)
  if (existsSync(destination)) throw new Error(`A skill named "${skillId}" already exists in this workspace`)

  const snapshot = await fetchSnapshot(source, skillId, options)
  await mkdir(skillsDir, { recursive: true })
  const tempDir = join(skillsDir, `.install-${skillId}-${randomUUID()}`)
  try {
    await mkdir(tempDir, { recursive: false })
    for (const file of snapshot.files) {
      const target = join(tempDir, file.path)
      const relative = target.slice(tempDir.length + 1)
      if (!relative || relative.startsWith(`..${sep}`) || target === tempDir) throw new Error(`Unsafe skill file path: ${file.path}`)
      await mkdir(join(target, '..'), { recursive: true })
      await writeFile(target, file.contents, { encoding: 'utf8', flag: 'wx' })
    }
    const provenance = {
      marketplace: 'skills.sh',
      source,
      skillId,
      hash: snapshot.hash,
      installedAt: new Date().toISOString(),
    }
    await writeFile(
      join(tempDir, '.craft-agent-market.json'),
      `${JSON.stringify(provenance, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
    await rename(tempDir, destination)
    invalidateSkillsCache()
    return { slug: skillId, path: destination, source, hash: snapshot.hash }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

export function marketplaceSnapshotDigest(files: SnapshotFile[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update(file.contents)
  }
  return hash.digest('hex')
}
