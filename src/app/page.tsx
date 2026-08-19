import { redirect } from "next/navigation";
import { getCurrentHost } from "@/lib/auth.ts";

export default async function RootPage() {
  const host = await getCurrentHost();
  redirect(host ? "/dashboard" : "/login");
}
