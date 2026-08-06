export interface Room {
  id: string;
  slug: string;
  pin_hash: string | null;
  hasPin?: boolean;
  content: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface Attachment {
  id: string;
  room_id: string;
  storage_path: string;
  filename: string;
  mime: string;
  size: number;
  created_at: string;
  public_url?: string;
}

export interface SyncTextPayload {
  clientId: string;
  content: string;
  updated_at: string;
}

export interface PresenceUser {
  clientId: string;
  onlineAt: string;
}
