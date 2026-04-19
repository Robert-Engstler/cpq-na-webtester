"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { C } from "@/lib/design";
import { AppSettingsModal } from "@/components/AppSettingsModal";

const links = [
  { href: "/scenarios", label: "Scenarios" },
  { href: "/runs",      label: "Runs" },
  { href: "/analysis",  label: "Analysis" },
];

export function Nav({ environment }: { environment?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav
      className="flex items-center gap-6 px-6 py-3"
      style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <span className="font-semibold" style={{ color: C.primary }}>
        CPQ NA Webtester
      </span>
      <div className="flex flex-1 items-center gap-4">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-sm font-medium transition-colors"
            style={{
              color: pathname.startsWith(href) ? C.accent : C.secondary,
            }}
          >
            {label}
          </Link>
        ))}
        <AppSettingsModal environment={environment} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleLogout}
          className="text-sm"
          style={{ color: C.muted }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
