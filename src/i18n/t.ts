import { messages } from './messages'

// Locale switching arrives with Dutch and Italian; English only for now.
export const m = messages.en

/** Replace `{name}` placeholders in a message. */
export function fill(message: string, values: Record<string, string>): string {
  return message.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`)
}
