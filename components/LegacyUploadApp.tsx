import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

import "../legacy-ui.css";

import type { SettingsState, UploadInput } from "../shared/constants";
import { appendHistoryRecords, getHistoryRecord, getSettings, setSettings, updateHistoryRecordStatus } from "../shared/storage";
import { openTab } from "../shared/runtime";
import { assignWeiboLinks, uploadWeiboImage, type AssignedUpload, type PackedUpload } from "../shared/weibo";

type LocalPreview = UploadInput & {
    id: string;
    objectUrl?: string;
    status: "idle" | "queued" | "processing" | "uploaded" | "failed";
    detail?: string;
    fileNameForLink?: string;
    packed?: PackedUpload;
    links?: Pick<AssignedUpload, "URL" | "HTML" | "UBB" | "Markdown">;
};

const footerLinks = {
    issue: "https://github.com/Semibold/Weibo-Picture-Store/issues",
    donate: "https://www.hub.moe/blackboard/donate.html",
    readme: "https://github.com/Semibold/Weibo-Picture-Store#readme",
    email: "mailto:i@hub.moe",
};

const defaultSettings: SettingsState = {
    autoDisplayChangelog: true,
    inheritWeiboWatermark: false,
    allowUserAccount: false,
    accountUsername: "",
    accountPassword: "",
    customSchemeType: "2",
    customClipType: "1",
    customClipValue: "",
};

function openExternalTab(url: string) {
    return chrome.tabs.create({ url });
}

function buildBlankPreview(): LocalPreview {
    return {
        id: "blank",
        fileName: "",
        size: 0,
        mimeType: "",
        source: "file-picker",
        status: "idle",
    };
}

function isValidUrl(value: string) {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

async function fetchUrlAsFile(url: string) {
    try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) {
            return null;
        }
        const blob = await response.blob();
        const filename = new URL(url).pathname.split("/").filter(Boolean).pop() || "image";
        return new File([blob], filename, { type: blob.type || "application/octet-stream" });
    } catch {
        return null;
    }
}

type FileSystemFileEntryLike = {
    isFile: true;
    isDirectory: false;
    file: (success: (file: File) => void, failure?: (error: unknown) => void) => void;
};

type FileSystemDirectoryEntryLike = {
    isFile: false;
    isDirectory: true;
    createReader: () => {
        readEntries: (
            success: (entries: Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike>) => void,
            failure?: (error: unknown) => void,
        ) => void;
    };
};

async function filesFromEntry(entry: FileSystemFileEntryLike | FileSystemDirectoryEntryLike): Promise<File[]> {
    if (entry.isFile) {
        return new Promise((resolve) => entry.file((file) => resolve([file]), () => resolve([])));
    }

    if (!entry.isDirectory) {
        return [];
    }

    const reader = entry.createReader();
    const entries: Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike> = [];

    while (true) {
        const batch = await new Promise<Array<FileSystemFileEntryLike | FileSystemDirectoryEntryLike>>((resolve) =>
            reader.readEntries(resolve, () => resolve([])),
        );
        if (!batch.length) {
            break;
        }
        entries.push(...batch);
    }

    const nested = await Promise.all(entries.map(filesFromEntry));
    return nested.flat();
}

async function filesFromDataTransfer(dataTransfer: DataTransfer) {
    const items = Array.from(dataTransfer.items || []);
    const entries = items
        .map((item) => {
            const getEntry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemFileEntryLike | FileSystemDirectoryEntryLike | null })
                .webkitGetAsEntry;
            return typeof getEntry === "function" ? getEntry.call(item) : null;
        })
        .filter((entry): entry is FileSystemFileEntryLike | FileSystemDirectoryEntryLike => Boolean(entry));

    if (entries.length) {
        const files = await Promise.all(entries.map(filesFromEntry));
        return files.flat();
    }

    return Array.from(dataTransfer.files || []);
}

