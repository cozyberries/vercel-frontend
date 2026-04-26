// lib/analytics/meta-pixel.ts

declare global {
  interface Window {
    fbq: (action: string, event: string, params?: Record<string, unknown>, options?: { eventID?: string }) => void;
    _fbq: unknown;
  }
}

function isLoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

export function trackPageView(): void {
  if (!isLoaded()) return;
  window.fbq('track', 'PageView');
}

export function trackViewContent(params: { id: string; name: string; price: number }): void {
  if (!isLoaded()) return;
  window.fbq('track', 'ViewContent', {
    content_ids: [params.id],
    content_type: 'product',
    content_name: params.name,
    value: params.price,
    currency: 'INR',
  });
}

/** Returns the generated eventId for server-side deduplication. */
export function trackAddToCart(params: { id: string; name: string; price: number }): string {
  const eventId = crypto.randomUUID();
  if (!isLoaded()) return eventId;
  window.fbq('track', 'AddToCart', {
    content_ids: [params.id],
    content_type: 'product',
    content_name: params.name,
    value: params.price,
    currency: 'INR',
  }, { eventID: eventId });
  return eventId;
}

/** Returns the generated eventId for server-side deduplication. */
export function trackInitiateCheckout(params: { numItems: number; total: number }): string {
  const eventId = crypto.randomUUID();
  if (!isLoaded()) return eventId;
  window.fbq('track', 'InitiateCheckout', {
    num_items: params.numItems,
    value: params.total,
    currency: 'INR',
  }, { eventID: eventId });
  return eventId;
}

/** eventId must come from the server confirm response for deduplication. */
export function trackPurchase(params: { orderId: string; total: number; itemIds: string[] }, eventId: string): void {
  if (!isLoaded()) return;
  window.fbq('track', 'Purchase', {
    value: params.total,
    currency: 'INR',
    content_ids: params.itemIds,
    content_type: 'product',
    order_id: params.orderId,
  }, { eventID: eventId });
}

export function trackSearch(params: { query: string }): void {
  if (!isLoaded()) return;
  window.fbq('track', 'Search', {
    search_string: params.query,
  });
}
