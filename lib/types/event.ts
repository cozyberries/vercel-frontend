export interface EventLog {
  user_id?: string;
  session_id?: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  page_path?: string;
}
