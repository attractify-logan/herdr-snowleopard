export type ContextPercent = number | null

declare module 'claude-code' {
  interface PluginState {
    'snowleopard-context': { percent: ContextPercent }
  }
}