function UploadSection({
    item,
    dragActive,
    batch,
    copiedType,
    onChoose,
    onCopy,
}: {
    item: LocalPreview;
    dragActive: boolean;
    batch: boolean;
    copiedType: string;
    onChoose: () => void;
    onCopy: (type: keyof NonNullable<LocalPreview["links"]>, item: LocalPreview) => void;
}) {
    const values = {
        URL: item.links?.URL || "",
        HTML: item.links?.HTML || "",
        UBB: item.links?.UBB || "",
        Markdown: item.links?.Markdown || "",
    };

    return (
        <section>
            <div className="holder-wrapper">
                <div
                    className="image-holder"
                    title={item.detail || (item.fileName ? `图片文件：${item.fileName}` : "点击上传图片到微博相册")}
                    data-has-preview={Boolean(item.objectUrl)}
                    data-drag-active={dragActive}
                    data-status={item.status}
                    data-detail={item.status !== "idle" ? item.detail : ""}
                    onClick={onChoose}
                >
                    {item.objectUrl ? <img src={item.objectUrl} alt={item.fileName || "preview"} /> : null}
                </div>
            </div>
            <div className="table-wrapper">
                <table>
                    <tbody>
                        {Object.entries(values).map(([type, value]) => (
                            <tr key={type} className={`type-${type}`}>
                                <td>
                                    <span className="title">{type}</span>
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        readOnly
                                        spellCheck={false}
                                        placeholder={
                                            type === "URL"
                                                ? "Uniform Resource Locator"
                                                : type === "HTML"
                                                  ? "HyperText Markup Language"
                                                  : type === "UBB"
                                                    ? "Ultimate Bulletin Board"
                                                    : "Markdown"
                                        }
                                        value={value}
                                    />
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="button-copy"
                                        data-type={type}
                                        data-copied={copiedType === `${item.id}:${type}`}
                                        disabled={!value}
                                        onClick={() => onCopy(type as keyof NonNullable<LocalPreview["links"]>, item)}
                                    >
                                        {copiedType === `${item.id}:${type}` ? "Copied" : batch ? "Copy All" : "Copy"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export function LegacyUploadApp() {
    const [settings, setLocalSettings] = useState<SettingsState | null>(null);
    const [batch, setBatch] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [copiedType, setCopiedType] = useState("");
    const [previews, setPreviews] = useState<LocalPreview[]>([buildBlankPreview()]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const transferRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        void getSettings().then(setLocalSettings);
    }, []);

    useEffect(() => {
        const recordId = new URLSearchParams(location.search).get("record_id");
        if (!recordId) {
            return;
        }

        void getHistoryRecord(recordId).then((record) => {
            if (!record) {
                setPreviews([
                    {
                        ...buildBlankPreview(),
                        id: recordId,
                        fileName: "context-upload",
                        status: "failed",
                        detail: "没有找到右键上传结果",
                    },
                ]);
                return;
            }

            setPreviews([
                {
                    id: record.id,
                    fileName: record.fileName || record.title || "context-upload",
                    size: record.size || 0,
                    mimeType: record.mimeType || "image/*",
                    source: record.source === "context-video" ? "drag-drop" : "file-picker",
                    status: record.status === "demo" ? "uploaded" : record.status,
                    detail: record.detail,
                    objectUrl: record.sourceUrl,
                    links: record.links,
                },
            ]);
        });
    }, []);

    useEffect(() => {
        return () => {
            for (const preview of previews) {
                if (preview.objectUrl) {
                    URL.revokeObjectURL(preview.objectUrl);
                }
            }
        };
    }, [previews]);

    const currentPreviews = useMemo(() => (previews.length ? previews : [buildBlankPreview()]), [previews]);
    const effectiveSettings = settings || defaultSettings;

    useEffect(() => {
        setPreviews((current) =>
            current.map((item) => {
                if (!item.packed) {
                    return item;
                }
                const assigned = assignWeiboLinks(item.packed, effectiveSettings, item.fileNameForLink || item.fileName);
                const links = {
                    URL: assigned.URL,
                    HTML: assigned.HTML,
                    UBB: assigned.UBB,
                    Markdown: assigned.Markdown,
                };
                return { ...item, links };
            }),
        );
    }, [effectiveSettings.customClipType, effectiveSettings.customClipValue, effectiveSettings.customSchemeType]);

    const persistSettings = async (patch: Partial<SettingsState>) => {
        const next = { ...effectiveSettings, ...patch };
        setLocalSettings(next);
        await setSettings(next);
    };

    const queueFiles = async (files: FileList | File[], source: UploadInput["source"]) => {
        await uploadFiles(Array.from(files), source);
    };

    const uploadFiles = async (queue: File[], source: UploadInput["source"]) => {
        if (!queue.length) {
            return;
        }

        for (const preview of previews) {
            if (preview.objectUrl) {
                URL.revokeObjectURL(preview.objectUrl);
            }
        }

        const payload = queue.map((file) => ({
            fileName: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            source,
        }));

        const createdAt = Date.now();
        const nextPreviews: LocalPreview[] = queue.map((file, index) => ({
            ...payload[index],
            id: crypto.randomUUID(),
            objectUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
            status: "queued",
            detail: "等待上传",
            fileNameForLink: file.name,
        }));

        setPreviews(nextPreviews);
        await appendHistoryRecords(
            nextPreviews.map((preview) => ({
                id: preview.id,
                title: preview.fileName,
                detail: "等待上传",
                createdAt,
                status: "queued",
                fileName: preview.fileName,
                size: preview.size,
                mimeType: preview.mimeType,
                source: preview.source,
            })),
        );

        const activeSettings = settings || (await getSettings());

        for (let index = 0; index < queue.length; index++) {
            const file = queue[index];
            const preview = nextPreviews[index];

            setPreviews((current) =>
                current.map((item) => (item.id === preview.id ? { ...item, status: "processing", detail: "上传中" } : item)),
            );
            await updateHistoryRecordStatus(preview.id, {
                status: "processing",
                detail: "上传中",
            });

            try {
                const uploaded = await uploadWeiboImage(file, activeSettings, file.name);
                const links = {
                    URL: uploaded.URL,
                    HTML: uploaded.HTML,
                    UBB: uploaded.UBB,
                    Markdown: uploaded.Markdown,
                };
                const packed: PackedUpload = {
                    blob: uploaded.blob,
                    result: uploaded.result,
                    mimeType: uploaded.mimeType,
                    pid: uploaded.pid,
                    size: uploaded.size,
                    width: uploaded.width,
                    height: uploaded.height,
                };

                setPreviews((current) =>
                    current.map((item) =>
                        item.id === preview.id ? { ...item, status: "uploaded", detail: "上传成功", packed, links } : item,
                    ),
                );
                await updateHistoryRecordStatus(preview.id, {
                    status: "uploaded",
                    detail: "上传成功",
                    sourceUrl: uploaded.URL,
                    links,
                });
            } catch (error) {
                const detail = error instanceof Error ? error.message : "上传失败";

                setPreviews((current) =>
                    current.map((item) => (item.id === preview.id ? { ...item, status: "failed", detail } : item)),
                );
                await updateHistoryRecordStatus(preview.id, {
                    status: "failed",
                    detail,
                });
            }
        }
    };

    const handleDrop = async (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragActive(false);
        const files = await filesFromDataTransfer(event.dataTransfer);
        await uploadFiles(files, "drag-drop");
    };

    const handlePaste = async (event: ClipboardEvent<HTMLElement>) => {
        if (document.activeElement && document.activeElement !== document.body) {
            const element = document.activeElement;
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                return;
            }
        }

        const files: File[] = [];
        const fetches: Promise<File | null>[] = [];

        for (const item of Array.from(event.clipboardData.items)) {
            if (item.kind === "file" && typeof item.getAsFile === "function") {
                const file = item.getAsFile();
                if (file) {
                    files.push(file);
                }
            }

            if (item.kind === "string" && typeof item.getAsString === "function") {
                fetches.push(
                    new Promise<string>((resolve) => item.getAsString(resolve)).then(async (text) => {
                        const urls = text
                            .replace(/\r\n/g, "\n")
                            .replace(/\r/g, "\n")
                            .split("\n")
                            .map((value) => value.trim())
                            .filter(isValidUrl);

                        const fetched = await Promise.all(urls.map(fetchUrlAsFile));
                        return fetched[0] || null;
                    }),
                );
            }
        }

        const fetchedFiles = (await Promise.all(fetches)).filter((file): file is File => Boolean(file));
        const queue = [...files, ...fetchedFiles];
        if (queue.length) {
            event.preventDefault();
            await uploadFiles(queue, "file-picker");
        }
    };

    const handleCopy = async (type: keyof NonNullable<LocalPreview["links"]>, item: LocalPreview) => {
        const copied = batch
            ? previews
                  .map((preview) => preview.links?.[type])
                  .filter(Boolean)
                  .join("\n")
            : item.links?.[type] || "";

        if (!copied) {
            return;
        }

        try {
            await navigator.clipboard.writeText(copied);
        } catch {
            if (!transferRef.current) {
                return;
            }
            transferRef.current.value = copied;
            transferRef.current.focus();
            transferRef.current.select();
            document.execCommand("copy");
        }
        setCopiedType(`${item.id}:${type}`);
        window.setTimeout(() => setCopiedType(""), 700);
    };

    return (
        <div
            className="legacy-popup"
            onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
        >
            <div className="legacy-popup__head">
                <div className="head-setting">
                    <div className="head-network-protocol">
                        {[
                            ["1", "http", "使用http协议(全局)"],
                            ["2", "https", "使用https协议(全局)"],
                            ["3", "自适应", "使用相对协议(全局)"],
                        ].map(([value, label, title]) => (
                            <label key={value} title={title}>
                                <input
                                    type="radio"
                                    name="scheme"
                                    value={value}
                                    checked={effectiveSettings.customSchemeType === value}
                                    onChange={() => void persistSettings({ customSchemeType: value as SettingsState["customSchemeType"] })}
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </div>
                    <div className="head-split-line" />
                    <div className="head-clip">
                        {[
                            ["1", "原图", "使用原始图片"],
                            ["2", "中等尺寸", "中等裁剪尺寸"],
                            ["3", "缩略图", "缩略图裁剪尺寸"],
                        ].map(([value, label, title]) => (
                            <label key={value} title={title}>
                                <input
                                    type="radio"
                                    name="clip"
                                    value={value}
                                    checked={effectiveSettings.customClipType === value}
                                    onChange={() => void persistSettings({ customClipType: value as SettingsState["customClipType"] })}
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                        <label title="自定义裁剪尺寸">
                            <input
                                type="radio"
                                name="clip"
                                value="4"
                                checked={effectiveSettings.customClipType === "4"}
                                onChange={() => void persistSettings({ customClipType: "4" })}
                            />
                            <input
                                list="custom-clip-list"
                                type="text"
                                placeholder="输入自定义尺寸或链接"
                                spellCheck={false}
                                autoComplete="on"
                                className="custom-clip"
                                value={effectiveSettings.customClipValue}
                                onFocus={() => void persistSettings({ customClipType: "4" })}
                                onChange={(event) => void persistSettings({ customClipValue: event.target.value, customClipType: "4" })}
                            />
                            <a
                                title="如何设置自定义尺寸或链接"
                                href={footerLinks.readme}
                                onClick={(event) => {
                                    event.preventDefault();
                                    void openExternalTab(
                                        "https://github.com/Semibold/Weibo-Picture-Store/blob/master/docs/custom-clip.md",
                                    );
                                }}
                            >
                                <i className="fa fa-info-circle" />
                            </a>
                        </label>
                        <datalist id="custom-clip-list">
                            <option value="wap800">800 像素宽度原比例缩放</option>
                            <option value="wap720">720 像素宽度原比例缩放</option>
                            <option value="wap360">360 像素宽度原比例缩放</option>
                            <option value="wap240">240 像素宽度原比例缩放</option>
                            <option value="wap180">180 像素宽度原比例缩放</option>
                            <option value="wap50">50 像素宽度原比例缩放</option>
                            <option value="bmiddle">440 像素宽度原比例缩放</option>
                            <option value="small">200 像素宽度原比例缩放</option>
                            <option value="thumb300">300 像素正方形裁剪</option>
                            <option value="thumb180">180 像素正方形裁剪</option>
                            <option value="thumb150">150 像素正方形裁剪</option>
                            <option value="square">80 像素正方形裁剪</option>
                        </datalist>
                    </div>
                </div>
                <div className="head-feature">
                    <a className="head-copy-mode" title="切换复制模式" data-batch={batch} onClick={() => setBatch((value) => !value)}>
                        <i className="fa fa-circle-o" />
                        <i className="fa fa-check-circle-o" />
                    </a>
                    <a
                        className="head-browsing-history"
                        title="查看上传记录"
                        href={chrome.runtime.getURL("tabs/history.html")}
                        onClick={(event) => {
                            event.preventDefault();
                            void openTab("tabs/history.html");
                        }}
                    >
                        <i className="fa fa-history" />
                    </a>
                </div>
            </div>
            <div className="legacy-popup__main">
                {currentPreviews.map((item) => (
                    <UploadSection
                        key={item.id}
                        item={item}
                        dragActive={dragActive}
                        batch={batch}
                        copiedType={copiedType}
                        onChoose={() => fileInputRef.current?.click()}
                        onCopy={handleCopy}
                    />
                ))}
            </div>
            <div className="legacy-popup__foot">
                <div className="foot-bottom">
                    <i className="fa fa-angle-double-left" />
                    <div className="foot-menu">
                        <a
                            href={footerLinks.issue}
                            title="通过GitHub反馈问题"
                            onClick={(event) => {
                                event.preventDefault();
                                void openExternalTab(footerLinks.issue);
                            }}
                        >
                            GitHub
                        </a>
                        <a
                            href={footerLinks.email}
                            title="通过电子邮件反馈问题"
                            onClick={(event) => {
                                event.preventDefault();
                                void openExternalTab(footerLinks.email);
                            }}
                        >
                            反馈
                        </a>
                        <a
                            href={footerLinks.donate}
                            title="扩展很棒，捐赠以表支持 +1s"
                            onClick={(event) => {
                                event.preventDefault();
                                void openExternalTab(footerLinks.donate);
                            }}
                        >
                            捐赠
                        </a>
                        <a
                            href={footerLinks.readme}
                            title="操作指南及更新日志"
                            onClick={(event) => {
                                event.preventDefault();
                                void openExternalTab(footerLinks.readme);
                            }}
                        >
                            更新日志
                        </a>
                    </div>
                </div>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/svg+xml,image/bmp,image/webp,image/x-icon"
                multiple
                hidden
                onChange={(event) => {
                    void queueFiles(event.target.files || [], "file-picker");
                    event.currentTarget.value = "";
                }}
            />
            <label>
                <textarea ref={transferRef} className="transfer-to-clipboard" cols={30} rows={10} />
            </label>
        </div>
    );
}
