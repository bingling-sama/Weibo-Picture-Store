import {
    DEFAULT_SETTINGS,
    STORAGE_KEYS,
    type HistoryRecord,
    type PopupWindowInfo,
    type SettingsState,
} from "./constants";

export const STORAGE_DEFAULTS: SettingsState = {
    autoDisplayChangelog: DEFAULT_SETTINGS.autoDisplayChangelog,
    inheritWeiboWatermark: DEFAULT_SETTINGS.inheritWeiboWatermark,
    allowUserAccount: DEFAULT_SETTINGS.allowUserAccount,
    accountUsername: DEFAULT_SETTINGS.accountUsername,
    accountPassword: DEFAULT_SETTINGS.accountPassword,
    customSchemeType: DEFAULT_SETTINGS.customSchemeType,
    customClipType: DEFAULT_SETTINGS.customClipType,
    customClipValue: DEFAULT_SETTINGS.customClipValue,
};

function asSchemeType(value: unknown): SettingsState["customSchemeType"] {
    return value === "1" || value === "2" || value === "3" ? value : STORAGE_DEFAULTS.customSchemeType;
}

function asClipType(value: unknown): SettingsState["customClipType"] {
    return value === "1" || value === "2" || value === "3" || value === "4" ? value : STORAGE_DEFAULTS.customClipType;
}

export async function getSettings(): Promise<SettingsState> {
    const data = await chrome.storage.sync.get({
        [STORAGE_KEYS.autoDisplayChangelog]: STORAGE_DEFAULTS.autoDisplayChangelog,
        [STORAGE_KEYS.inheritWeiboWatermark]: STORAGE_DEFAULTS.inheritWeiboWatermark,
        [STORAGE_KEYS.allowUserAccount]: STORAGE_DEFAULTS.allowUserAccount,
        [STORAGE_KEYS.customSchemeType]: STORAGE_DEFAULTS.customSchemeType,
        [STORAGE_KEYS.customClipType]: STORAGE_DEFAULTS.customClipType,
        [STORAGE_KEYS.customClipValue]: STORAGE_DEFAULTS.customClipValue,
        [STORAGE_KEYS.weiboAccountDetails]: {
            username: STORAGE_DEFAULTS.accountUsername,
            password: STORAGE_DEFAULTS.accountPassword,
            allowUserAccount: STORAGE_DEFAULTS.allowUserAccount,
        },
    });

    const account = data[STORAGE_KEYS.weiboAccountDetails] as {
        username?: string;
        password?: string;
        allowUserAccount?: boolean;
    };
    const customClipValue = data[STORAGE_KEYS.customClipValue];

    return {
        autoDisplayChangelog: Boolean(data[STORAGE_KEYS.autoDisplayChangelog]),
        inheritWeiboWatermark: Boolean(data[STORAGE_KEYS.inheritWeiboWatermark]),
        allowUserAccount: Boolean(account?.allowUserAccount ?? data[STORAGE_KEYS.allowUserAccount]),
        accountUsername: account?.username ?? STORAGE_DEFAULTS.accountUsername,
        accountPassword: account?.password ?? STORAGE_DEFAULTS.accountPassword,
        customSchemeType: asSchemeType(data[STORAGE_KEYS.customSchemeType]),
        customClipType: asClipType(data[STORAGE_KEYS.customClipType]),
        customClipValue: typeof customClipValue === "string" ? customClipValue : STORAGE_DEFAULTS.customClipValue,
    };
}

export async function setSettings(next: Partial<SettingsState>) {
    const current = await getSettings();
    const merged = { ...current, ...next };
    await chrome.storage.sync.set({
        [STORAGE_KEYS.autoDisplayChangelog]: merged.autoDisplayChangelog,
        [STORAGE_KEYS.inheritWeiboWatermark]: merged.inheritWeiboWatermark,
        [STORAGE_KEYS.allowUserAccount]: merged.allowUserAccount,
        [STORAGE_KEYS.customSchemeType]: merged.customSchemeType,
        [STORAGE_KEYS.customClipType]: merged.customClipType,
        [STORAGE_KEYS.customClipValue]: merged.customClipValue,
        [STORAGE_KEYS.weiboAccountDetails]: {
            username: merged.accountUsername,
            password: merged.accountPassword,
            allowUserAccount: merged.allowUserAccount,
        },
    });
}

export async function getPopupWindowInfo(): Promise<PopupWindowInfo> {
    const data = await chrome.storage.local.get({
        [STORAGE_KEYS.popupWindowInfo]: { id: null, locked: false },
    });

    return data[STORAGE_KEYS.popupWindowInfo] as PopupWindowInfo;
}

export async function setPopupWindowInfo(next: PopupWindowInfo) {
    await chrome.storage.local.set({
        [STORAGE_KEYS.popupWindowInfo]: next,
    });
}

export async function getHistoryRecords(): Promise<HistoryRecord[]> {
    const data = await chrome.storage.local.get({
        [STORAGE_KEYS.historyRecords]: [],
    });

    return (data[STORAGE_KEYS.historyRecords] as HistoryRecord[]) ?? [];
}

export async function getHistoryRecord(id: string): Promise<HistoryRecord | null> {
    const records = await getHistoryRecords();
    return records.find((record) => record.id === id) || null;
}

export async function appendHistoryRecord(record: HistoryRecord) {
    const records = await getHistoryRecords();
    await chrome.storage.local.set({
        [STORAGE_KEYS.historyRecords]: [record, ...records].slice(0, 100),
    });
}

export async function appendHistoryRecords(recordsToAdd: HistoryRecord[]) {
    if (!recordsToAdd.length) {
        return;
    }

    const records = await getHistoryRecords();
    await chrome.storage.local.set({
        [STORAGE_KEYS.historyRecords]: [...recordsToAdd, ...records].slice(0, 100),
    });
}

export async function clearHistoryRecords() {
    await chrome.storage.local.set({
        [STORAGE_KEYS.historyRecords]: [],
    });
}

export async function deleteHistoryRecords(ids: string[]) {
    if (!ids.length) {
        return;
    }

    const idSet = new Set(ids);
    const records = await getHistoryRecords();
    await chrome.storage.local.set({
        [STORAGE_KEYS.historyRecords]: records.filter((record) => !idSet.has(record.id)),
    });
}

export async function updateHistoryRecordStatus(
    id: string,
    patch: Partial<Pick<HistoryRecord, "status" | "detail" | "sourceUrl" | "source" | "links" | "fileName" | "size" | "mimeType">>,
) {
    const records = await getHistoryRecords();
    const nextRecords = records.map((record) => {
        if (record.id !== id) {
            return record;
        }

        return {
            ...record,
            ...patch,
        };
    });

    await chrome.storage.local.set({
        [STORAGE_KEYS.historyRecords]: nextRecords,
    });
}
