export interface ApiKeyStatus {
  hasKey: boolean;
  createdAt?: string;
}

// The raw key is only ever returned from this one response — see the
// comment on useGenerateApiKey.
export interface GeneratedApiKey {
  apiKey: string;
  createdAt: string;
}
