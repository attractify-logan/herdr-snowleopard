import { expect, test } from 'claude-code/testing'

import { color, filledCells } from './register'

test('the bar fills with the context and changes color at 70% and 85%', () => {
  expect(filledCells(0)).toBe(0)
  expect(filledCells(50)).toBe(6)
  expect(filledCells(100)).toBe(12)
  expect(filledCells(140)).toBe(12)
  expect(color(40)).toBe('#5b93e3')
  expect(color(70)).toBe('#f0a315')
  expect(color(85)).toBe('#e23b2e')
})

test('leaves the footer modes as they are before the first response', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine modes')
  })
  const ui = await $.ui.mount({ plugin: 'snowleopard-context', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
  expect(await ui.find({ text: 'engine modes' })).toBeDefined()
})
