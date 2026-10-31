// All UI copy lives here. UK English, warm and direct, no em-dashes.
// Dutch and Italian will be added as sibling objects with the same keys.

const en = {
  appName: 'Guidocasa',
  signIn: {
    title: 'Plan your house-hunting trip',
    intro: 'Enter your email and we will send you a link to sign in. No password needed.',
    emailLabel: 'Email address',
    submit: 'Send me a link',
    sending: 'Sending…',
    sent: 'Check your inbox. We have sent a sign-in link to {email}.',
    error: 'Something went wrong sending your link. Please try again.',
  },
  trips: {
    title: 'My trips',
    empty: 'No trips yet. Once you create one, it will appear here.',
  },
  nav: {
    signOut: 'Sign out',
  },
  common: {
    loading: 'Loading…',
  },
}

export type Messages = typeof en

export const messages: Record<string, Messages> = { en }
