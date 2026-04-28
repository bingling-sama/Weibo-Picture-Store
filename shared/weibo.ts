import { FEATURE_ALBUM_DESCRIPTION, NOTIFICATION_IDS, STORAGE_KEYS, type SettingsState } from "./constants";
import { Log } from "./log";
import { notify } from "./runtime";

const MAXIMUM_WEIBO_PICTURE_SIZE = 20 * 1024 * 1024 - 1;
const UNKNOWN_FILE_SIZE_RESTRICT = MAXIMUM_WEIBO_PICTURE_SIZE * 2;

const WEIBO_SUPPORTED_TYPES: Record<string, { typo: string }> = {
    "image/jpeg": { typo: ".jpg" },
    "image/png": { typo: ".jpg" },
    "image/apng": { typo: ".jpg" },
    "image/gif": { typo: ".gif" },
};

const SCHEME_MAPPING: Record<SettingsState["customSchemeType"], string> = {
    "1": "http://",
    "2": "https://",
    "3": "//",
};

const CLIP_MAPPING: Record<SettingsState["customClipType"], string> = {
    "1": "large",
    "2": "mw690",
    "3": "thumbnail",
    "4": "",
};

const IMAGE_PREFIXES = ["tvax1", "tvax2", "tvax3", "tvax4"];
const WEIBO_CDN_TEMPLATE = "https://cdn.ipfsscan.io/weibo/large/{{basename}}";
const ALBUM_CACHE_EXPIRED = 6 * 60 * 60 * 1000;
const MAXIMUM_ALBUMS = 100;
const ALBUM_OVERFLOW_CODE = 11112;

export type PackedUpload = {
    blob: Blob;
    result: ArrayBuffer;
    mimeType: string;
    pid: string;
    size?: number;
    width?: number;
    height?: number;
};

export type AssignedUpload = PackedUpload & {
    URL: string;
    HTML: string;
    UBB: string;
    Markdown: string;
};

export type WeiboAlbum = {
    albumId: string;
    uid: string;
    caption: string;
    description: string;
    timestamp: number;
    raw: unknown;
};

export type WeiboAlbumPhoto = {
    albumId: string;
    photoId: string;
    picHost: string;
    picName: string;
    updated: string;
    thumbnailUrl: string;
    originalUrl: string;
};

export type WeiboPhotoPage = {
    albumId: string;
    total: number;
    photos: WeiboAlbumPhoto[];
};

type WeiboAlbumCache = {
    uid: string;
    albumId: string;
    timestamp: number;
};

type WeiboAlbumInfo = {
    uid: string;
    albumId: string;
    albumList: WeiboAlbum[];
};

function createSearchParams(param: Record<string, unknown>, init?: string | URLSearchParams) {
    const searchParams = new URLSearchParams(init);
    for (const [key, value] of Object.entries(param)) {
        searchParams.set(key, String(value));
    }
    return searchParams;
}

function buildURL(url: string, param: Record<string, unknown>) {
    const base = new URL(url);
    base.search = createSearchParams(param, base.search).toString();
    return base.href;
}

async function fetchWithCredentials(input: RequestInfo | URL, init?: RequestInit) {
    const response = await fetch(input, {
        method: "GET",
        mode: "cors",
        credentials: "include",
        cache: "default",
        redirect: "follow",
        ...init,
    });

    if (!response.ok) {
        throw new Error(response.statusText || `HTTP ${response.status}`);
    }

    return response;
}

async function getAlbumCache(uid: string) {
    if (!uid) {
        return null;
    }

    const data = await chrome.storage.local.get({ [STORAGE_KEYS.weiboAlbumCache]: null });
    const cache = data[STORAGE_KEYS.weiboAlbumCache] as WeiboAlbumCache | null;
    if (!cache || cache.uid !== uid || !cache.albumId || Date.now() - cache.timestamp > ALBUM_CACHE_EXPIRED) {
        return null;
    }
    return cache;
}

