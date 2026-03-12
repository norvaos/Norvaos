/**
 * Shared types for OAuth platform integrations.
 */

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  token_type?: string
}

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  authUrl: string
  tokenUrl: string
  scopes: string[]
}

export type ConnectionPlatform = 'ghl' | 'clio'
