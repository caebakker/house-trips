// Disabled by default. This function does not call Resend or any other provider.
// Rows wait in public.notification_outbox until you follow the Email section in the README.
//
// Switch on later:
// 1. Create a Resend API key and a from-address on your domain.
// 2. Set secrets EMAIL_ENABLED=true, RESEND_API_KEY, and EMAIL_FROM.
// 3. Replace the 501 branch with a service-role read of pending rows and a Resend send.
// 4. Mark each row sent. Never put coordinates, admin notes, or property ids in the email.
// 5. Invoke this function on a schedule, or from a database webhook on insert.
// Keep verify_jwt true, or call it only with the service role.

const headers = { 'content-type': 'application/json' }

Deno.serve(() => {
  const enabled = Deno.env.get('EMAIL_ENABLED') === 'true'
  if (!enabled) {
    return new Response(
      JSON.stringify({
        ok: true,
        disabled: true,
        detail: 'EMAIL_ENABLED is not true. No email is sent. Rows stay in notification_outbox.',
      }),
      { headers },
    )
  }

  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Email is switched on but no provider is wired. Read the README before sending anything.',
    }),
    { status: 501, headers },
  )
})
