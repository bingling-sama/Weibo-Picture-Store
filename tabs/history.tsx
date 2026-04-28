import { useEffect, useMemo, useState } from "react";

import "../legacy-ui.css";
import iconUrl from "data-base64:~assets/icon.png";

import {
    deleteWeiboPhotosFromAlbum,
    requestAllWeiboPhotos,
    requestWeiboAlbums,
    requestWeiboPhotos,
    type WeiboAlbum,
    type WeiboAlbumPhoto,
} from "../shared/weibo";

type LoadStatus = "loading" | "ready" | "failed";

function updatedTimestamp(photo: WeiboAlbumPhoto) {
    const parsed = Date.parse(photo.updated);
    return Number.isFinite(parsed) ? parsed : 0;
}

function sortPhotos(photos: WeiboAlbumPhoto[]) {
    return photos.slice().sort((left, right) => updatedTimestamp(right) - updatedTimestamp(left));
}

async function requestWholeAlbum(album: Pick<WeiboAlbum, "albumId">) {
    const count = 50;
    const photos: WeiboAlbumPhoto[] = [];
    let total = Infinity;

    for (let page = 1; photos.length < total; page++) {
        const result = await requestWeiboPhotos(album.albumId, page, count);
        total = result.total;
        photos.push(...result.photos);
        if (!result.photos.length || result.photos.length < count) {
            break;
        }
    }

    return photos;
}

function getAlbumTitle(album?: WeiboAlbum) {
    if (!album) {
        return "全部微相册";
    }
    return album.caption || `相册 ${album.albumId}`;
}

