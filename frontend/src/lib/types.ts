export type Role = "WORKER" | "ADMIN" | "HEALTH" | "SECURITY";
export type AreaCode = "COLD" | "HOT" | "HEIGHT" | "RESTRICTED_GAS";
export type Status = "ALLOWED" | "RESTRICTED" | "NEEDS_REVIEW" | "DENIED";
export type TapResult = "GRANTED" | "TEMPORARY" | "DENIED";

export interface EmployeeBasic {
  id: number;
  employee_code: string;
  full_name: string;
  position: string;
  unit: string;
  work_location: string;
  card_number: string;
  card_active: boolean;
  phone_masked?: string;
  registration_source?: string;
  profile_completed?: boolean;
}

export interface Onboarding {
  general_done: boolean;
  mcu: "DONE" | "DEFERRED" | "MISSING";
  mcu_required: boolean;
  comorbid_done: boolean;
  comorbid_count: number;
  completed: boolean;
  can_complete: boolean;
  next_step: "general" | "mcu" | "comorbid" | null;
}

export interface GeneralProfile {
  employee_code: string;
  card_number: string;
  full_name: string;
  position: string;
  unit: string;
  work_location: string;
  phone: string;
  email: string;
  birth_date: string | null;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  registration_source: string;
  profile_completed_at: string | null;
}

export interface User {
  id: number;
  username: string;
  role: Role;
  full_name: string;
  employee: EmployeeBasic | null;
  onboarding?: Onboarding;
}

export interface AreaMeta {
  code: AreaCode | "GENERAL";
  label: string;
  short: string;
  risk: string;
}

export interface Reason {
  code: string;
  short: string;
  detail?: string;
}

export interface OverrideView {
  id: number;
  employee_id: number;
  area: AreaMeta;
  kind: "OVERRIDE" | "REVIEW_DECISION";
  kind_label: string;
  new_status: Status;
  new_status_label: string;
  base_auto_status: Status;
  valid_from: string;
  valid_until: string;
  reason: string;
  risk_acknowledged: boolean;
  admin_name: string;
  created_at: string;
  state: string;
  state_label: string;
  ended_at: string | null;
  ended_by: string | null;
  end_reason: string | null;
  employee?: EmployeeBasic;
}

export interface CardArea {
  area: AreaMeta;
  status: Status;
  status_label: string;
  source: "AUTO" | "OVERRIDE";
  valid_from: string | null;
  valid_until: string | null;
  tap_preview: TapResult;
  reasons: Reason[];
  auto_status: Status | null;
  auto_status_label?: string;
  auto_reasons: Reason[];
  auto_valid_until?: string | null;
  override: OverrideView | null;
  sync_status: string | null;
  synced_at?: string | null;
}

export interface BPRecord {
  id: number;
  record_date: string;
  measured_at: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  source: string;
  source_label: string;
  note: string | null;
}

export interface MCU {
  id: number;
  mcu_date: string;
  valid_through: string;
  days_left: number;
  expired: boolean;
  provider: string;
  summary: string;
  conclusion: "FIT" | "FIT_WITH_RESTRICTION" | "UNFIT" | "PENDING";
  conclusion_label: string;
  restricted_areas: AreaMeta[];
  doctor_name: string;
  has_document: boolean;
  document_filename: string | null;
  verification_status: "UNVERIFIED" | "VERIFIED" | "REJECTED";
  verification_label: string;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  entered_by: string | null;
  created_at: string;
  employee?: EmployeeBasic;
  details?: Record<string, any> | null;
  field_status?: Record<string, FieldStatus> | null;
  suggestions?: McuSuggestion[];
  edited_fields?: string[];
  extracted_values?: Record<string, any>;
  extraction_status?: string | null;
  extraction_label?: string | null;
  identity_check?: { name_match: boolean | null; birth_date_match: boolean | null } | null;
}

