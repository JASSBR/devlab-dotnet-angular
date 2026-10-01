import { describe, expect, it } from 'vitest';
import { decodeJwt } from './auth.store';

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');

describe('decodeJwt', () => {
  it('decodes the payload and shortens Microsoft claim URIs', () => {
    const token = `${b64({ alg: 'HS256' })}.${b64({
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': 'alice',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': ['Admin', 'User'],
      exp: 1800000000, iat: 1700000000,
    })}.sig`;

    const payload = decodeJwt(token)!;
    expect(payload.name).toBe('alice');
    expect(payload.role).toEqual(['Admin', 'User']);
    expect(payload.exp).toBe(1800000000);
  });

  it('returns null for garbage', () => {
    expect(decodeJwt(null)).toBeNull();
    expect(decodeJwt('not.a.jwt')).toBeNull();
  });
});
