import { describe, it, expect } from 'vitest';
import {
  parseServerScopeParam,
  serializeServerScope,
  resolveSelectedServerIds,
} from './serverScope';

describe('serverScope utilities', () => {
  describe('parseServerScopeParam', () => {
    it('returns empty array when parameter is null or undefined or empty', () => {
      expect(parseServerScopeParam(null)).toEqual([]);
      expect(parseServerScopeParam(undefined)).toEqual([]);
      expect(parseServerScopeParam('')).toEqual([]);
      expect(parseServerScopeParam('   ')).toEqual([]);
    });

    it('parses comma-separated values and trims whitespace', () => {
      expect(parseServerScopeParam('srv-1, srv-2 ,srv-3')).toEqual(['srv-1', 'srv-2', 'srv-3']);
    });

    it('deduplicates server IDs', () => {
      expect(parseServerScopeParam('srv-1, srv-2, srv-1')).toEqual(['srv-1', 'srv-2']);
    });
  });

  describe('serializeServerScope', () => {
    it('serializes array of IDs into clean comma-separated string', () => {
      expect(serializeServerScope(['srv-1', 'srv-2'])).toBe('srv-1,srv-2');
    });
  });

  describe('resolveSelectedServerIds', () => {
    const available = ['srv-1', 'srv-2', 'srv-3'];

    it('returns empty array and source none when multi-server mode is disabled', () => {
      const result = resolveSelectedServerIds({
        multiServerEnabled: false,
        selectableServerIds: available,
        requestedServersParam: 'srv-1',
      });
      expect(result.selectedServerIds).toEqual([]);
      expect(result.source).toBe('none');
    });

    it('uses requested URL parameter when multi-server is enabled', () => {
      const result = resolveSelectedServerIds({
        multiServerEnabled: true,
        selectableServerIds: available,
        requestedServersParam: 'srv-1,srv-2',
      });
      expect(result.selectedServerIds).toEqual(['srv-1', 'srv-2']);
      expect(result.source).toBe('query');
    });

    it('filters requested servers against selectableServerIds', () => {
      const result = resolveSelectedServerIds({
        multiServerEnabled: true,
        selectableServerIds: available,
        requestedServersParam: 'srv-1,invalid-id',
      });
      expect(result.selectedServerIds).toEqual(['srv-1']);
    });

    it('falls back to cookie selection if URL parameter is absent', () => {
      const result = resolveSelectedServerIds({
        multiServerEnabled: true,
        selectableServerIds: available,
        cookieServersParam: 'srv-3',
      });
      expect(result.selectedServerIds).toEqual(['srv-3']);
      expect(result.source).toBe('cookie');
    });
  });
});