async function setAlbumCache(cache: Omit<WeiboAlbumCache, "timestamp">) {
    if (!cache.uid || !cache.albumId) {
        return;
    }

    await chrome.storage.local.set({
        [STORAGE_KEYS.weiboAlbumCache]: {
            ...cache,
            timestamp: Date.now(),
        },
    });
}

async function clearAlbumCache() {
    await chrome.storage.local.remove(STORAGE_KEYS.weiboAlbumCache);
}

function bitmapMime(buffer: ArrayBufferLike) {
    const input = new Uint8Array(buffer);
    const startsWith = (bytes: number[]) => bytes.every((byte, index) => input[index] === byte);

    if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
    if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return "image/gif";
    if (startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif";
    if (startsWith([0x42, 0x4d])) return "image/bmp";
    if (startsWith([0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
    if (
        input[0] === 0x52 &&
        input[1] === 0x49 &&
        input[2] === 0x46 &&
        input[3] === 0x46 &&
        input[8] === 0x57 &&
        input[9] === 0x45 &&
        input[10] === 0x42 &&
        input[11] === 0x50
    ) {
        return "image/webp";
    }

    return "";
}

function filenameWithoutSuffix(filepath?: string, fallback = "image") {
    if (!filepath) {
        return fallback;
    }
    const filename = filepath.split("/").pop() || fallback;
    const segments = filename.split(".");
    return segments.length > 1 ? segments.slice(0, -1).join(".") || filename : filename;
}

function randomImageHost() {
    return `${IMAGE_PREFIXES[Math.floor(Math.random() * IMAGE_PREFIXES.length)]}.sinaimg.cn`;
}

function genExternalUrl(scheme: string, clip: string, pid: string, suffix: string) {
    return `${scheme}${randomImageHost()}/${clip || "large"}/${pid}${suffix}`;
}

function hasCustomLinkPlaceholders(value: string) {
    return /\{\{(?:pid|extname|basename)\}\}/.test(value);
}

function genCustomExternalUrl(template: string, pid: string, suffix: string) {
    return template
        .replace(/\{\{pid\}\}/g, pid)
        .replace(/\{\{extname\}\}/g, suffix)
        .replace(/\{\{basename\}\}/g, `${pid}${suffix}`);
}

function normalizePicHost(picHost: string) {
    const fallback = `https://${randomImageHost()}`;
    if (!picHost) {
        return fallback;
    }

    const withScheme = picHost.startsWith("//") ? `https:${picHost}` : picHost;
    return withScheme.replace(/^https?:\/\/\w+(?=\.)/i, `https://${randomImageHost().split(".")[0]}`);
}

function genPhotoUrl(picHost: string, clip: string, picName: string) {
    return `${normalizePicHost(picHost)}/${clip}/${picName}`;
}

function genHistoryPreviewUrl(picName: string) {
    const basename = picName.includes(".") ? picName : `${picName}.jpg`;
    return WEIBO_CDN_TEMPLATE.replace(/\{\{basename\}\}/g, basename);
}

function genCdnUrl(pid: string, suffix: string) {
    return genCustomExternalUrl(WEIBO_CDN_TEMPLATE, pid, suffix);
}

async function convertImage(blob: Blob, mimeType = "image/png", quality = 0.9): Promise<Blob> {
    if (typeof document === "undefined") {
        const bitmap = await createImageBitmap(blob);
        try {
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext("2d");
            if (!context || !bitmap.width || !bitmap.height) {
                throw new Error("图片转换失败");
            }
            context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
            return await canvas.convertToBlob({ type: mimeType, quality });
        } finally {
            bitmap.close();
        }
    }

    const objectURL = URL.createObjectURL(blob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("图片转换失败"));
            img.src = objectURL;
        });

        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) {
            throw new Error("图片转换失败");
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (nextBlob) => {
                    if (nextBlob) {
                        resolve(nextBlob);
                    } else {
                        reject(new Error("图片转换失败"));
                    }
                },
                mimeType,
                quality,
            );
        });
    } finally {
        URL.revokeObjectURL(objectURL);
    }
}

