export const STORAGE_KEYS = {
    autoDisplayChangelog: "auto_display_changelog",
    inheritWeiboWatermark: "weibo_inherited_watermark",
    allowUserAccount: "allow_user_account",
    weiboAccountDetails: "weibo_account_details",
    customSchemeType: "custom_scheme_type",
    customClipType: "custom_clip_type",
    customClipValue: "custom_clip_value",
    popupWindowInfo: "popup_window_info",
    historyRecords: "history_records",
    weiboAlbumCache: "weibo_album_cache",
} as const;

export const MENU_IDS = {
    openHistory: "open-history",
    downloadLog: "download-log",
    batchDelete: "batch-delete",
    uploadImage: "upload-image",
    uploadFrame: "upload-frame",
} as const;

export const DEFAULT_SETTINGS = {
    autoDisplayChangelog: true,
    inheritWeiboWatermark: false,
    allowUserAccount: false,
    accountUsername: "",
    accountPassword: "",
    customSchemeType: "2",
    customClipType: "1",
    customClipValue: "",
} as const;

export const FEATURE_ALBUM_DESCRIPTION = "ImUfrNWhuFTTOXASFgdCVVv2ZUIquXrKjqiey2r95Kqudh6sjaBUWFdcwtlGEX2w";

export const NOTIFICATION_IDS = {
    remainLogout: "NID_REMAIN_LOGOUT",
    uploadResult: "NID_UPLOAD_RESULT",
    loginResult: "NID_LOGIN_RESULT",
    logExport: "NID_LOG_EXPORT",
} as const;

export const URLS = {
    projectReadme: "https://github.com/Semibold/Weibo-Picture-Store#readme",
    projectChangelog: "https://github.com/Semibold/Weibo-Picture-Store/blob/master/changelog.md",
    weiboLogin: `https://weibo.com/login.php?url=${encodeURIComponent("https://weibo.com")}`,
} as const;

export type SettingsState = {
    autoDisplayChangelog: boolean;
    inheritWeiboWatermark: boolean;
    allowUserAccount: boolean;
    accountUsername: string;
    accountPassword: string;
    customSchemeType: "1" | "2" | "3";
    customClipType: "1" | "2" | "3" | "4";
    customClipValue: string;
};

export type PopupWindowInfo = {
    id: number | null;
    locked: boolean;
};

export type HistoryRecord = {
    id: string;
    title: string;
    createdAt: number;
    detail: string;
    status: "queued" | "processing" | "uploaded" | "failed" | "demo";
    fileName?: string;
    size?: number;
    mimeType?: string;
    source?: "demo" | "file-picker" | "drag-drop" | "context-image" | "context-video";
    sourceUrl?: string;
    links?: {
        URL: string;
        HTML: string;
        UBB: string;
        Markdown: string;
    };
};

export type UploadInput = {
    fileName: string;
    size: number;
    mimeType: string;
    source: "file-picker" | "drag-drop";
};

export type TogglePointerMessage = {
    cmd: "AllowPointerEvents";
};

export type WriteClipboardMessage = {
    cmd: "WriteToClipboard";
    content: string;
};

export type CaptureVideoFrameMessage = {
    cmd: "CaptureVideoFrame";
    srcUrl: string;
};

export type ContentMessage = TogglePointerMessage | WriteClipboardMessage | CaptureVideoFrameMessage;
