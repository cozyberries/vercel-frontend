import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cartService } from './cart';
import type { CartItem } from '@/components/cart-context';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function makeItem(id: string, quantity = 1): CartItem {
  return {
    id,
    name: `Product ${id}`,
    price: 100,
    quantity,
  } as CartItem;
}

describe('cartService.getUserCart', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns items when fetch succeeds', async () => {
    const items = [makeItem('p1', 2)];
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ cart: items, user_id: 'u1' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await cartService.getUserCart('u1');
    expect(result).toEqual(items);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cart',
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
    const result = await cartService.getUserCart('u-401');
    expect(result).toEqual([]);
  });

  it('returns [] when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const result = await cartService.getUserCart('u-network');
    expect(result).toEqual([]);
  });

  it('dedups concurrent in-flight requests', async () => {
    let resolveFn: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveFn = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    const p1 = cartService.getUserCart('u-dedup');
    const p2 = cartService.getUserCart('u-dedup');

    resolveFn(jsonResponse({ cart: [makeItem('p1')] }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('cartService.saveUserCart', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs { items } and does not include userId in body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, cart: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await cartService.saveUserCart('u1', [makeItem('p1')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/cart');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ items: [makeItem('p1')] });
    expect(body.user_id).toBeUndefined();
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Failed to save cart' }, { status: 500 })
      )
    );

    await expect(
      cartService.saveUserCart('u1', [makeItem('p1')])
    ).rejects.toThrow(/Failed to save cart/);
  });
});

describe('cartService.clearUserCart', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('DELETEs /api/cart', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await cartService.clearUserCart('u1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cart',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' })
    );
  });

  it('throws on non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Failed to clear cart' }, { status: 500 })
      )
    );
    await expect(cartService.clearUserCart('u1')).rejects.toThrow(
      /Failed to clear cart/
    );
  });
});

describe('cartService.mergeCartItems', () => {
  it('returns remote items when carts are identical (refresh)', () => {
    const items = [makeItem('p1', 2), makeItem('p2', 1)];
    const merged = cartService.mergeCartItems(items, items);
    expect(merged).toHaveLength(2);
    const p1 = merged.find((i) => i.id === 'p1');
    expect(p1?.quantity).toBe(2);
  });

  it('adds quantities on a true cross-device merge', () => {
    const local = [makeItem('p1', 1)];
    const remote = [makeItem('p1', 3), makeItem('p2', 1)];
    const merged = cartService.mergeCartItems(local, remote);
    const p1 = merged.find((i) => i.id === 'p1');
    expect(p1?.quantity).toBe(4);
    expect(merged.find((i) => i.id === 'p2')?.quantity).toBe(1);
  });

  it('keeps local-only items', () => {
    const local = [makeItem('p-local', 1)];
    const remote = [makeItem('p-remote', 1)];
    const merged = cartService.mergeCartItems(local, remote);
    expect(merged.map((i) => i.id).sort()).toEqual(['p-local', 'p-remote']);
  });
});
