import { Suspense } from "react";
import SetPasswordClient from "./SetPasswordClient";

export default function SubcontractorSetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordClient />
    </Suspense>
  );
}
