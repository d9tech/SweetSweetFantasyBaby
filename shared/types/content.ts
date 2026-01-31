/**
 * Shared Content Types
 *
 * These types are used by both frontend and backend to ensure consistency.
 */

/**
 * Supported language codes (ISO 639-1)
 */
export type LanguageCode =
  | 'en'  // English
  | 'es'  // Spanish
  | 'fr'  // French
  | 'de'  // German
  | 'ja'  // Japanese
  | 'zh'  // Chinese
  | 'ko'  // Korean
  | 'ar'  // Arabic
  | 'pt'  // Portuguese
  | 'ru'; // Russian

/**
 * Content entity
 */
export interface Content {
  id: string;
  title: string;
  body: string;
  language_code: LanguageCode;
  created_at: string;  // ISO 8601 datetime
  updated_at: string;  // ISO 8601 datetime
}

/**
 * Request to create new content
 */
export interface CreateContentRequest {
  title: string;
  body: string;
  language_code: LanguageCode;
}

/**
 * Request to update existing content
 */
export interface UpdateContentRequest {
  title?: string;
  body?: string;
}

/**
 * Translation of content
 */
export interface ContentTranslation {
  id: string;
  content_id: string;
  language_code: LanguageCode;
  title: string;
  body: string;
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}

/**
 * API error response
 */
export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
