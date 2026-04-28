import { MENU_IDS, NOTIFICATION_IDS, URLS } from "../shared/constants";
import { getActiveTab, notify, openTab } from "../shared/runtime";
import type { ContentMessage } from "../shared/constants";
import { appendHistoryRecord, getSettings, updateHistoryRecordStatus } from "../shared/storage";
import { uploadWeiboImage } from "../shared/weibo";
import { Log } from "../shared/log";

const DNR_RULE_IDS = [9101, 9102, 9103, 9104, 9105, 9106];
const WEIBO_REFERER = "https://weibo.com/";
const WEIBO_ORIGIN = "https://weibo.com";
const PASSPORT_REFERER = "https://passport.weibo.cn/signin/login";
const PASSPORT_ORIGIN = "https://passport.weibo.cn";
const MOBILE_USER_AGENT =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const DNR = chrome.declarativeNetRequest;

const dnrResourceTypes = [
    DNR.ResourceType.MAIN_FRAME,
    DNR.ResourceType.SUB_FRAME,
    DNR.ResourceType.XMLHTTPREQUEST,
    DNR.ResourceType.IMAGE,
    DNR.ResourceType.MEDIA,
    DNR.ResourceType.SCRIPT,
];

const dnrRules: chrome.declarativeNetRequest.Rule[] = [
    {
        id: 9101,
        priority: 1,
        action: {
            type: DNR.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
                { header: "referer", operation: DNR.HeaderOperation.SET, value: WEIBO_REFERER },
                { header: "origin", operation: DNR.HeaderOperation.SET, value: WEIBO_ORIGIN },
            ],
        },
        condition: {
            urlFilter: "||photo.weibo.com/",
            resourceTypes: dnrResourceTypes,
        },
    },
    {
        id: 9102,
        priority: 1,
        action: {
            type: DNR.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
                { header: "referer", operation: DNR.HeaderOperation.SET, value: WEIBO_REFERER },
                { header: "origin", operation: DNR.HeaderOperation.SET, value: WEIBO_ORIGIN },
            ],
        },
        condition: {
            urlFilter: "||picupload.weibo.com/",
            resourceTypes: [DNR.ResourceType.XMLHTTPREQUEST],
        },
    },
    {
        id: 9103,
        priority: 1,
        action: {
            type: DNR.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
                { header: "referer", operation: DNR.HeaderOperation.SET, value: WEIBO_REFERER },
                { header: "origin", operation: DNR.HeaderOperation.SET, value: WEIBO_ORIGIN },
                {
                    header: "user-agent",
                    operation: DNR.HeaderOperation.SET,
                    value: MOBILE_USER_AGENT,
                },
            ],
        },
        condition: {
            urlFilter: "||passport.weibo.cn/",
            resourceTypes: [DNR.ResourceType.MAIN_FRAME, DNR.ResourceType.SUB_FRAME, DNR.ResourceType.XMLHTTPREQUEST],
        },
    },
    {
        id: 9104,
        priority: 1,
        action: {
            type: DNR.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [{ header: "referer", operation: DNR.HeaderOperation.SET, value: WEIBO_REFERER }],
        },
        condition: {
            urlFilter: "||sinaimg.cn/",
            resourceTypes: [DNR.ResourceType.IMAGE, DNR.ResourceType.MEDIA, DNR.ResourceType.XMLHTTPREQUEST],
        },
    },
    {
        id: 9105,
        priority: 1,
        action: {
            type: DNR.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [{ header: "referer", operation: DNR.HeaderOperation.SET, value: "https://passport.weibo.cn/" }],
        },
        condition: {
            urlFilter: "||login.sina.com.cn/sso/",
            resourceTypes: [DNR.ResourceType.XMLHTTPREQUEST],
        },
    },
    {
        id: 9106,
        priority: 1,
        action: {
            type: DNR.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
                { header: "origin", operation: DNR.HeaderOperation.SET, value: PASSPORT_ORIGIN },
                { header: "referer", operation: DNR.HeaderOperation.SET, value: PASSPORT_REFERER },
                { header: "user-agent", operation: DNR.HeaderOperation.SET, value: MOBILE_USER_AGENT },
            ],
        },
        condition: {
            urlFilter: "||passport.weibo.cn/sso/login",
            resourceTypes: [DNR.ResourceType.XMLHTTPREQUEST],
        },
    },
];

