/** Apply form patches to Vue's reactive state, including nested form fields. */
export function updateState(state: Record<string, any>, patch: Record<string, unknown>): void {
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('.')
    let target = state
    for (const key of parts.slice(0, -1)) {
      target[key] ??= {}
      target = target[key]
    }
    target[parts[parts.length - 1]] = value
  }
}
