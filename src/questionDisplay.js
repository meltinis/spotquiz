/**
 * UI-only formatting for answer option strings from `questions.js`.
 * Capitalizes the first grapheme (Danish locale) so a label like "sushi" renders
 * as "Sushi". The rest of the string is preserved exactly so all-caps markers
 * like "MANGLER" and proper nouns stay intact.
 */
export function formatAnswerDisplayText(text) {
  if (text == null) return ''
  const raw = String(text)
  if (!raw) return raw
  const chars = [...raw]
  const first = chars[0]
  const rest = chars.slice(1).join('')
  return first.toLocaleUpperCase('da-DK') + rest
}
