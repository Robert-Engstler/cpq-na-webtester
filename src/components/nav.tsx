"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { C, mono } from "@/lib/design";
import { AppSettingsModal } from "@/components/AppSettingsModal";

const links = [
  { href: "/scenarios", label: "Scenarios" },
  { href: "/runs",      label: "Runs" },
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
      className="flex items-center px-5"
      style={{
        height: 48,
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <span className="font-bold text-sm mr-8" style={{ color: C.primary, fontFamily: mono, letterSpacing: "-0.01em" }}>
        CPQ NA Webtester
      </span>
      <div className="flex flex-1 items-center h-full gap-1">
        {links.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center h-full px-3 text-sm font-medium transition-colors"
              style={{
                color: active ? C.accent : C.secondary,
                borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {label}
            </Link>
          );
        })}
        <AppSettingsModal environment={environment} />
      </div>
      <button
        onClick={handleLogout}
        className="text-sm"
        style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; }}
      >
        Logout
      </button>
    </nav>
  );
}
