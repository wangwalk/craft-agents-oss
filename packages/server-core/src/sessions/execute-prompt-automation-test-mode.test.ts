import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionManager } from './SessionManager.ts'

// Regression test for craft-agents-oss#943:
//
//   The automation "Test" action awaited executePromptAutomation → sendMessage
//   to *full* completion. A prompt that used tools or produced >30s of output
//   tripped the 30s RPC client timeout and reported failure even though the
//   session streamed fine.
//
// The fix adds `waitForCompletion` to ExecutePromptAutomationInput. The Test
// handler passes `false` so the method returns once the session is created and
// the prompt is dispatched (fire-and-forget, error-logged). Real automation
// execution omits the flag and keeps awaiting completion.
//
// These tests stub the heavy collaborators (createSession / sendEvent /
// sendMessage) and lock the branch: waitForCompletion:false resolves even when
// sendMessage never settles; the default still awaits (and propagates errors).

describe('executePromptAutomation waitForCompletion', () => {
  let tmpRoot: string
  let sm: SessionManager

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'exec-prompt-automation-'))
    sm = new SessionManager()
    // Stub the collaborators executePromptAutomation touches. With no labels /
    // mentions / llmConnection in the input, everything else is skipped.
    ;(sm as unknown as { createSession: unknown }).createSession = async () => ({ id: 'test-sess' })
    ;(sm as unknown as { sendEvent: unknown }).sendEvent = () => {}
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('waitForCompletion:false returns as soon as the session is created (does not await the turn)', async () => {
    let sendCalled = false
    // Never-resolving send simulates a long tool-using turn.
    ;(sm as unknown as { sendMessage: unknown }).sendMessage = () => {
      sendCalled = true
      return new Promise<never>(() => {})
    }

    const result = await sm.executePromptAutomation({
      workspaceId: 'ws_test',
      workspaceRootPath: tmpRoot,
      prompt: 'do something long',
      waitForCompletion: false,
    })

    expect(result.sessionId).toBe('test-sess')
    expect(sendCalled).toBe(true)
  })

  it('default (waitForCompletion unset) awaits sendMessage and propagates its error', async () => {
    ;(sm as unknown as { sendMessage: unknown }).sendMessage = () =>
      Promise.reject(new Error('send failed'))

    await expect(
      sm.executePromptAutomation({
        workspaceId: 'ws_test',
        workspaceRootPath: tmpRoot,
        prompt: 'do something',
      }),
    ).rejects.toThrow('send failed')
  })

  it('binds the session and resolves project-level skills from the Project working directory', async () => {
    const projectRoot = join(tmpRoot, 'repo')
    const projectDir = join(tmpRoot, 'projects', 'demo')
    mkdirSync(join(projectRoot, '.agents', 'skills', 'project-skill'), { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'config.json'), JSON.stringify({
      id: 'project-123',
      slug: 'demo',
      name: 'Demo',
      workingDirectory: projectRoot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
    writeFileSync(join(projectRoot, '.agents', 'skills', 'project-skill', 'SKILL.md'), [
      '---',
      'name: Project Skill',
      'description: Project-only automation skill',
      '---',
      '',
      'Run the project workflow.',
    ].join('\n'))

    let createOptions: Record<string, unknown> | undefined
    let sendOptions: Record<string, unknown> | undefined
    ;(sm as unknown as { createSession: unknown }).createSession = async (_workspaceId: string, options: Record<string, unknown>) => {
      createOptions = options
      return { id: 'project-session' }
    }
    ;(sm as unknown as { sendMessage: unknown }).sendMessage = async (
      _sessionId: string,
      _prompt: string,
      _attachments: unknown,
      _storedAttachments: unknown,
      options: Record<string, unknown>,
    ) => {
      sendOptions = options
    }

    await sm.executePromptAutomation({
      workspaceId: 'ws_test',
      workspaceRootPath: tmpRoot,
      projectId: 'project-123',
      prompt: 'Run @project-skill',
      mentions: ['project-skill'],
    })

    expect(createOptions?.projectId).toBe('project-123')
    expect(sendOptions?.skillSlugs).toEqual(['project-skill'])
  })

  it('fails closed when the bound Project no longer exists', async () => {
    ;(sm as unknown as { sendMessage: unknown }).sendMessage = async () => {}

    await expect(sm.executePromptAutomation({
      workspaceId: 'ws_test',
      workspaceRootPath: tmpRoot,
      projectId: 'missing-project',
      prompt: 'do not run in the wrong repository',
    })).rejects.toThrow('Automation project missing-project not found')
  })

  it('fails closed when the bound Project is archived', async () => {
    const projectDir = join(tmpRoot, 'projects', 'archived')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'config.json'), JSON.stringify({
      id: 'archived-project',
      slug: 'archived',
      name: 'Archived Project',
      archivedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }))
    ;(sm as unknown as { sendMessage: unknown }).sendMessage = async () => {}

    await expect(sm.executePromptAutomation({
      workspaceId: 'ws_test',
      workspaceRootPath: tmpRoot,
      projectId: 'archived-project',
      prompt: 'do not run archived work',
    })).rejects.toThrow('is archived')
  })
})
