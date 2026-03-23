import { redirect } from "next/navigation";

function isSafeRedirect(path: string | undefined): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\"))
    return false;
  const pathWithoutQuery = path.split("?")[0];
  if (pathWithoutQuery.includes(":")) return false;
  return true;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.redirect;
  const redirectTo = Array.isArray(raw) ? raw[0] : raw;
  if (isSafeRedirect(redirectTo)) {
    redirect(`/register/phone?redirect=${encodeURIComponent(redirectTo)}`);
  }
  redirect("/register/phone");
}
