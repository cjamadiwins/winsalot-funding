"use client";

import { useState } from "react";
import { regionsForCountry, citiesForRegion, type LocationCountry, type SavedLocation } from "@/lib/timezone-locations";
import SearchableSelect from "./SearchableSelect";

type LocationDraft = { country: LocationCountry; regionCode: string | null; city: string | null };

function toDraft(location: SavedLocation): LocationDraft {
  return { country: location.country, regionCode: location.regionCode, city: location.city };
}

function LocationEditor({
  title,
  draft,
  onChange,
}: {
  title: string;
  draft: LocationDraft;
  onChange: (next: LocationDraft) => void;
}) {
  const regionOptions = regionsForCountry(draft.country).map((r) => ({ value: r.code, label: r.name }));
  const cityOptions = draft.regionCode ? citiesForRegion(draft.country, draft.regionCode).map((c) => ({ value: c.city, label: c.city })) : [];

  return (
    <div className="rounded-xl border border-[var(--crm-border,#dce4ec)] bg-[var(--crm-bg-2,#eaf0f6)] p-4">
      <p className="mb-3 text-[13.5px] font-bold text-[var(--crm-text,#17283b)]">{title}</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--crm-text-soft,#4b5c71)]">Country</span>
          <div className="flex gap-2">
            {(["CA", "US"] as const).map((country) => (
              <button
                key={country}
                type="button"
                onClick={() => onChange({ country, regionCode: null, city: null })}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13.5px] font-semibold transition ${
                  draft.country === country
                    ? "border-[var(--crm-accent,#3e7ef7)] bg-[var(--crm-accent,#3e7ef7)] text-white"
                    : "border-[var(--crm-border,#dce4ec)] bg-[var(--crm-surface,#ffffff)] text-[var(--crm-text,#17283b)]"
                }`}
              >
                {country === "CA" ? "Canada" : "United States"}
              </button>
            ))}
          </div>
        </div>

        <SearchableSelect
          label={draft.country === "CA" ? "Province / Territory" : "State"}
          options={regionOptions}
          value={draft.regionCode}
          onChange={(regionCode) => onChange({ ...draft, regionCode, city: null })}
          placeholder="Search…"
        />

        <SearchableSelect
          label="Major City"
          options={cityOptions}
          value={draft.city}
          onChange={(city) => onChange({ ...draft, city })}
          placeholder="Search…"
          disabled={!draft.regionCode}
        />
      </div>
    </div>
  );
}

export default function EditLocationsModal({
  location1,
  location2,
  onClose,
  onSave,
}: {
  location1: SavedLocation;
  location2: SavedLocation;
  onClose: () => void;
  onSave: (
    location1: { country: LocationCountry; regionCode: string; city: string },
    location2: { country: LocationCountry; regionCode: string; city: string }
  ) => Promise<{ error?: string }>;
}) {
  const [draft1, setDraft1] = useState<LocationDraft>(toDraft(location1));
  const [draft2, setDraft2] = useState<LocationDraft>(toDraft(location2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComplete = (d: LocationDraft) => Boolean(d.country && d.regionCode && d.city);
  const canSave = isComplete(draft1) && isComplete(draft2);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    const result = await onSave(
      { country: draft1.country, regionCode: draft1.regionCode!, city: draft1.city! },
      { country: draft2.country, regionCode: draft2.regionCode!, city: draft2.city! }
    );

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={saving ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit Client Local Time Locations"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-[var(--crm-surface,#ffffff)] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-[var(--crm-text,#17283b)]">Edit Locations</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--crm-text-muted,#6b7c90)] hover:bg-[var(--crm-bg-2,#eaf0f6)] disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-[13px] text-[var(--crm-text-muted,#6b7c90)]">
          Choose the two locations shown in your Client Local Time panel. Pick a country, then a province/state, then a major city.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LocationEditor title="Location 1" draft={draft1} onChange={setDraft1} />
          <LocationEditor title="Location 2" draft={draft2} onChange={setDraft2} />
        </div>

        {error && <p className="mt-3 text-[13px] font-medium text-rose-600">{error}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSave}
            className="rounded-full bg-[var(--crm-accent,#3e7ef7)] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[var(--crm-accent-hover,#2e63d6)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Locations"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-[13.5px] font-semibold text-[var(--crm-text-muted,#6b7c90)] hover:text-[var(--crm-text,#17283b)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
