export type FileType = "audio" | "video";
export type ProcessingStatus = "uploaded" | "converting" | "transcribing" | "generating_report" | "completed" | "error";
export type Engine = "openai" | "gemini" | "claude" | "whisper" | "none";
export type ReportFormat = "markdown" | "text";
export type TranscriptionProvider = "openai" | "gemini" | "whisper";
export type ReportProvider = "openai" | "claude" | "gemini" | "local";
export type ReportExportExtension = "md" | "txt" | "docx" | "pdf";
export type RemoteMediaSource = "youtube" | "instagram";

export interface UploadItem {
  id: string;
  workspace_id?: string;
  original_filename: string;
  stored_filename: string;
  file_type: FileType;
  mime_type: string;
  original_path: string;
  converted_path: string | null;
  transcription_text: string | null;
  transcription_engine: Engine;
  language_detected: string | null;
  status: ProcessingStatus;
  upload_size_bytes: number;
  duration_seconds: number | null;
  error_message: string | null;
  report_count: number;
  created_at: string;
  updated_at: string;
}

export interface UploadCreateResponse {
  id: string;
  workspace_id?: string;
  original_filename: string;
  file_type: FileType;
  status: ProcessingStatus;
  created_at: string;
}

export interface UploadListResponse {
  items: UploadItem[];
  total: number;
}

export interface RemoteImportPayload {
  source: RemoteMediaSource;
  url: string;
}

export interface DashboardStats {
  total_uploads: number;
  total_reports: number;
  most_used_engine: string | null;
  recent_uploads: UploadItem[];
}

export interface TranscriptionRead {
  upload_id: string;
  original_filename: string;
  status: ProcessingStatus;
  transcription_text: string | null;
  transcription_engine: Engine;
  language_detected: string | null;
  duration_seconds: number | null;
  updated_at: string;
}

export type FormFieldType = "text" | "textarea" | "date" | "number";

export interface FormFieldSpec {
  key: string;
  label: string;
  type: FormFieldType;
  placeholder: string | null;
  required: boolean;
  help: string | null;
}

export interface ReportTemplate {
  id: string;
  workspace_id?: string;
  name: string;
  description: string;
  category: string;
  base_prompt: string;
  example_output: string | null;
  complementary_instructions: string | null;
  form_fields: FormFieldSpec[] | null;
  output_format: ReportFormat;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateReferenceAnalysis {
  name: string;
  description: string;
  category: string;
  base_prompt: string;
  example_output: string | null;
  complementary_instructions: string | null;
  form_fields: FormFieldSpec[] | null;
  output_format: ReportFormat;
  source_filename: string;
  source_format: string;
  converted_docx_filename: string | null;
  converted_docx_base64: string | null;
}

export interface TemplateReferenceText {
  source_filename: string;
  source_format: string;
  content: string;
}

export interface ReportRead {
  id: string;
  workspace_id?: string;
  upload_id: string;
  template_id: string | null;
  title: string;
  request_prompt: string;
  content: string;
  output_format: ReportFormat;
  generator_engine: Engine;
  created_at: string;
}

export interface ReportExportRead {
  extension: ReportExportExtension;
  filename: string;
  media_type: string;
  size_bytes: number;
  download_url: string;
}

export interface FormFillPayload {
  template_id: string;
  source_text: string;
  title: string;
  additional_instructions?: string | null;
}

export interface FormFillFieldsPayload {
  template_id: string;
  title: string;
  fields: Record<string, string>;
  additional_instructions?: string | null;
  ai_polish?: boolean;
}

export interface FormDetectFieldsPayload {
  template_id: string;
  source_text: string;
  additional_instructions?: string | null;
}

export interface FormDetectFieldsResponse {
  template_id: string;
  fields: Record<string, string>;
  generator_engine: Engine;
}

export interface FormFillResponse {
  template_id: string;
  title: string;
  content: string;
  output_format: ReportFormat;
  generator_engine: Engine;
}

export interface FormExportPayload {
  title: string;
  content: string;
  extension: ReportExportExtension;
}

export interface SettingsRead {
  openai_api_key_masked: string | null;
  gemini_api_key_masked: string | null;
  claude_api_key_masked: string | null;
  default_report_template_id: string | null;
  whisper_model: string;
  transcription_provider_order: TranscriptionProvider[];
  report_provider_order: ReportProvider[];
  export_directory: string | null;
  preferred_language: string;
  max_upload_mb: number;
  auto_cleanup_temp_files: boolean;
  updated_at: string | null;
}

export interface StartProcessingPayload {
  language: string;
  force_reprocess?: boolean;
  use_api?: boolean;
  whisper_model?: string | null;
  transcription_provider?: TranscriptionProvider | null;
}

export interface ReportRenamePayload {
  title: string;
}
