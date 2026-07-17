import { businessConfig } from "@/config/business";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500 sm:px-6">
        <p className="font-semibold text-slate-700">{businessConfig.name}</p>
        <p className="mt-1">Serving {businessConfig.serviceAreaSummary}</p>
        <p className="mt-4">
          &copy; {new Date().getFullYear()} {businessConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
