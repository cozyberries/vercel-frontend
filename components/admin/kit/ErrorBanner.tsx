import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorBanner({
  message,
  onRetry,
  retrying = false,
  loginRedirect,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  loginRedirect?: string;
}) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
      {loginRedirect ? (
        <Button asChild size="sm" variant="outline" className="self-start rounded-full">
          <a href={`/login?redirect=${encodeURIComponent(loginRedirect)}`}>Log in again</a>
        </Button>
      ) : (
        onRetry && (
          <Button size="sm" variant="outline" className="self-start rounded-full" onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Retrying…
              </>
            ) : (
              "Retry"
            )}
          </Button>
        )
      )}
    </div>
  );
}
