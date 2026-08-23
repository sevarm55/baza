'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Banknote,
  Building2,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { adminSignOutAction } from '@/app/admin/actions';
import { PersonAvatar } from '@/components/patterns/person';
import { Wordmark } from '@/components/wordmark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useA } from '@/lib/i18n/admin/client';
import type { AdminRole } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';

export type AdminNavCounts = { attention: number; businesses: number };

/**
 * Каркас админки: та же колонка и полоса, что в кабинете, но плотнее и
 * без контекста филиала: админ управляет платформой целиком. Внизу
 * колонки кто вошёл и с какой ролью, в полосе название раздела и выход.
 */
export function AdminShell({
  who,
  role,
  counts,
  sidebarOpen,
  children,
}: {
  who: string;
  role: AdminRole;
  counts: AdminNavCounts;
  sidebarOpen: boolean;
  children: ReactNode;
}) {
  const a = useA();
  const pathname = usePathname();

  type Item = {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    exact?: boolean;
    count?: number;
    hot?: number;
  };
  const items: Item[] = [
    { href: '/admin', label: a.nav.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/admin/businesses', label: a.nav.businesses, icon: Building2, count: counts.businesses, hot: counts.attention },
    { href: '/admin/users', label: a.nav.users, icon: Users },
    { href: '/admin/subscriptions', label: a.nav.subscriptions, icon: CreditCard },
    { href: '/admin/payments', label: a.nav.payments, icon: Banknote },
    { href: '/admin/activity', label: a.nav.activity, icon: ScrollText },
    { href: '/admin/support', label: a.nav.support, icon: LifeBuoy },
    { href: '/admin/team', label: a.nav.team, icon: ShieldCheck },
  ];

  const current = items.find((it) => (it.exact ? pathname === it.href : pathname.startsWith(it.href)));

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="px-2 pt-3 pb-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <Link
                href="/admin"
                aria-label={a.brand}
                className="flex h-8 items-center gap-2 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              >
                <span aria-hidden className="hidden font-wordmark text-sm text-primary group-data-[collapsible=icon]:inline">
                  T
                </span>
                <Wordmark className="group-data-[collapsible=icon]:hidden" />
                <Badge variant="lime" className="group-data-[collapsible=icon]:hidden">
                  {a.title}
                </Badge>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="px-1 pt-1">
          <SidebarGroup className="py-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {items.map((it) => {
                  const on = it.exact ? pathname === it.href : pathname.startsWith(it.href);
                  const Icon = it.icon;
                  const count = it.count;
                  const hot = it.hot ?? 0;
                  return (
                    <SidebarMenuItem key={it.href}>
                      <SidebarMenuButton
                        render={<Link href={it.href} aria-current={on ? 'page' : undefined} />}
                        isActive={on}
                        tooltip={it.label}
                        className={cn(
                          'h-8 gap-2.5 px-2 text-[13px] font-medium text-sidebar-foreground',
                          '[&>svg]:size-4 [&>svg]:text-muted-foreground',
                          'data-active:bg-primary-soft data-active:text-primary-soft-foreground data-active:hover:bg-primary-soft data-active:[&>svg]:text-primary',
                        )}
                      >
                        <Icon aria-hidden />
                        <span className="flex-1 truncate">{it.label}</span>
                        {hot > 0 ? (
                          <Badge variant="warning" className="num">
                            {hot}
                          </Badge>
                        ) : (
                          count !== undefined &&
                          count > 0 && (
                            <span className="num text-xs text-muted-foreground/80">{count}</span>
                          )
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-2 pb-3">
          <SidebarSeparator className="mx-1" />
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                <PersonAvatar name={who} size="lg" className="size-8 rounded-md text-xs" />
                <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-semibold">{who}</span>
                  <span className="truncate text-xs text-muted-foreground">{a.roles[role]}</span>
                </span>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail className="outline-none" />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-4">
          <SidebarTrigger className="-ml-1" aria-label={a.nav.expand} />
          <Separator orientation="vertical" className="mx-1 hidden h-4! md:block" />
          <nav className="flex min-w-0 items-center gap-1 text-sm">
            <span className="text-muted-foreground">{a.title}</span>
            {current && (
              <>
                <span className="text-muted-foreground/60" aria-hidden>
                  /
                </span>
                <span className="truncate font-medium" aria-current="page">
                  {current.label}
                </span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <form action={adminSignOutAction}>
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut data-icon="inline-start" aria-hidden />
                {a.nav.signOut}
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 md:px-6">
          <div className="flex flex-col gap-5">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
