export type FileType = "audio" | "video";
export type ProcessingStatus = "uploaded" | "converting" | "transcribing" | "generating_report" | "completed" | "error";
export type Engine = "openai" | "gemini" | "whisper" | "none";
export type ReportFormat = "markdown" | "text";

export interface UploadItem {
  id: string;
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
  original_filename: string;
  file_type: FileType;
  status: ProcessingStatus;
  created_at: string;
}

export interface UploadListResponse {
  items: UploadItem[];
  total: number;
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

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  base_prompt: string;
  complementary_instructions: string | null;
  output_format: ReportFormat;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportRead {
  id: string;
  upload_id: string;
  template_id: string | null;
  title: string;
  request_prompt: string;
  content: string;
  output_format: ReportFormat;
  generator_engine: Engine;
  created_at: string;
}

export interface SettingsRead {
  openai_api_key_masked: string | null;
  gemini_api_key_masked: string | null;
  default_report_template_id: string | null;
  whisper_model: string;
  export_directory: string | null;
  preferred_language: string;
  max_upload_mb: number;
  auto_cleanup_temp_files: boolean;
  updated_at: string | null;
}
