import { describe, it, expect } from 'vitest';
import { evaluateDnsResults } from '../../scripts/lib/dnsCheck.mjs';

const IP = '187.53.128.67';

describe('evaluateDnsResults', () => {
  it('passes when every resolver returned the expected IP', () => {
    expect(evaluateDnsResults({ '1.1.1.1': [IP], '8.8.8.8': [IP] }, IP)).toBe(true);
  });

  it('fails when one resolver returned an error code string', () => {
    expect(evaluateDnsResults({ '1.1.1.1': [IP], '8.8.8.8': 'ENOTFOUND' }, IP)).toBe(false);
  });

  it('fails when one resolver returned only a different IP', () => {
    expect(evaluateDnsResults({ '1.1.1.1': [IP], '8.8.8.8': ['10.0.0.1'] }, IP)).toBe(false);
  });

  it('fails on an empty object (nothing resolved is not a pass)', () => {
    expect(evaluateDnsResults({}, IP)).toBe(false);
  });

  it('fails when a resolver returned an empty address list', () => {
    expect(evaluateDnsResults({ '1.1.1.1': [IP], '8.8.8.8': [] }, IP)).toBe(false);
  });

  it('fails when a resolver also returned another A record (ACME could validate against it)', () => {
    expect(evaluateDnsResults({ '1.1.1.1': [IP, '10.0.0.1'], '8.8.8.8': [IP] }, IP)).toBe(false);
  });

  it('fails on missing or malformed inputs', () => {
    expect(evaluateDnsResults(null, IP)).toBe(false);
    expect(evaluateDnsResults({ '1.1.1.1': [IP] }, '')).toBe(false);
    expect(evaluateDnsResults({ '1.1.1.1': [IP], '8.8.8.8': undefined }, IP)).toBe(false);
  });
});