function labelFromUrl(rawUrl?: string) {
    if (!rawUrl) {
        return "Unknown resource";
    }

    try {
        const url = new URL(rawUrl);
        return url.pathname.split("/").filter(Boolean).pop() || url.hostname;
    } catch {
        return rawUrl.slice(0, 120);
    }
}

async function registerDynamicRules() {
    if (!chrome.declarativeNetRequest?.updateDynamicRules) {
        return;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: DNR_RULE_IDS,
        addRules: dnrRules,
    });
}

function fileNameFromUrl(rawUrl?: string, fallback = "image") {
    if (!rawUrl) {
        return fallback;
    }

    try {
        const url = new URL(rawUrl);
        return url.pathname.split("/").filter(Boolean).pop() || fallback;
    } catch {
        return fallback;
    }
}

function checkGlobalHostPermission() {
    return new Promise<boolean>((resolve) => {
        if (!chrome.permissions?.contains) {
            resolve(false);
            return;
        }
        chrome.permissions.contains({ origins: ["*://*/*"] }, resolve);
    });
}

let nextSessionRuleId = 100000;

async function fetchImageUrlAsFile(rawUrl: string, pageUrl?: string, replay = false): Promise<File> {
    if (rawUrl.startsWith("data:")) {
        return dataUrlToFile(rawUrl, fileNameFromUrl(rawUrl));
    }

    const granted = await checkGlobalHostPermission();
    let ruleId: number | undefined;

    if (granted && !replay && pageUrl) {
        ruleId = nextSessionRuleId++;
        const DNR = chrome.declarativeNetRequest;
        await DNR.updateSessionRules({
            addRules: [
                {
                    id: ruleId,
                    priority: 1,
                    action: {
                        type: DNR.RuleActionType.MODIFY_HEADERS,
                        requestHeaders: [
                            {
                                operation: DNR.HeaderOperation.SET,
                                header: "referer",
                                value: pageUrl,
                            },
                        ],
                    },
                    condition: {
                        urlFilter: rawUrl,
                        resourceTypes: [DNR.ResourceType.XMLHTTPREQUEST],
                    },
                },
            ],
            removeRuleIds: [ruleId],
        });
    }

    try {
        const response = await fetch(rawUrl, {
            credentials: "omit",
            redirect: "follow",
        });
        if (!response.ok) {
            throw new Error(response.statusText || `HTTP ${response.status}`);
        }

        const blob = await response.blob();
        return new File([blob], fileNameFromUrl(rawUrl), {
            type: blob.type || "application/octet-stream",
        });
    } catch (error) {
        if (granted && !replay) {
            return fetchImageUrlAsFile(rawUrl, pageUrl, true);
        }
        if (!granted) {
            throw new Error("无法读取远程图片，请开启选项中的“伪造 HTTP Referer”功能获得跨域读取权限");
        }
        throw error;
    } finally {
        if (ruleId) {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [ruleId],
            });
        }
    }
}

