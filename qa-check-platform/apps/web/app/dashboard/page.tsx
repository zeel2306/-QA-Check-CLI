import { redirect } from "next/navigation";
import { getSessionUser } from "../lib/session";
import { dashboardPaths } from "../lib/roles";

export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const user = await getSessionUser();
  redirect(dashboardPaths[user.role]);
}
