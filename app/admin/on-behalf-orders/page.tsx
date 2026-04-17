import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/services/effective-user';
import OnBehalfOrdersClient from './on-behalf-orders-client';

export const metadata: Metadata = {
  title: 'On-behalf orders',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OnBehalfOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/admin/on-behalf-orders');
  }

  if (!isAdmin(user as unknown as SupabaseUser)) {
    // Non-admins should not learn this page exists.
    redirect('/');
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-light tracking-tight">
          On-behalf orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders placed by admins on behalf of customers. Read-only.
        </p>
      </div>
      <OnBehalfOrdersClient />
    </div>
  );
}
