import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/services/effective-user';
import { PageHeader } from '@/components/admin/kit';
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
    <div>
      <PageHeader title="On-behalf orders" subtitle="Orders placed by admins for customers. Read-only." />
      <OnBehalfOrdersClient />
    </div>
  );
}