async function readUploadBlob(blob: Blob, replay = false): Promise<Pick<PackedUpload, "blob" | "result" | "mimeType">> {
    const result = await blob.arrayBuffer();
    const detectedMime = blob.type === "image/svg+xml" ? blob.type : bitmapMime(result);

    if (!WEIBO_SUPPORTED_TYPES[detectedMime] && !replay) {
        return readUploadBlob(await convertImage(blob), true);
    }

    return {
        blob,
        result,
        mimeType: detectedMime,
    };
}

async function getWatermark(settings: SettingsState) {
    if (!settings.inheritWeiboWatermark) {
        return null;
    }

    try {
        const response = await fetchWithCredentials(buildURL("https://photo.weibo.com/users/get_watermark", { __rnd: Date.now() }));
        const json = await response.json();
        if (!json || json.code !== 0 || !json.result) {
            return null;
        }

        return {
            nick: json.data.nickname,
            url: json.data.domain,
            logo: json.data.logo,
            markpos: json.data.position,
        };
    } catch (error) {
        Log.w({
            module: "getWatermark",
            error,
            remark: "读取微博水印设置失败，继续无水印上传",
        });
        return null;
    }
}

export async function requestUserId() {
    const response = await fetchWithCredentials(
        buildURL("https://login.sina.com.cn/sso/prelogin.php", {
            entry: "weibo",
            __rnd: Date.now(),
        }),
    );
    const json = await response.json();
    if (json?.retcode === 0 && json?.uid) {
        return String(json.uid);
    }
    throw new Error("无法读取微博用户 ID");
}

async function getUserStatus(notifyWhenLogout = false) {
    try {
        const response = await fetchWithCredentials(buildURL("https://weibo.com/aj/onoff/getstatus", { sid: 0 }));
        const json = await response.json();
        const login = json?.code === "100000";
        if (!login && notifyWhenLogout) {
            await notify(
                "微博未登录",
                "微博处于登出状态，单击转到微博登录页面。",
                NOTIFICATION_IDS.remainLogout,
            );
        }
        Log.d({
            module: "getUserStatus",
            remark: login ? "用户处于登录状态" : "用户处于登出状态",
        });
        return { login };
    } catch (error) {
        if (notifyWhenLogout) {
            await notify(
                "微博登录校验失败",
                "微博登录信息校验失败，单击转到微博登录页面。",
                NOTIFICATION_IDS.remainLogout,
            );
        }
        Log.e({
            module: "getUserStatus",
            error,
            remark: "请求发生错误，按登出状态处理",
        });
        return { login: false };
    }
}

async function activateLoginRedirect(srcUrl: string) {
    if (!srcUrl) {
        return;
    }

    const url = chrome.runtime.getURL(`tabs/offscreen.html?srcUrl=${encodeURIComponent(srcUrl)}`);
    const created = await chrome.windows.create({
        focused: false,
        state: "minimized",
        type: "popup",
        url,
    });
    if (created?.id) {
        globalThis.setTimeout(() => {
            void chrome.windows.remove(created.id);
        }, 5000);
    }
}

async function activateCookieLogin(notifyWhenLogout = false) {
    const current = await getUserStatus(false);
    if (current.login) {
        return current;
    }

    try {
        const response = await fetchWithCredentials("https://weibo.com/aj/onoff/setstatus", {
            method: "POST",
            body: createSearchParams({ sid: 0, state: 0 }),
        });
        if (response.redirected) {
            await activateLoginRedirect(response.url);
        }
    } catch (error) {
        Log.w({
            module: "activateCookieLogin",
            error,
            remark: "cookie 登录激活失败",
        });
    }

    return getUserStatus(notifyWhenLogout);
}

