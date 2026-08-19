import { useCallback, useEffect, useRef, useState } from "react";

import { addMediaDownloadTask, getMediaDownloadStatus, mediaDownloadFileUrl } from "@/services/api/coocaa-media";

type SaveFileWriter = {
    write: (chunk: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
};

type SaveFileHandle = { createWritable: () => Promise<SaveFileWriter> };
type SaveFilePickerWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveFileHandle> };

export type MediaDownloadProgress = {
    stage: "idle" | "preparing" | "saving" | "completed" | "failed" | "canceled";
    received: number;
    total: number;
    title: string;
    error: string;
    serverState: "queued" | "downloading" | "unknown" | "";
    queuedSeconds: number;
    downloadingSeconds: number;
    estimatedSeconds: number;
    priority: number | null;
};

const idleProgress: MediaDownloadProgress = { stage: "idle", received: 0, total: 0, title: "", error: "", serverState: "", queuedSeconds: 0, downloadingSeconds: 0, estimatedSeconds: 0, priority: null };
const PREPARE_POLL_INTERVAL = 2000;

export function useMediaDownload(apiBaseUrl: string) {
    const abortRef = useRef<AbortController>();
    const [progress, setProgress] = useState<MediaDownloadProgress>(idleProgress);

    useEffect(() => () => abortRef.current?.abort(), []);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        setProgress((current) => current.stage === "preparing" || current.stage === "saving" ? { ...current, stage: "canceled" } : current);
    }, []);

    const download = useCallback(async (input: { coocaaVId: string; coocaaMId: string; title: string }) => {
        if (abortRef.current) return;
        let fileHandle: SaveFileHandle;
        const { coocaaVId, coocaaMId } = input;
        const title = input.title.trim() || "影视原片";
        try {
            fileHandle = await selectSaveFile(`${safeFileName(title)}.mp4`);
        } catch (error) {
            if (!isAbortError(error)) setProgress({ ...idleProgress, stage: "failed", title, error: errorMessage(error) });
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        setProgress({ ...idleProgress, stage: "preparing", title });
        try {
            let queuedSince = 0;
            let downloadingSince = 0;
            const showPreparingStatus = (status: Awaited<ReturnType<typeof getMediaDownloadStatus>>) => {
                const now = Date.now();
                const serverState = status.isDownload === 1 ? "downloading" : status.isDownload === 0 ? "queued" : "unknown";
                if (serverState === "queued" && !queuedSince) queuedSince = now;
                if (serverState === "downloading" && !downloadingSince) downloadingSince = now;
                setProgress((current) => ({ ...current, stage: "preparing", title: status.movieTitle || title, serverState, queuedSeconds: queuedSince ? Math.floor((now - queuedSince) / 1000) : 0, downloadingSeconds: downloadingSince ? Math.floor((now - downloadingSince) / 1000) : 0, estimatedSeconds: status.estimatedTime || 0, priority: status.priority }));
            };
            let status = await getMediaDownloadStatus(apiBaseUrl, { coocaaVId, coocaaMId, signal: controller.signal });
            if (status.isDownload === 3) throw new Error(status.failureReason || "媒资服务准备原片失败");
            if (status.isDownload !== 2 || !status.mediumUrl) {
                if (status.isDownload !== 1) status = await addMediaDownloadTask(apiBaseUrl, { coocaaVId: status.coocaaVId, coocaaMId: status.coocaaMId, priority: 80, signal: controller.signal });
                showPreparingStatus(status);
                if (status.isDownload === 3) throw new Error(status.failureReason || "媒资服务准备原片失败");
                if (status.isDownload !== 2 || !status.mediumUrl) status = await waitForReadyMedia(apiBaseUrl, status.coocaaVId, status.coocaaMId, controller.signal, showPreparingStatus);
            }
            if (!status.mediumUrl) throw new Error("媒资原片尚未准备好");
            setProgress({ ...idleProgress, stage: "saving", title: status.movieTitle || title });
            await saveMediaFile(mediaDownloadFileUrl({ coocaaVId: status.coocaaVId, coocaaMId: status.coocaaMId }), fileHandle, controller.signal, (received, total) => setProgress({ ...idleProgress, stage: "saving", received, total, title: status.movieTitle || title }));
            setProgress({ ...idleProgress, stage: "completed", title: status.movieTitle || title });
        } catch (error) {
            if (!isAbortError(error)) setProgress({ ...idleProgress, stage: "failed", title, error: errorMessage(error) });
        } finally {
            if (abortRef.current === controller) abortRef.current = undefined;
        }
    }, [apiBaseUrl]);

    return { progress, download, cancel, downloading: progress.stage === "preparing" || progress.stage === "saving" };
}

async function selectSaveFile(suggestedName: string) {
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (!picker) throw new Error("当前浏览器不支持选择保存位置，请使用最新版 Chrome 或 Edge");
    return picker({ suggestedName, types: [{ description: "MP4 视频", accept: { "video/mp4": [".mp4"] } }] });
}

async function waitForReadyMedia(baseUrl: string, coocaaVId: string, coocaaMId: string, signal: AbortSignal, onStatus: (status: Awaited<ReturnType<typeof getMediaDownloadStatus>>) => void) {
    for (;;) {
        await wait(PREPARE_POLL_INTERVAL, signal);
        const status = await getMediaDownloadStatus(baseUrl, { coocaaVId, coocaaMId, signal });
        onStatus(status);
        if (status.isDownload === 3) throw new Error(status.failureReason || "媒资服务准备原片失败");
        if (status.isDownload === 2 && status.mediumUrl) return status;
    }
}

async function saveMediaFile(url: string, fileHandle: SaveFileHandle, signal: AbortSignal, onProgress: (received: number, total: number) => void) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`原片下载失败（${response.status}）`);
    if (!response.body) throw new Error("浏览器未返回可读取的视频数据");
    const total = Number(response.headers.get("Content-Length")) || 0;
    const reader = response.body.getReader();
    const writer = await fileHandle.createWritable();
    let received = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            await writer.write(value);
            received += value.byteLength;
            onProgress(received, total);
        }
        if (!received) throw new Error("原片下载为空");
        await writer.close();
    } catch (error) {
        await writer.abort().catch(() => undefined);
        throw error;
    }
}

function wait(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(done, ms);
        const onAbort = () => finish(() => reject(new DOMException("下载已取消", "AbortError")));
        function done() { finish(resolve); }
        function finish(callback: () => void) {
            window.clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            callback();
        }
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "影视原片";
}

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "原片下载失败";
}
