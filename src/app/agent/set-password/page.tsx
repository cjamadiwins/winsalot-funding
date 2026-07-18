import { Suspense } from "react";
import SetPasswordClient from "./SetPasswordClient";

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordClient />
    </Suspense>
  );
}
