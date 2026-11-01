import { atom, read, update } from 'claude-code'
import type { Interface, Register } from 'claude-code'

// How full the context window is, as Snow Leopard draws it: an Aqua progress
// bar on the footer's mode line, beside the permission mode. Blue, amber from
// 70%, red from 85%.
const percent = atom({ plugin: 'snowleopard-context', key: 'percent' } as const, null)

const WIDTH = 12
const TRACK = '#484848'
export const color = (p: number) => (p >= 85 ? '#e23b2e' : p >= 70 ? '#f0a315' : '#5b93e3')

/** How many of the bar's cells are filled at p percent. */
export const filledCells = (p: number) => Math.max(0, Math.min(WIDTH, Math.round((p / 100) * WIDTH)))

// The figure changes with each response; it's read again at the points that follow one.
async function refresh($: Interface) {
  const usage = await $.session.usage()
  const p = usage.context.percent
  await update($, percent, () => (typeof p === 'number' ? p : null))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const p = await read($, percent)
    if (p === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const filled = filledCells(p)
    const c = color(p)
    return (
      <Box flexDirection="row">
        {e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}  </Text> : null}
        <Text color={c}>{'━'.repeat(filled)}</Text>
        <Text color={TRACK}>{'━'.repeat(WIDTH - filled)}</Text>
        <Text color={c}> {Math.round(p)}%</Text>
        <Text dimColor> context</Text>
      </Box>
    )
  })
}
