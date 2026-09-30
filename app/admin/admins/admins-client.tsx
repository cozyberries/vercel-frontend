"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/supabase-auth-provider";
import { ListCard, ActionSheet, EmptyState, LoadingList, ErrorBanner } from "@/components/admin/kit";
import type { AdminAccount } from "@/lib/admin/admin-accounts";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error || "Request failed", res.status);
  return body as T;
}

type SearchUser = { id: string; email: string | null; phone: string | null; full_name: string | null };
const KEY = ["admin", "admins"] as const;

export default function AdminsClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminAccount | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);

  const list = useQuery<{ admins: AdminAccount[] }, ApiError>({ queryKey: KEY, queryFn: () => api("/api/admin/admins") });
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Request failed");

  const promote = useMutation({
    mutationFn: (userId: string) =>
      api<{ admin: AdminAccount }>("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      }),
    onSuccess: (d) => {
      toast.success(`${d.admin.email ?? "User"} is now an admin. They will see Admin after signing in again.`);
      setAdding(false);
      setQ("");
      setResults([]);
      invalidate();
    },
    onError,
  });
  const demote = useMutation({
    mutationFn: (id: string) => api(`/api/admin/admins/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Admin removed");
      setRemoving(null);
      invalidate();
    },
    onError,
  });

  useEffect(() => {
    if (!adding || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const body = await api<{ users: SearchUser[] }>(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}&limit=10`, { signal: ctrl.signal });
        setResults(body.users);
      } catch (e) {
        if ((e as Error).name !== "AbortError") onError(e);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [adding, q]);

  const admins = list.data?.admins ?? [];
  const adminIds = new Set(admins.map((a) => a.id));
  const authError = list.error && (list.error.status === 401 || list.error.status === 403);

  return (
    <div className="space-y-3">
      <Button className="w-full rounded-full" onClick={() => setAdding(true)}>
        <UserPlus className="mr-2 h-4 w-4" aria-hidden />
        Add admin
      </Button>

      {list.isError && (
        <ErrorBanner
          message={list.error.message}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
          loginRedirect={authError ? "/admin/admins" : undefined}
        />
      )}
      {list.isPending && <LoadingList label="Loading admins" />}
      {!list.isPending && admins.length === 0 && !list.isError && <EmptyState title="No admins yet" />}

      <ul className="space-y-3">
        {admins.map((a) => (
          <ListCard
            key={a.id}
            testId={`admin-${a.id}`}
            title={
              <span className="flex items-center gap-2">
                {a.full_name || a.email || a.id}
                <span className="inline-flex items-center gap-1 rounded-full bg-cb-linen px-2 py-0.5 text-xs font-semibold text-cb-fg">
                  {a.role === "super_admin" && <ShieldCheck className="h-3 w-3" aria-hidden />}
                  {a.role === "super_admin" ? "Super admin" : "Admin"}
                </span>
              </span>
            }
            meta={
              <>
                <span>{a.email ?? "no email"}</span>
                {` · ${a.phone ? `+91 ${a.phone.slice(-10)}` : "no phone"} · since ${new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`}
              </>
            }
            actions={
              a.role === "admin" && a.id !== user?.id ? (
                <Button variant="outline" className="rounded-full" onClick={() => setRemoving(a)}>
                  Remove admin
                </Button>
              ) : undefined
            }
          />
        ))}
      </ul>

      <ActionSheet open={adding} onOpenChange={setAdding} title="Add admin" description="Find the person by email, phone or name.">
        <Input autoFocus placeholder="Email, phone, or name" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-xl" />
        <ul className="mt-3 space-y-2">
          {results.map((u) => (
            <ListCard
              key={u.id}
              title={u.full_name || u.email || u.id}
              meta={
                <>
                  <span>{u.email ?? "no email"}</span>
                  {` · ${u.phone ? `+91 ${u.phone.slice(-10)}` : "no phone"}`}
                </>
              }
              actions={
                adminIds.has(u.id) ? (
                  <span className="text-center text-sm text-cb-muted-fg">Already an admin</span>
                ) : (
                  <Button className="rounded-full" disabled={promote.isPending} onClick={() => promote.mutate(u.id)}>
                    Make admin
                  </Button>
                )
              }
            />
          ))}
        </ul>
        {q.trim().length >= 2 && results.length === 0 && <p className="mt-3 text-sm text-cb-muted-fg">No matches.</p>}
      </ActionSheet>

      <ActionSheet
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove ${removing.full_name ?? removing.email ?? "this admin"}?` : ""}
        description="They keep their account and orders, and lose access to this section at once."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="rounded-full sm:flex-1" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="rounded-full sm:flex-1"
            disabled={demote.isPending}
            onClick={() => removing && demote.mutate(removing.id)}
          >
            Remove
          </Button>
        </div>
      </ActionSheet>
    </div>
  );
}
