import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getMarketplaceSkillDetail,
  installMarketplaceSkill,
  listMarketplaceSkills,
  searchMarketplaceSkills,
  type MarketplaceFetch,
} from '../marketplace.ts'

const skillMd = `---
name: test-skill
description: A test marketplace skill
---
# Test Skill

Follow these instructions.
`

function jsonFetch(body: unknown, status = 200): MarketplaceFetch {
  return async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function snapshot(files = [{ path: 'SKILL.md', contents: skillMd }]) {
  return { files, hash: 'abc123' }
}

describe('skills.sh marketplace', () => {
  let workspaceRoot: string

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'craft-marketplace-test-'))
  })

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true })
  })

  it('parses leaderboard entries and marks non-GitHub sources as browse-only', async () => {
    const page = await listMarketplaceSkills('trending', 0, {
      fetchImpl: jsonFetch({
        skills: [
          { source: 'owner/repo', skillId: 'test-skill', name: 'test-skill', installs: 42 },
          { source: 'example.com', skillId: 'site-skill', name: 'site-skill', installs: 5 },
        ],
        hasMore: true,
      }),
    })

    expect(page.hasMore).toBe(true)
    expect(page.skills[0]?.installable).toBe(true)
    expect(page.skills[1]?.installable).toBe(false)
  })

  it('does not call search for queries shorter than two characters', async () => {
    let called = false
    const results = await searchMarketplaceSkills('a', {
      fetchImpl: async () => {
        called = true
        return new Response('{}')
      },
    })
    expect(results).toEqual([])
    expect(called).toBe(false)
  })

  it('parses detail content and file manifest', async () => {
    const detail = await getMarketplaceSkillDetail(
      { source: 'owner/repo', skillId: 'test-skill', name: 'test-skill', installs: 10 },
      { fetchImpl: jsonFetch(snapshot([{ path: 'SKILL.md', contents: skillMd }, { path: 'scripts/run.ts', contents: 'export {}' }])) },
    )
    expect(detail.description).toBe('A test marketplace skill')
    expect(detail.content).toContain('# Test Skill')
    expect(detail.files.map((file) => file.path)).toEqual(['SKILL.md', 'scripts/run.ts'])
  })

  it('installs all files atomically with provenance metadata', async () => {
    const result = await installMarketplaceSkill(workspaceRoot, 'owner/repo', 'test-skill', {
      fetchImpl: jsonFetch(snapshot([{ path: 'SKILL.md', contents: skillMd }, { path: 'scripts/run.ts', contents: 'export {}' }])),
    })

    expect(result.slug).toBe('test-skill')
    expect(readFileSync(join(result.path, 'SKILL.md'), 'utf8')).toBe(skillMd)
    expect(readFileSync(join(result.path, 'scripts/run.ts'), 'utf8')).toBe('export {}')
    expect(JSON.parse(readFileSync(join(result.path, '.craft-agent-market.json'), 'utf8')).source).toBe('owner/repo')
  })

  it('rejects path traversal and leaves no partial install', async () => {
    await expect(installMarketplaceSkill(workspaceRoot, 'owner/repo', 'test-skill', {
      fetchImpl: jsonFetch(snapshot([{ path: 'SKILL.md', contents: skillMd }, { path: '../escape', contents: 'bad' }])),
    })).rejects.toThrow('Unsafe skill file path')
    expect(existsSync(join(workspaceRoot, 'skills', 'test-skill'))).toBe(false)
  })

  it('rejects invalid SKILL.md content', async () => {
    await expect(installMarketplaceSkill(workspaceRoot, 'owner/repo', 'test-skill', {
      fetchImpl: jsonFetch(snapshot([{ path: 'SKILL.md', contents: '# Missing frontmatter' }])),
    })).rejects.toThrow('Invalid SKILL.md')
  })

  it('does not overwrite an existing workspace skill', async () => {
    const dir = join(workspaceRoot, 'skills', 'test-skill')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), skillMd)

    let called = false
    await expect(installMarketplaceSkill(workspaceRoot, 'owner/repo', 'test-skill', {
      fetchImpl: async () => {
        called = true
        return new Response('{}')
      },
    })).rejects.toThrow('already installed')
    expect(called).toBe(false)
  })
})
