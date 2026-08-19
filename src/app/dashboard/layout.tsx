import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentHost } from "@/lib/auth.ts";
import LogoutButton from "./LogoutButton.tsx";

// Every page under /dashboard is host-scoped (spec: Access Restricted to Own
// Properties) — this is the one place that gate is enforced for pages; API
// routes enforce it independently for data access (6.5).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const host = await getCurrentHost();
  if (!host) redirect("/login");

  return (
    <div>
      <nav>
        <Link href="/dashboard">Bookings</Link>
        <Link href="/dashboard/conversations">Conversations</Link>
        <Link href="/dashboard/rules">Rules</Link>
        <span className="spacer" />
        <span className="host-name">{host.name}</span>
        <LogoutButton />
      </nav>
      <main>{children}</main>
    </div>
  );
}
