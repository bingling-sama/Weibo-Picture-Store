import iconUrl from "data-base64:~assets/icon.png";

export function getExtName() {
    return chrome.i18n.getMessage("ext_name") || "微博图床";
}

export function openTab(path: string) {
    return chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

export function openUploadPage() {
    return openTab("tabs/upload.html");
}

export function notify(title: string, message: string, notificationId?: string) {
    const options = {
        type: "basic",
        iconUrl,
        title,
        message,
    } as const;

    return notificationId ? chrome.notifications.create(notificationId, options) : chrome.notifications.create(options);
}

export async function getActiveTab() {
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    return tabs[0] ?? null;
}
