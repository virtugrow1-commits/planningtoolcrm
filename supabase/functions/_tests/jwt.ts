// HS256 JWT helper for the e2e tests (anon / service_role / user tokens). WebCrypto only.
export const JWT_SECRET = 'e2e-test-secret-that-is-at-least-32-chars-long';

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function makeJwt(claims: Record<string, unknown>): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: 'supabase', iat, exp: iat + 7200, ...claims }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

if (import.meta.main) {
  const [kind, sub] = Deno.args;
  console.log(await makeJwt(kind === 'user' ? { role: 'authenticated', sub, aud: 'authenticated' } : { role: kind }));
}
