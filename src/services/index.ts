/**
 * Service Layer Index
 * 
 * Central export for all services in NeXSS
 */

// Base service utilities
export {
    type ServiceResult,
    success,
    error,
    Errors,
    ErrorCodes,
    toResponse,
    toResponseWithCORS,
    createLogger,
    safeExecute,
} from './base.service';

// Report service
export * as ReportService from './report.service';
export type {
    FullReport,
    ReportListParams,
    ReportListResult,
    BulkActionResult,
    ReportStats,
} from './report.service';

// User service
export * as UserService from './user.service';
export type {
    SafeUser,
    UserProfile,
    UpdateProfileInput,
    UserSession,
} from './user.service';

// Settings service
export * as SettingsService from './settings.service';
export type {
    AppSettings,
    PayloadSettings,
    TelegramSettings,
    StorageTestResult,
} from './settings.service';

// Screenshot service
export * as ScreenshotService from './screenshot.service';
export {
    generateThumbnail,
    generatePreview,
    optimizeScreenshot,
    processScreenshot,
    base64ToBuffer,
    bufferToBase64,
    getImageDimensions,
    isValidImage,
    getContentType,
    DEFAULT_THUMBNAIL_CONFIG,
    PREVIEW_CONFIG,
} from './screenshot.service';
export type {
    ThumbnailConfig,
    ProcessedScreenshot,
} from './screenshot.service';

// Path Enumeration service
export * as PathEnumerationService from './path-enumeration.service';
