import { Suspense } from "react";
import SetPasswordClient from "./SetPasswordClient";

export default function LeadgenSetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordClient />
    </Suspense>
  );
}