function History() {
    const [albums, setAlbums] = useState<WeiboAlbum[]>([]);
    const [photos, setPhotos] = useState<WeiboAlbumPhoto[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [removingIds, setRemovingIds] = useState<string[]>([]);
    const [status, setStatus] = useState<LoadStatus>("loading");
    const [message, setMessage] = useState("正在读取微相册");
    const [activeAlbumId, setActiveAlbumId] = useState(() => new URLSearchParams(location.search).get("album_id") || "");

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setStatus("loading");
            setMessage(activeAlbumId ? "正在读取微相册图片" : "正在读取全部微相册");
            setPhotos([]);
            setSelectedIds([]);

            try {
                const nextAlbums = await requestWeiboAlbums();
                if (cancelled) return;
                setAlbums(nextAlbums);

                if (activeAlbumId) {
                    const album = nextAlbums.find((item) => item.albumId === activeAlbumId) || { albumId: activeAlbumId };
                    const nextPhotos = await requestWholeAlbum(album);
                    if (cancelled) return;
                    setPhotos(sortPhotos(nextPhotos));
                } else {
                    await requestAllWeiboPhotos(nextAlbums, (album, albumPhotos) => {
                        if (cancelled) return;
                        setMessage(`正在读取：${getAlbumTitle(album)}`);
                        setPhotos((current) => sortPhotos([...current, ...albumPhotos]));
                    });
                }

                if (cancelled) return;
                setStatus("ready");
                setMessage("");
            } catch (error) {
                if (cancelled) return;
                setStatus("failed");
                setMessage(error instanceof Error ? error.message : "获取图片失败");
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [activeAlbumId]);

    const activeAlbum = useMemo(
        () => albums.find((album) => album.albumId === activeAlbumId),
        [activeAlbumId, albums],
    );

    const activeAlbumIndex = useMemo(
        () => albums.findIndex((album) => album.albumId === activeAlbumId),
        [activeAlbumId, albums],
    );

    const prevAlbum = activeAlbumIndex > 0 ? albums[activeAlbumIndex - 1] : null;
    const nextAlbum = activeAlbumIndex >= 0 && activeAlbumIndex < albums.length - 1 ? albums[activeAlbumIndex + 1] : null;
    const leadHref = activeAlbumId
        ? `https://photo.weibo.com/albums/detail/album_id/${activeAlbumId}/`
        : "https://photo.weibo.com/albums";

    const navigateAlbum = (albumId: string) => {
        const url = new URL(location.href);
        if (albumId) {
            url.searchParams.set("album_id", albumId);
        } else {
            url.searchParams.delete("album_id");
        }
        history.replaceState(null, "", `${url.pathname}${url.search}`);
        setActiveAlbumId(albumId);
    };

    const toggleSelected = (id: string) => {
        setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    };

    const removePhoto = async (photo: WeiboAlbumPhoto) => {
        setRemovingIds((current) => [...current, photo.photoId]);
        try {
            await deleteWeiboPhotosFromAlbum([photo.photoId], photo.albumId);
            setPhotos((current) => current.filter((item) => item.photoId !== photo.photoId));
            setSelectedIds((current) => current.filter((id) => id !== photo.photoId));
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "移除文件没有成功");
            setStatus("failed");
        } finally {
            setRemovingIds((current) => current.filter((id) => id !== photo.photoId));
        }
    };

    const removeSelectedPhotos = async () => {
        const selected = photos.filter((photo) => selectedIds.includes(photo.photoId));
        if (!selected.length) {
            return;
        }

        setRemovingIds((current) => [...current, ...selected.map((photo) => photo.photoId)]);
        try {
            const byAlbum = new Map<string, string[]>();
            for (const photo of selected) {
                byAlbum.set(photo.albumId, [...(byAlbum.get(photo.albumId) || []), photo.photoId]);
            }

            for (const [albumId, photoIds] of byAlbum) {
                await deleteWeiboPhotosFromAlbum(photoIds, albumId);
            }

            const removed = new Set(selected.map((photo) => photo.photoId));
            setPhotos((current) => current.filter((photo) => !removed.has(photo.photoId)));
            setSelectedIds([]);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "批量移除文件没有成功");
            setStatus("failed");
        } finally {
            const removed = new Set(selected.map((photo) => photo.photoId));
            setRemovingIds((current) => current.filter((id) => !removed.has(id)));
        }
    };

    return (
        <div className="legacy-history">
            <div className="legacy-history__head">
                <h1>
                    <span>
                        <i className="fa fa-paragraph" />
                    </span>
                    <span>上传记录 - {getAlbumTitle(activeAlbum)}</span>
                    <span>
                        <a
                            className="navi-prev"
                            data-disabled={String(!prevAlbum)}
                            title={prevAlbum ? `之前的相册：${getAlbumTitle(prevAlbum)}` : "之前的相册"}
                            onClick={(event) => {
                                event.preventDefault();
                                if (prevAlbum) navigateAlbum(prevAlbum.albumId);
                            }}
                        >
                            <i className="fa fa-chevron-left" />
                        </a>
                        <a
                            className="navi-lead"
                            data-disabled="false"
                            title="前往微相册管理相册中的图片(外部链接)"
                            href={leadHref}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <i className="fa fa-picture-o" />
                        </a>
                        <a
                            className="navi-next"
                            data-disabled={String(activeAlbumId ? !nextAlbum : !albums.length)}
                            title={
                                activeAlbumId
                                    ? nextAlbum
                                        ? `往后的相册：${getAlbumTitle(nextAlbum)}`
                                        : "往后的相册"
                                    : "查看最新相册"
                            }
                            onClick={(event) => {
                                event.preventDefault();
                                const targetAlbum = activeAlbumId ? nextAlbum : albums[0];
                                if (targetAlbum) navigateAlbum(targetAlbum.albumId);
                            }}
                        >
                            <i className="fa fa-chevron-right" />
                        </a>
                        <a
                            className="navi-delete"
                            data-disabled={String(!selectedIds.length)}
                            title={selectedIds.length ? `移除已选中的 ${selectedIds.length} 张图片` : "Ctrl/Command 点击图片可批量选择"}
                            onClick={(event) => {
                                event.preventDefault();
                                void removeSelectedPhotos();
                            }}
                        >
                            <i className="fa fa-trash-o" />
                        </a>
                    </span>
                </h1>
            </div>
            <div className="legacy-history__main">
                {photos.length ? (
                    photos.map((photo) => (
                        <section
                            key={`${photo.albumId}:${photo.photoId}`}
                            data-selected={selectedIds.includes(photo.photoId)}
                            data-removing={removingIds.includes(photo.photoId)}
                        >
                            <div className="image-body">
                                <a
                                    className="image-remove"
                                    title="从微相册移除当前文件"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        void removePhoto(photo);
                                    }}
                                >
                                    <i className="fa fa-trash-o" />
                                </a>
                                <a
                                    className="image-linker"
                                    title="点击查看原图，Ctrl/Command 点击可选中"
                                    target="_blank"
                                    href={photo.originalUrl}
                                    onClick={(event) => {
                                        if (event.ctrlKey || event.metaKey) {
                                            event.preventDefault();
                                            toggleSelected(photo.photoId);
                                        }
                                    }}
                                    rel="noreferrer"
                                >
                                    <img
                                        src={photo.thumbnailUrl}
                                        alt="preview"
                                        onError={(event) => {
                                            event.currentTarget.src = iconUrl;
                                        }}
                                    />
                                </a>
                            </div>
                            <div className="image-label">
                                <span className="image-update" title={`相册 ${photo.albumId}`}>
                                    {photo.updated || photo.photoId}
                                </span>
                            </div>
                        </section>
                    ))
                ) : status === "loading" ? (
                    <div className="legacy-history__loading">{message}</div>
                ) : (
                    <div className="legacy-history__empty">{status === "failed" ? message : "没有分页数据，欸嘿~"}</div>
                )}
            </div>
            {status === "loading" && photos.length ? <div className="legacy-history__loading">{message}</div> : null}
            <div className="legacy-history__foot">
                <div className="foot-bottom">
                    <div className="foot-line" />
                    <div className="foot-menu">
                        <a href="https://github.com/Semibold/Weibo-Picture-Store/issues" target="_blank" title="通过GitHub反馈问题" rel="noreferrer">
                            GitHub
                        </a>
                        <a href="mailto:i@hub.moe" title="通过电子邮件反馈问题">
                            反馈
                        </a>
                        <a href="https://www.hub.moe/blackboard/donate.html" target="_blank" title="扩展很棒，捐赠以表支持 +1s" rel="noreferrer">
                            捐赠
                        </a>
                        <a href="https://github.com/Semibold/Weibo-Picture-Store#readme" target="_blank" title="操作指南及更新日志" rel="noreferrer">
                            更新日志
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default History;
