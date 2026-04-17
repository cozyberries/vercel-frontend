"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import IndianPhoneInput from "@/components/IndianPhoneInput";
import { useAuth } from "@/components/supabase-auth-provider";
import {
  validateEmail,
  validateFullName,
} from "@/lib/utils/validation";

interface UserPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SearchResult = {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  created_at: string;
};

type Tab = "search" | "create";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function UserPickerModal({
  open,
  onOpenChange,
}: UserPickerModalProps) {
  const { refreshImpersonation } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("search");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createErrors, setCreateErrors] = useState<{
    email?: string;
    phone?: string;
    full_name?: string;
    form?: string;
  }>({});
  const [creating, setCreating] = useState(false);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const createEmailRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetAll = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearching(false);
    setSearchError(null);
    setCreateEmail("");
    setCreatePhone("");
    setCreateFullName("");
    setCreateErrors({});
    setCreating(false);
    setStarting(false);
    setStartError(null);
    setActiveTab("search");
  }, []);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      resetAll();
    }
  }, [open, resetAll]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (activeTab === "search") {
        searchInputRef.current?.focus();
      } else {
        createEmailRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [open, activeTab]);

  useEffect(() => {
    if (!open || activeTab !== "search") return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(
          `/api/admin/users/search?q=${encodeURIComponent(trimmed)}&limit=10`,
          { signal: controller.signal, credentials: "same-origin" }
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            typeof errBody?.error === "string"
              ? errBody.error
              : `Search failed (${res.status})`
          );
        }
        const data = (await res.json()) as { users?: SearchResult[] };
        setResults(Array.isArray(data.users) ? data.users : []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
        setSearchError(
          err instanceof Error ? err.message : "Search failed"
        );
      } finally {
        if (abortRef.current === controller) {
          setSearching(false);
          abortRef.current = null;
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, open, activeTab]);

  const startImpersonation = useCallback(
    async (userId: string) => {
      setStarting(true);
      setStartError(null);
      try {
        const res = await fetch("/api/admin/impersonation/start", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_user_id: userId }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            typeof errBody?.error === "string"
              ? errBody.error
              : `Failed to start impersonation (${res.status})`
          );
        }
        await refreshImpersonation();
        onOpenChange(false);
        window.location.href = "/";
      } catch (err) {
        setStartError(
          err instanceof Error ? err.message : "Failed to start impersonation"
        );
      } finally {
        setStarting(false);
      }
    },
    [onOpenChange, refreshImpersonation]
  );

  const handleCreate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextErrors: typeof createErrors = {};

      const emailCheck = validateEmail(createEmail);
      if (!emailCheck.isValid) nextErrors.email = emailCheck.error;

      if (createPhone.length !== 10) {
        nextErrors.phone = "Phone number must be 10 digits";
      } else if (!/^[6-9]/.test(createPhone)) {
        nextErrors.phone = "Indian mobile must start with 6, 7, 8, or 9";
      }

      const trimmedName = createFullName.trim();
      if (!trimmedName) {
        nextErrors.full_name = "Full name is required";
      } else if (trimmedName.length > 120) {
        nextErrors.full_name = "Full name must be 120 characters or fewer";
      } else {
        const nameCheck = validateFullName(trimmedName);
        if (!nameCheck.isValid) nextErrors.full_name = nameCheck.error;
      }

      setCreateErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;

      setCreating(true);
      try {
        const res = await fetch("/api/admin/users/create", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: createEmail.trim(),
            phone: createPhone,
            full_name: trimmedName,
          }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 409) {
          setActiveTab("search");
          setQuery(createEmail.trim());
          setCreateErrors({
            form:
              typeof body?.error === "string"
                ? `${body.error}. Switched to search.`
                : "User already exists. Switched to search.",
          });
          return;
        }

        if (!res.ok || !body?.user?.id) {
          setCreateErrors({
            form:
              typeof body?.error === "string"
                ? body.error
                : `Failed to create user (${res.status})`,
          });
          return;
        }

        await startImpersonation(body.user.id as string);
      } catch (err) {
        setCreateErrors({
          form:
            err instanceof Error ? err.message : "Failed to create user",
        });
      } finally {
        setCreating(false);
      }
    },
    [createEmail, createFullName, createPhone, startImpersonation]
  );

  const busy = starting || creating;

  const searchEmpty = useMemo(() => {
    return (
      !searching &&
      !searchError &&
      query.trim().length >= MIN_QUERY_LENGTH &&
      results.length === 0
    );
  }, [query, results.length, searchError, searching]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Place order on behalf</DialogTitle>
          <DialogDescription>
            Find an existing user or create a new one, then continue in their
            session.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as Tab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Find user</TabsTrigger>
            <TabsTrigger value="create">Create new user</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="user-search-input">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-search-input"
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Email, phone, or name (min 2 chars)"
                  autoComplete="off"
                  className="pl-9"
                  disabled={busy}
                />
              </div>
            </div>

            {searchError && (
              <div
                role="alert"
                className="flex items-start gap-2 text-sm text-red-600"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {searching ? (
                <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching…
                </div>
              ) : searchEmpty ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No users found
                </div>
              ) : query.trim().length < MIN_QUERY_LENGTH ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Start typing to search.
                </div>
              ) : (
                results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => startImpersonation(u.id)}
                    disabled={busy}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 focus:bg-muted/60 focus:outline-none disabled:opacity-50"
                  >
                    <div className="text-sm font-medium text-foreground">
                      {u.full_name || "Unnamed user"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {u.email ?? "no email"}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </div>
                  </button>
                ))
              )}
            </div>

            {startError && (
              <div
                role="alert"
                className="flex items-start gap-2 text-sm text-red-600"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{startError}</span>
              </div>
            )}
            {starting && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting session…
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="space-y-3">
            <form onSubmit={handleCreate} className="space-y-3" noValidate>
              <div className="space-y-1">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  ref={createEmailRef}
                  type="email"
                  autoComplete="off"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  disabled={busy}
                  aria-invalid={Boolean(createErrors.email) || undefined}
                  placeholder="customer@example.com"
                />
                {createErrors.email && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {createErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-phone">Phone</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sm text-muted-foreground">
                    +91
                  </div>
                  <IndianPhoneInput
                    id="create-phone"
                    value={createPhone}
                    onChange={(digits) => setCreatePhone(digits)}
                    placeholder="98765 43210"
                    disabled={busy}
                    aria-invalid={Boolean(createErrors.phone) || undefined}
                    className="pl-12"
                  />
                </div>
                {createErrors.phone && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {createErrors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="create-name">Full name</Label>
                <Input
                  id="create-name"
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  aria-invalid={Boolean(createErrors.full_name) || undefined}
                  placeholder="Jane Doe"
                  maxLength={120}
                />
                {createErrors.full_name && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {createErrors.full_name}
                  </p>
                )}
              </div>

              {createErrors.form && (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-sm text-red-600"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{createErrors.form}</span>
                </div>
              )}

              {startError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-sm text-red-600"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{startError}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : starting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting session…
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create & continue
                  </>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
