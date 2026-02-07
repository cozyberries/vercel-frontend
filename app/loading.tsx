export default function Loading() {
  return (
    <div aria-busy="true" role="status">
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <span className="sr-only">Loading…</span>
        <div
          className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
