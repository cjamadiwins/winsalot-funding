import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { ProviderDocumentType } from "./provider-types";

// Files (brief "FILES") + Company Logo upload, stored in the private
// `provider-files` bucket (migration 0028). No storage RLS policies exist
// for this bucket - every read/write goes through these helpers using the
// service-role client, after the calling Server Action has already run
// requireCrmUser()/requireCrmAdmin() and (for agents) the session-scoped
// RLS has already confirmed ownership of the provider_leads row itself.

const BUCKET = "provider-files";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
}

export type ProviderDocumentTarget = { providerLeadId: string } | { cleaningProviderId: string };

// Dual-keyed the same way as the provider_documents table itself: a
// document uploaded pre-approval carries provider_lead_id and, once the
// lead is approved, is also linked to cleaning_provider_id (backfilled by
// the approval action) rather than being duplicated.
export async function uploadProviderDocument(input: {
  target: ProviderDocumentTarget;
  uploadedBy: string;
  docType: ProviderDocumentType;
  file: File;
}): Promise<{ error?: string }> {
  if (input.file.size === 0) return { error: "The selected file is empty." };
  if (input.file.size > MAX_FILE_BYTES) return { error: "Files must be 15MB or smaller." };

  const targetColumn = "providerLeadId" in input.target ? "provider_lead_id" : "cleaning_provider_id";
  const ownerId = "providerLeadId" in input.target ? input.target.providerLeadId : input.target.cleaningProviderId;

  const admin = getSupabaseAdmin();
  const path = `documents/${ownerId}/${Date.now()}-${safeFileName(input.file.name)}`;
  const buffer = await input.file.arrayBuffer();

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: input.file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) return { error: "Failed to upload the document." };

  const { error: insertError } = await admin.from("provider_documents").insert({
    [targetColumn]: ownerId,
    uploaded_by: input.uploadedBy,
    doc_type: input.docType,
    file_name: input.file.name,
    storage_path: path,
    file_size: input.file.size,
    mime_type: input.file.type || null,
  });
  if (insertError) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Failed to save the document record." };
  }
  return {};
}

export async function getProviderDocumentSignedUrl(storagePath: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 600);
  if (error || !data) return null;
  return data.signedUrl;
}

// Admin-only permanent removal (brief: agents "must not... permanently
// remove documents"; only an administrator can). Keeps the row
// (removed_at/removed_by) as an audit trail rather than deleting it, but
// deletes the underlying file from storage.
export async function removeProviderDocument(input: {
  documentId: string;
  removedBy: string;
}): Promise<{ error?: string }> {
  const admin = getSupabaseAdmin();
  const { data: doc } = await admin
    .from("provider_documents")
    .select("storage_path")
    .eq("id", input.documentId)
    .maybeSingle();

  const { error } = await admin
    .from("provider_documents")
    .update({ removed_at: new Date().toISOString(), removed_by: input.removedBy })
    .eq("id", input.documentId);
  if (error) return { error: "Failed to remove the document." };

  if (doc?.storage_path) {
    await admin.storage.from(BUCKET).remove([doc.storage_path as string]);
  }
  return {};
}

export async function uploadProviderLogo(input: {
  ownerId: string;
  file: File;
}): Promise<{ path?: string; error?: string }> {
  if (input.file.size === 0) return { error: "The selected file is empty." };
  if (input.file.size > MAX_FILE_BYTES) return { error: "The logo must be 15MB or smaller." };
  if (!input.file.type.startsWith("image/")) return { error: "The logo must be an image file." };

  const admin = getSupabaseAdmin();
  const path = `logos/${input.ownerId}/${Date.now()}-${safeFileName(input.file.name)}`;
  const buffer = await input.file.arrayBuffer();

  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: input.file.type,
    upsert: true,
  });
  if (error) return { error: "Failed to upload the logo." };
  return { path };
}

export async function getProviderLogoSignedUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(logoPath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}
