import { describe, it, expect } from 'vitest';
import { buildSelectableServerOptions } from './selectableServers';

describe('buildSelectableServerOptions', () => {
  it('returns empty array when servers parameter is empty', () => {
    expect(buildSelectableServerOptions([])).toEqual([]);
  });

  it('filters to active servers when active servers are present', () => {
    const servers = [
      { id: 'srv-1', name: 'Primary Server', isActive: true, url: 'http://srv1:8096', jellyfinServerId: 'jf-1' },
      { id: 'srv-2', name: 'Secondary Server', isActive: true, url: 'http://srv2:8096', jellyfinServerId: 'jf-2' },
      { id: 'srv-3', name: 'Disabled Server', isActive: false, url: 'http://srv3:8096', jellyfinServerId: 'jf-3' },
    ];

    const result = buildSelectableServerOptions(servers);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: 'srv-1', name: 'Primary Server' },
      { id: 'srv-2', name: 'Secondary Server' },
    ]);
  });

  it('uses all servers if none are marked active', () => {
    const servers = [
      { id: 'srv-1', name: 'Server A', isActive: false, url: 'http://srv1:8096', jellyfinServerId: 'jf-1' },
      { id: 'srv-2', name: 'Server B', isActive: false, url: 'http://srv2:8096', jellyfinServerId: 'jf-2' },
    ];

    const result = buildSelectableServerOptions(servers);
    expect(result).toHaveLength(2);
  });
});