async function signInByUserAccount(settings: SettingsState) {
    if (!settings.allowUserAccount || !settings.accountUsername || !settings.accountPassword) {
        return false;
    }

    const body = createSearchParams({
        username: settings.accountUsername,
        password: settings.accountPassword,
        savestate: "1",
        r: "https://m.weibo.cn/",
        ec: "0",
        pagerefer: "https://m.weibo.cn/",
        entry: "mweibo",
        wentry: "",
        loginfrom: "",
        client_id: "",
        code: "",
        qq: "",
        mainpageflag: "1",
        hff: "",
        hfp: "",
    });
    const response = await fetchWithCredentials("https://passport.weibo.cn/sso/login", { method: "POST", body });
    const json = await response.json();

    if (json?.retcode !== 20000000) {
        if (json?.retcode === 50050011) {
            throw new Error("由于登录此账户需要两步验证，因此无法使用自动登录功能");
        }
        throw new Error(json?.msg || "微博登录失败");
    }

    if (json?.data?.loginresulturl) {
        await fetchWithCredentials(json.data.loginresulturl);
    }

    return true;
}

async function requestSignIn(settings: SettingsState, notifyWhenLogout = false) {
    const activated = await activateCookieLogin(notifyWhenLogout);
    if (activated.login) {
        return activated;
    }

    if (settings.allowUserAccount && settings.accountUsername && settings.accountPassword) {
        try {
            await signInByUserAccount(settings);
            return getUserStatus(notifyWhenLogout);
        } catch (error) {
            Log.w({
                module: "requestSignIn",
                error,
                remark: "账号密码登录失败",
            });
            if (notifyWhenLogout) {
                await notify("微博登录失败", "请检查微博账户信息，或单击转到微博登录页面。", NOTIFICATION_IDS.remainLogout);
            }
        }
    } else if (notifyWhenLogout) {
        await notify("微博未登录", "请先登录微博，或在选项页配置账号密码登录。", NOTIFICATION_IDS.remainLogout);
    }

    return { login: false };
}

async function uploadPackedItem(item: Pick<PackedUpload, "blob" | "result" | "mimeType">, settings: SettingsState, replay = false): Promise<PackedUpload> {
    const watermark = await getWatermark(settings);
    const param = {
        s: "xml",
        ori: "1",
        data: "1",
        rotate: "0",
        wm: "",
        app: "miniblog",
        mime: item.mimeType,
        ...(watermark || {}),
    };
    const url = buildURL("https://picupload.weibo.com/interface/pic_upload.php", param);
    const response = await fetchWithCredentials(url, {
        method: "POST",
        body: item.result,
    });
    const text = await response.text();
    const pid = text.match(/<pid>(.*?)<\/pid>/)?.[1] || "";
    const size = Number(text.match(/<size>(.*?)<\/size>/)?.[1] || 0) || undefined;
    const width = Number(text.match(/<width>(.*?)<\/width>/)?.[1] || 0) || undefined;
    const height = Number(text.match(/<height>(.*?)<\/height>/)?.[1] || 0) || undefined;

    if (!pid) {
        if (!replay && (await requestSignIn(settings, true)).login) {
            return uploadPackedItem(item, settings, true);
        }
        Log.e({
            module: "uploadPackedItem",
            error: text,
            remark: "微博上传失败，未返回图片 pid",
        });
        throw new Error("微博上传失败，未返回图片 pid");
    }

    void tryAttachPhotoToAlbum(pid);

    return {
        ...item,
        pid,
        size,
        width,
        height,
    };
}

async function checkoutSpecialAlbum(): Promise<WeiboAlbumInfo> {
    const albums = await requestWeiboAlbums();
    const specialAlbums = albums
        .filter((album) => album.description === FEATURE_ALBUM_DESCRIPTION)
        .sort((left, right) => right.timestamp - left.timestamp);
    const album = specialAlbums[0];

    if (album?.albumId && album.uid) {
        Log.d({
            module: "checkoutSpecialAlbum",
            remark: "检出指定的微相册成功",
        });
        return {
            uid: album.uid,
            albumId: album.albumId,
            albumList: specialAlbums,
        };
    }

    if (albums.length >= MAXIMUM_ALBUMS) {
        throw new Error("不能创建微相册：账号相册数量已满");
    }

    return createSpecialAlbum();
}