function dataUrlToFile(dataURL: string, fileName: string) {
    const [metadata, payload] = dataURL.split(",");
    const mimeType = metadata.match(/^data:(.*?);base64$/)?.[1] || "image/jpeg";
    const binary = atob(payload || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new File([bytes], fileName, { type: mimeType });
}

function captureVideoFrameInPage(srcUrl?: string) {
    const videoRefs = Array.from(document.querySelectorAll("video"));
    for (const videoRef of videoRefs) {
        if (srcUrl && videoRef.currentSrc && videoRef.currentSrc !== srcUrl) {
            continue;
        }

        const width = videoRef.videoWidth;
        const height = videoRef.videoHeight;
        if (!width || !height) {
            continue;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
            continue;
        }

        context.drawImage(videoRef, 0, 0, width, height);
        try {
            return { found: true, dataURL: canvas.toDataURL("image/jpeg", 0.92) };
        } catch {
            return { found: false };
        }
    }

    return { found: false };
}

async function captureVideoFrame(tabId: number, srcUrl?: string) {
    const response = await new Promise<{ found?: boolean; dataURL?: string }>((resolve) => {
        chrome.tabs.sendMessage(tabId, { cmd: "CaptureVideoFrame", srcUrl }, (messageResponse) => {
            if (chrome.runtime.lastError) {
                resolve({ found: false });
                return;
            }
            resolve(messageResponse || { found: false });
        });
    });
    if (response.found && response.dataURL) {
        return response;
    }

    const injections = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: captureVideoFrameInPage,
        args: [srcUrl],
    });
    return injections.map((item) => item.result).find((item) => item?.found && item.dataURL) || { found: false };
}

async function writeToTabClipboard(tabId: number | undefined, content: string) {
    if (!tabId) {
        return false;
    }

    return new Promise<boolean>((resolve) => {
        chrome.tabs.sendMessage(tabId, { cmd: "WriteToClipboard", content }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(false);
                return;
            }
            resolve(Boolean(response?.done));
        });
    });
}

async function uploadContextFile(params: {
    tabId?: number;
    recordId: string;
    file: File;
    successTitle: string;
}) {
    await updateHistoryRecordStatus(params.recordId, {
        status: "processing",
        detail: "上传中",
    });

    try {
        const settings = await getSettings();
        const uploaded = await uploadWeiboImage(params.file, settings, params.file.name);
        const links = {
            URL: uploaded.URL,
            HTML: uploaded.HTML,
            UBB: uploaded.UBB,
            Markdown: uploaded.Markdown,
        };
        await updateHistoryRecordStatus(params.recordId, {
            status: "uploaded",
            detail: "上传成功",
            sourceUrl: uploaded.URL,
            links,
        });

        const copied = await writeToTabClipboard(params.tabId, uploaded.URL);
        await notify(params.successTitle, copied ? "上传成功，外链已复制。" : `上传成功：${uploaded.URL}`);
        await openTab(`tabs/upload.html?record_id=${encodeURIComponent(params.recordId)}`);
    } catch (error) {
        const detail = error instanceof Error ? error.message : "上传失败";
        await updateHistoryRecordStatus(params.recordId, {
            status: "failed",
            detail,
        });
        await notify(params.successTitle, detail);
        await openTab(`tabs/upload.html?record_id=${encodeURIComponent(params.recordId)}`);
    }
}

async function maybeShowChangelog(details: chrome.runtime.InstalledDetails) {
    if (details.reason === "install") {
        await chrome.tabs.create({ url: URLS.projectReadme });
        return;
    }

    if (details.reason !== "update" || !details.previousVersion) {
        return;
    }

    const [prevMajor, prevMinor] = details.previousVersion.split(".", 2);
    const [major, minor] = chrome.runtime.getManifest().version.split(".", 2);
    if (prevMajor === major && prevMinor === minor) {
        return;
    }

    const settings = await getSettings();
    if (settings.autoDisplayChangelog) {
        await chrome.tabs.create({ url: URLS.projectChangelog });
    }
}

function createContextMenus() {
    chrome.contextMenus.create({
        id: MENU_IDS.openHistory,
        title: "上传记录",
        contexts: ["action"],
    });

    chrome.contextMenus.create({
        id: MENU_IDS.downloadLog,
        title: "导出日志",
        contexts: ["action"],
    });

    chrome.contextMenus.create({
        id: MENU_IDS.batchDelete,
        title: "移除选中的文件",
        contexts: ["link"],
        visible: false,
    });

    chrome.contextMenus.create({
        id: MENU_IDS.uploadImage,
        title: "把这张图片上传到微相册",
        contexts: ["image"],
    });

    chrome.contextMenus.create({
        id: MENU_IDS.uploadFrame,
        title: "把当前的视频帧上传到微相册",
        contexts: ["video"],
    });
}

