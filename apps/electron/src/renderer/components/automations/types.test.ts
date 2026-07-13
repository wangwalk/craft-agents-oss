import { describe, expect, it } from 'bun:test'
import { parseAutomationsConfig } from './types'

describe('parseAutomationsConfig project binding', () => {
  it('retains projectId for renderer display and test execution', () => {
    const items = parseAutomationsConfig({
      version: 2,
      automations: {
        SchedulerTick: [{
          id: 'abc123',
          name: 'Project triage',
          cron: '0 9 * * *',
          projectId: 'project-123',
          actions: [{ type: 'prompt', prompt: 'Run @project-triage' }],
        }],
      },
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'abc123',
      matcherIndex: 0,
      projectId: 'project-123',
    })
  })

  it('keeps legacy unbound automations unchanged', () => {
    const items = parseAutomationsConfig({
      version: 2,
      automations: {
        SchedulerTick: [{
          actions: [{ type: 'prompt', prompt: 'Workspace report' }],
        }],
      },
    })

    expect(items).toHaveLength(1)
    expect(items[0]?.projectId).toBeUndefined()
  })
})
