import { redirect } from "next/navigation";

export default function AdminReservationPolicyPage() {
  redirect("/admin/capacity?view=policy");
}
