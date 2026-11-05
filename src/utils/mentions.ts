/** Shared longest-name matching for display, renaming and model input. */
export interface MentionPart { text: string; name?: string; mention?: boolean; start: number }
export function mentionParts(text: string, names: string[]): MentionPart[] {
  const ordered = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)
  const parts: MentionPart[] = []
  let position = 0
  while (position < text.length) {
    const at = text.indexOf('@', position)
    if (at < 0) { parts.push({ text: text.slice(position), start: position }); break }
    if (at > position) parts.push({ text: text.slice(position, at), start: position })
    const rest = text.slice(at + 1)
    const name = ordered.find(n => rest.startsWith(n))
    const token = '@' + (name ?? rest.match(/^[\p{L}\p{N}_-]+/u)?.[0] ?? '')
    parts.push({ text: token, name, mention: true, start: at })
    position = at + token.length
  }
  return parts
}
export const stripUnknownMentions = (text: string, names: string[]) => mentionParts(text, names)
  .map(part => part.mention && !part.name ? part.text.slice(1) : part.text).join('')
export function renameText(text: string, names: string[], oldName: string, newName: string, sync: boolean) {
  let plainChanged = false
  const value = mentionParts(text, names).map(part => {
    if (part.mention) return part.name === oldName ? '@' + newName : part.text
    if (sync && part.text.includes(oldName)) { plainChanged = true; return part.text.split(oldName).join(newName) }
    return part.text
  }).join('')
  return { value, plainChanged }
}
