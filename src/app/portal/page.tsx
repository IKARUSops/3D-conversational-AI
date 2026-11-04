import { redirect } from "next/navigation";

/** FR-D1: /portal goes to the calls list (the (app) layout sends anonymous users to login). */
export default function PortalIndex() {
  redirect("/portal/calls");
}
