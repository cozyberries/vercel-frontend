import { beforeEach, describe, expect, it, vi } from 'vitest';

import { wishlistService } from './wishlist';
import type { WishlistItem } from '@/components/wishlist-context';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function makeItem(id: string): WishlistItem {
  return {
    id,
    name: `Product ${id}`,
    price: 100,
  } as WishlistItem;
}

describe('wishlistService.getUserWishlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns items when fetch succeeds', async () => {
    const items = [makeItem('w1')];
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ wishlist: items, user_id: 'u1' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await wishlistService.getUserWishlist('u1');
    expect(result).toEqual(items);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/wishlist',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('returns [] on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Unauthorized' }, { status: 401 })
      )
    );
    const result = await wishlistService.getUserWishlist('u-401');
    expect(result).toEqual([]);
  });

  it('returns [] when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await wishlistService.getUserWishlist('u-network');
    expect(result).toEqual([]);
  });

  it('dedups concurrent in-flight requests', async () => {
    let resolveFn: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFn = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    const p1 = wishlistService.getUserWishlist('u-dedup');
    const p2 = wishlistService.getUserWishlist('u-dedup');

    resolveFn(jsonResponse({ wishlist: [makeItem('w1')] }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('wishlistService.saveUserWishlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs { items } and does not include userId in body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, wishlist: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await wishlistService.saveUserWishlist('u1', [makeItem('w1')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/wishlist');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ items: [makeItem('w1')] });
    expect(body.user_id).toBeUndefined();
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Failed to save wishlist' }, { status: 500 })
      )
    );
    await expect(
      wishlistService.saveUserWishlist('u1', [makeItem('w1')])
    ).rejects.toThrow(/Failed to save wishlist/);
  });
});

describe('wishlistService.clearUserWishlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs /api/wishlist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await wishlistService.clearUserWishlist('u1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/wishlist',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    );
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Failed to clear wishlist' }, { status: 500 })
      )
    );
    await expect(wishlistService.clearUserWishlist('u1')).rejects.toThrow(
      /Failed to clear wishlist/
    );
  });
});

describe('wishlistService.mergeWishlistItems', () => {
  it('deduplicates by id and keeps remote on conflicts', () => {
    const local: WishlistItem[] = [
      { ...makeItem('w1'), name: 'local-name' } as WishlistItem,
    ];
    const remote: WishlistItem[] = [
      { ...makeItem('w1'), name: 'remote-name' } as WishlistItem,
      makeItem('w2'),
    ];
    const merged = wishlistService.mergeWishlistItems(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find((i) => i.id === 'w1')?.name).toBe('remote-name');
  });

  it('includes local-only items', () => {
    const merged = wishlistService.mergeWishlistItems(
      [makeItem('local-only')],
      [makeItem('remote-only')]
    );
    expect(merged.map((i) => i.id).sort()).toEqual([
      'local-only',
      'remote-only',
    ]);
  });
});