function resetContextMenus() {
    chrome.contextMenus.removeAll(() => createContextMenus());
}

chrome.runtime.onInstalled.addListener((details) => {
    void registerDynamicRules();
    void maybeShowChangelog(details);
    resetContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
    void registerDynamicRules();
    resetContextMenus();
});

resetContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_IDS.openHistory) {
        void openTab("tabs/history.html");
        return;
    }

    if (info.menuItemId === MENU_IDS.downloadLog) {
        void Log.download();
        return;
    }

    if (info.menuItemId === MENU_IDS.uploadImage) {
        if (!info.srcUrl) {
            void notify("上传图片", "未找到有效的图片链接。");
            return;
        }

        void notify("正在加入队列", "已将图片加入上传队列，请稍后...");
        const recordId = crypto.randomUUID();
        void (async () => {
            await appendHistoryRecord({
                id: recordId,
                title: labelFromUrl(info.srcUrl),
                createdAt: Date.now(),
                detail: "等待上传",
                status: "queued",
                source: "context-image",
                sourceUrl: info.srcUrl,
                mimeType: "image/*",
            });

            const file = await fetchImageUrlAsFile(info.srcUrl, info.frameUrl || info.pageUrl);
            await updateHistoryRecordStatus(recordId, {
                detail: "等待上传",
                fileName: file.name,
                size: file.size,
                mimeType: file.type,
            });
            await uploadContextFile({
                tabId: tab?.id,
                recordId,
                file,
                successTitle: "上传成功",
            });
        })().catch((error) => {
            const detail = error instanceof Error ? error.message : "上传失败";
            void updateHistoryRecordStatus(recordId, {
                status: "failed",
                detail,
            });
            void notify("上传图片", detail);
            void openTab(`tabs/upload.html?record_id=${encodeURIComponent(recordId)}`);
        });
        return;
    }

    if (info.menuItemId === MENU_IDS.uploadFrame) {
        if (!tab?.id) {
            void notify("截取视频帧", "无法找到当前标签页。");
            return;
        }

        void notify("正在截取", "正在捕获当前视频画面并加入上传队列，请稍后...");
        void (async () => {
            const response = await captureVideoFrame(tab.id, info.srcUrl);
            if (!response?.found || !response.dataURL) {
                void notify("截取失败", "无法捕获到任何匹配的视频帧。");
                return;
            }

            const recordId = crypto.randomUUID();
            const fileName = `${fileNameFromUrl(info.srcUrl, "video-frame")}.jpg`;
            const file = dataUrlToFile(response.dataURL, fileName);
            await appendHistoryRecord({
                id: recordId,
                title: labelFromUrl(info.srcUrl),
                createdAt: Date.now(),
                detail: "已捕获当前视频帧，等待上传",
                status: "queued",
                fileName,
                source: "context-video",
                sourceUrl: info.srcUrl,
                mimeType: file.type,
                size: file.size,
            });

            await uploadContextFile({
                tabId: tab.id,
                recordId,
                file,
                successTitle: "截取成功",
            });
        })().catch((error) => {
            const detail = error instanceof Error ? error.message : "截取视频帧失败";
            void notify("截取视频帧", detail);
        });
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command !== "execute_pointer_events") {
        return;
    }

    void getActiveTab().then((tab): void => {
        if (!tab?.id) {
            void notify("指针事件模式", "无法找到活动的标签页。");
            return;
        }

        chrome.tabs.sendMessage(tab.id, { cmd: "AllowPointerEvents" });
    });
});

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith(NOTIFICATION_IDS.remainLogout)) {
        void chrome.tabs.create({ url: URLS.weiboLogin });
        void chrome.notifications.clear(notificationId);
    }
});

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, _sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }

    return false;
});
