import { cookies } from "next/headers";
import { Nav } from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read session context to pass environment to Nav (for Stage-only settings)
  const cookieStore = await cookies();
  const raw = cookieStore.get("session_ctx")?.value;
  let environment: string | undefined;
  try {
    if (raw) environment = JSON.parse(raw).environment;
  } catch {
    // ignore
  }

  return (
    <>
      <Nav environment={environment} />
      {children}
    </>
  );
}