async function createSpecialAlbum(): Promise<WeiboAlbumInfo> {
    const date = new Date();
    const response = await fetchWithCredentials(
        "https://photo.weibo.com/albums/create",
        {
            method: "POST",
            body: createSearchParams({
                property: 2,
                caption: `Weibo_Chrome_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
                description: FEATURE_ALBUM_DESCRIPTION,
                answer: "",
                question: "",
                album_id: "",
            }),
        },
    );
    const json = await response.json();
    if (!json?.result || !json?.data?.album_id) {
        Log.e({
            module: "createSpecialAlbum",
            error: json,
            remark: "创建微相册失败",
        });
        throw new Error("创建微相册失败");
    }

    const info = {
        uid: String(json.data.uid || ""),
        albumId: String(json.data.album_id),
        albumList: [] as WeiboAlbum[],
    };
    await setAlbumCache(info);
    Log.d({
        module: "createSpecialAlbum",
        remark: `创建微相册成功：${info.albumId}`,
    });
    return info;
}

async function requestSpecialAlbumInfo(forceCreate = false): Promise<WeiboAlbumInfo> {
    if (!forceCreate) {
        const uid = await requestUserId().catch(() => "");
        const cache = await getAlbumCache(uid);
        if (cache) {
            return {
                uid: cache.uid,
                albumId: cache.albumId,
                albumList: [],
            };
        }
    }

    const info = forceCreate ? await createSpecialAlbum() : await checkoutSpecialAlbum();
    await setAlbumCache(info);
    return info;
}

async function attachPhotoToAlbum(pid: string, replay = false) {
    const info = await requestSpecialAlbumInfo(replay);
    const response = await fetchWithCredentials("https://photo.weibo.com/upload/photo", {
        method: "POST",
        body: createSearchParams({
            pid,
            isOrig: 1,
            album_id: info.albumId,
        }),
    });
    const json = await response.json();
    if (!replay && json?.code === ALBUM_OVERFLOW_CODE) {
        await clearAlbumCache();
        return attachPhotoToAlbum(pid, true);
    }
    if (!json?.result && json?.code !== 0) {
        throw new Error(json?.msg || "同步到微相册失败");
    }
}

async function tryAttachPhotoToAlbum(pid: string) {
    try {
        await attachPhotoToAlbum(pid);
    } catch (error) {
        Log.w({
            module: "attachPhotoToAlbum",
            error,
            remark: "上传成功，但同步到微相册失败",
        });
    }
}

export async function uploadWeiboImage(blob: Blob, settings: SettingsState, fileName?: string): Promise<AssignedUpload> {
    if (blob.size > UNKNOWN_FILE_SIZE_RESTRICT) {
        throw new Error("文件大小超出约束范围");
    }

    const item = await readUploadBlob(blob);
    if (!WEIBO_SUPPORTED_TYPES[item.mimeType]) {
        throw new Error("文件类型超出约束范围");
    }
    if (item.blob.size > MAXIMUM_WEIBO_PICTURE_SIZE) {
        throw new Error("文件大小超过 20MB");
    }

    const uploaded = await uploadPackedItem(item, settings);
    return assignWeiboLinks(uploaded, settings, fileName);
}

export async function requestWeiboAlbums(): Promise<WeiboAlbum[]> {
    const count = 100;
    const albums: WeiboAlbum[] = [];
    let total = Infinity;

    for (let page = 1; albums.length < total; page++) {
        const response = await fetchWithCredentials(
            buildURL("https://photo.weibo.com/albums/get_all", {
                page,
                count,
                __rnd: Date.now(),
            }),
        );
        const json = await response.json();
        if (!json?.result || !Array.isArray(json?.data?.album_list)) {
            throw new Error("无法读取微相册");
        }

        const albumList = json.data.album_list as any[];
        total = Math.max(Number(json.data.total) || 0, albumList.length);
        albums.push(
            ...albumList.map((item) => ({
                albumId: String(item.album_id || ""),
                uid: String(item.uid || ""),
                caption: String(item.caption || item.album_name || item.name || ""),
                description: String(item.description || ""),
                timestamp: Number(item.timestamp) || 0,
                raw: item,
            })),
        );

        if (!albumList.length || albumList.length < count) {
            break;
        }
    }

    return albums
        .filter((album) => album.albumId)
        .sort((left, right) => right.timestamp - left.timestamp);
}

export async function requestWeiboPhotos(albumId: string, page = 1, count = 50): Promise<WeiboPhotoPage> {
    const response = await fetchWithCredentials(
        buildURL("https://photo.weibo.com/photos/get_all", {
            page,
            count,
            album_id: albumId,
            __rnd: Date.now(),
        }),
    );
    const json = await response.json();
    if (!json?.result || !Array.isArray(json?.data?.photo_list)) {
        throw new Error("无法读取微相册图片");
    }

    const photoList = json.data.photo_list as any[];
    return {
        albumId: String(json.data.album_id || albumId),
        total: Number(json.data.total) || photoList.length,
        photos: photoList
            .map((item) => {
                const picHost = String(item.pic_host || "");
                const picName = String(item.pic_name || "");
                return {
                    albumId: String(item.album_id || json.data.album_id || albumId),
                    photoId: String(item.photo_id || ""),
                    picHost,
                    picName,
                    updated: String(item.updated_at || ""),
                    thumbnailUrl: genHistoryPreviewUrl(picName),
                    originalUrl: genHistoryPreviewUrl(picName),
                };
            })
            .filter((photo) => photo.albumId && photo.photoId && photo.picName),
    };
}

export async function requestAllWeiboPhotos(
    albums: WeiboAlbum[],
    onAlbumLoaded?: (album: WeiboAlbum, photos: WeiboAlbumPhoto[]) => void,
) {
    const count = 50;
    const allPhotos: WeiboAlbumPhoto[] = [];

    for (const album of albums) {
        const albumPhotos: WeiboAlbumPhoto[] = [];
        let total = Infinity;
        for (let page = 1; albumPhotos.length < total; page++) {
            const result = await requestWeiboPhotos(album.albumId, page, count);
            total = result.total;
            albumPhotos.push(...result.photos);
            if (!result.photos.length || result.photos.length < count) {
                break;
            }
        }
        allPhotos.push(...albumPhotos);
        onAlbumLoaded?.(album, albumPhotos);
    }

    return allPhotos;
}

export async function deleteWeiboPhotosFromAlbum(photoIds: string[], albumId: string) {
    if (!photoIds.length || !albumId) {
        return;
    }

    const response = await fetchWithCredentials("https://photo.weibo.com/albums/delete_batch", {
        method: "POST",
        body: createSearchParams({
            album_id: albumId,
            photo_id: photoIds.join(","),
        }),
    });
    const json = await response.json();
    if (!json?.result) {
        throw new Error("移除微相册图片失败");
    }
}

export function assignWeiboLinks(uploaded: PackedUpload, settings: SettingsState, fileName?: string): AssignedUpload {
    const scheme = SCHEME_MAPPING[settings.customSchemeType] || SCHEME_MAPPING["2"];
    const clip = settings.customClipType === "4" ? settings.customClipValue : CLIP_MAPPING[settings.customClipType];
    const suffix = WEIBO_SUPPORTED_TYPES[uploaded.mimeType].typo;
    const url = hasCustomLinkPlaceholders(clip)
        ? genCustomExternalUrl(clip, uploaded.pid, suffix)
        : genCdnUrl(uploaded.pid, suffix);
    const filename = filenameWithoutSuffix(fileName);

    return {
        ...uploaded,
        URL: url,
        HTML:
            uploaded.width && uploaded.height && (clip || "large") === "large"
                ? `<img src="${url}" alt="${filename}" width="${uploaded.width}" data-width="${uploaded.width}" data-height="${uploaded.height}">`
                : `<img src="${url}" alt="${filename}">`,
        UBB: `[IMG]${url}[/IMG]`,
        Markdown: `![${filename}](${url})`,
    };
}
