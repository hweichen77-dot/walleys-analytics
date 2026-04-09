import { useAuthStore } from '../store/authStore'

const SQUARE_OAUTH_URL = 'https://connect.squareup.com/oauth2/authorize'
const SQUARE_TOKEN_URL = 'https://connect.squareup.com/oauth2/token'
const SCOPES = 'MERCHANT_PROFILE_READ ORDERS_READ ITEMS_READ INVENTORY_READ'

const NATIVE_REDIRECT_URI = 'walleys://square/callback'

function isCapacitorNative(): boolean {
  return (window as any).Capacitor?.isNativePlatform?.() === true
}

function isTauri(): boolean {
  return (window as any).__TAURI_INTERNALS__ !== undefined
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return { verifier, challenge }
}

export function getRedirectURI(): string {
  if (isCapacitorNative() || isTauri()) return NATIVE_REDIRECT_URI
  // Use BASE_URL (Vite config) not pathname — pathname changes per page and would break OAuth
  const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}/square/callback`
}

export async function startOAuthFlow(appID: string): Promise<void> {
  const { verifier, challenge } = await generatePKCE()
  const state = crypto.randomUUID()
  sessionStorage.setItem('square_pkce_verifier', verifier)
  sessionStorage.setItem('square_oauth_state', state)

  const params = new URLSearchParams({
    client_id: appID,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: getRedirectURI(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  const url = `${SQUARE_OAUTH_URL}?${params}`

  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }

  if (isCapacitorNative()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
    return
  }

  window.location.href = url
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const verifier = sessionStorage.getItem('square_pkce_verifier') ?? ''
  const { appID, appSecret } = useAuthStore.getState()

  const res = await fetch(SQUARE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appID,
      client_secret: appSecret,
      code,
      redirect_uri: getRedirectURI(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    merchant_id: string
    expires_at: string
  }

  sessionStorage.removeItem('square_pkce_verifier')
  sessionStorage.removeItem('square_oauth_state')

  useAuthStore.getState().setCredentials({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    merchantID: data.merchant_id,
    tokenExpiresAt: new Date(data.expires_at).getTime(),
  })
}

export async function refreshAccessToken(): Promise<void> {
  const { appID, appSecret, refreshToken } = useAuthStore.getState()
  const res = await fetch(SQUARE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appID,
      client_secret: appSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_at: string
  }

  useAuthStore.getState().setCredentials({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: new Date(data.expires_at).getTime(),
  })
}
