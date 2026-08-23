import { redirect } from 'next/navigation';

import { Wordmark } from '@/components/wordmark';
import { LanguagePicker } from '@/components/language-picker';
import { getAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { AdminLoginForm } from './form';

/**
 * Вход в админку: телефон и PIN, затем код из SMS. Отдельная страница
 * без каркаса: у того, кто здесь, ещё нет права видеть разделы.
 */
export default async function AdminLoginPage() {
  await ensureDb();
  if (await getAdmin()) redirect('/admin');
  const a = await getAdminDict();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-12 items-center justify-between px-4">
        <Wordmark />
        <LanguagePicker compact />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">{a.login.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{a.login.lead}</p>
          <div className="mt-6">
            <AdminLoginForm />
          </div>
          <p className="mt-6 text-xs text-muted-foreground">{a.login.sessionNote}</p>
        </div>
      </main>
    </div>
  );
}