export type FieldStatus = "NORMAL" | "PERHATIAN" | "INFO" | "KOSONG";

export interface McuSuggestion {
  code: string;
  text: string;
  areas: string[];
  comorbid: string | null;
}

export interface McuField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "enum" | "list" | "longtext";
  unit?: string;
  ref?: { min?: number; max?: number };
  ref_label?: string;
  normal_text?: string[];
  readonly?: boolean;
  required?: boolean;
  info?: boolean;
  options?: Record<string, string>;
  check?: "name" | "birth_date";
}

export interface McuTemplate {
  id: string;
  sections: { key: string; label: string; fields: McuField[] }[];
}

export interface McuReview {
  upload_id: string | null;
  filename?: string;
  status: string;
  status_label: string;
  found_count: number;
  template: McuTemplate;
  values: Record<string, any>;
  sources: Record<string, string>;
  field_status: Record<string, FieldStatus>;
  suggestions: McuSuggestion[];
  warnings: string[];
  identity: { name_match: boolean | null; birth_date_match: boolean | null };
  profile: { full_name: string; birth_date: string | null };
  suggested: { mcu_date: string | null; conclusion: string; provider: string; doctor_name: string; summary: string };
}

export interface Comorbidity {
  id: number;
  condition_code: string;
  label: string;
  other_label: string | null;
  controlled: boolean;
  diagnosed_date: string | null;
  active: boolean;
  notes: string | null;
  verification_status: "UNVERIFIED" | "VERIFIED" | "REJECTED";
  verification_label: string;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
  employee?: EmployeeBasic;
}

export interface NotificationItem {
  id: number;
  created_at: string;
  employee_id: number | null;
  recipient_type: "WORKER" | "K3_ONDUTY";
  recipient_label: string;
  channel: string;
  provider: string;
  to_masked: string;
  template: string;
  message: string;
  status: string;
  error: string | null;
}

export interface AccessEvent {
  id: number;
  created_at: string;
  input_identifier: string;
  employee_id: number | null;
  employee_code: string | null;
  card_number: string | null;
  room_code: string;
  room_name: string | null;
  area: AreaMeta | null;
  result: TapResult;
  result_label: string;
  reason_category: string;
  message: string;
  valid_until: string | null;
  max_duration_minutes: number | null;
  source: string;
  device_id: string | null;
  holder_name?: string | null;
  decided_by?: string;
  decision_basis?: string;
}

export interface AssessmentMeta {
  id: string;
  assessed_at: string;
  trigger: string;
  rule_version_label: string;
  flags: string[];
  valid_until: string;
}

export interface FitToDrive {
  status: "FIT_TO_DRIVE" | "UNFIT_TO_DRIVE";
  status_label: string;
  reasons: { code: string; short: string; detail?: string }[];
  assessed_at: string | null;
}

export interface AuditItem {
  id: number;
  created_at: string;
  actor_label: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  employee_id: number | null;
  employee_code?: string | null;
  details: Record<string, any>;
  hash: string;
  prev_hash: string | null;
}

export interface Meta {
  app_name: string;
  demo_mode: boolean;
  today: string;
  areas: AreaMeta[];
  statuses: { code: Status; label: string; severity: number }[];
  mcu_conclusions: { code: string; label: string }[];
  comorbidity_catalog: { code: string; label: string }[];
  fact_catalog: Record<string, { type: string; label: string }>;
  rule_version: {
    id: number;
    version: number;
    label: string;
    approved_by_name: string | null;
    activated_at: string | null;
    disclaimer: string;
  };
  settings: {
    override_max_hours: number;
    override_default_hours: number;
    mcu_validity_days: number;
    restricted_entry_max_minutes: number;
    override_hard_stop_reasons: string[];
  };
  bp_limits: { systolic: [number, number]; diastolic: [number, number]; pulse: [number, number] };
  ai: { configured: boolean; model: string; fallback_models: string[]; note: string };
}
