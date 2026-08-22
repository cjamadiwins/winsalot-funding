// In-app Lead Generation CRM notifications (leadgen_notifications,
// migration 0071) - mirrors src/lib/crm-notifications.ts's row shape
// exactly (minus the cleaning-CRM-only provider_lead_id column). The
// pure `notificationTimeAgoLabel` formatter has nothing CRM-specific
// about it, so NotificationBell.tsx's existing import of it from
// crm-notifications.ts is reused as-is - this type only needs to be
// structurally compatible with what NotificationBell expects, which it
// is.

export type LeadgenNotificationRow = {
  id: string;
  created_at: string;
  user_id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  is_read: boolean;
  read_at: string | null;
};
