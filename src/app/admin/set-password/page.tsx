import { Suspense } from "react";
import AdminSetPasswordClient from "./AdminSetPasswordClient";

export default function AdminSetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AdminSetPasswordClient />
    </Suspense>
  );
}
