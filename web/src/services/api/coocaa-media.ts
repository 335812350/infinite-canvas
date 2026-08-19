export type CoocaaMediaRuntimeConfig = {
    baseUrl: string;
    headersText: string;
    devInfoText: string;
};

export const COOCAA_SEARCH_V4_URL = "https://movie-tc.skysrt.com/v2/search/v4.0";
const COOCAA_DOWNLOAD_SEGMENTS_URL = "/api/coocaa/segments/v2/getVideoSegmentList";
const COOCAA_DOWNLOAD_FILE_URL = "/api/coocaa/file";

export type CoocaaMediaSearchInput = {
    keyword: string;
    versionType?: 0 | 1;
    businessType?: "0" | "1" | "-1";
    categoryName?: "ALL" | "VIDEO" | "CHIDREN" | "PEIBAN" | "OTHER";
    userSourceSign?: string;
    signal?: AbortSignal;
};

export type CoocaaMediaImage = {
    url: string;
    style: string;
    size: string;
};

export type CoocaaPlaybackSource = {
    id: string;
    source: string;
    sourceName: string;
    url: string;
    urlType: string;
    streamType: string;
    streamInfo: string;
};

export type CoocaaMediaAsset = {
    id: string;
    title: string;
    subtitle: string;
    nodeType?: string;
    videoType: string;
    businessType: string;
    categoryId: string;
    categoryName: string;
    score: string;
    description: string;
    tagName: string;
    totalSegments: number;
    currentSegments: number;
    isPlayable: boolean;
    thirdSource: string;
    images: CoocaaMediaImage[];
    posterUrl: string;
    playSources: CoocaaPlaybackSource[];
    raw: Record<string, unknown>;
};

export type CoocaaMediaSearchGroup = {
    itemType: number | null;
    name: string;
    subName: string;
    subTitle: string;
    uiType: string;
    lightTitle: string;
    items: CoocaaMediaAsset[];
};

export type CoocaaMediaSearchResult = {
    total: number;
    pageIndex: number;
    lastPage: boolean;
    groups: CoocaaMediaSearchGroup[];
    items: CoocaaMediaAsset[];
    raw: Record<string, unknown>;
};

export type CoocaaMediaDetail = {
    id: string;
    baseInfo: Record<string, unknown>;
    playSources: CoocaaPlaybackSource[];
    assignPlaySources: CoocaaPlaybackSource[];
    attachSources: CoocaaPlaybackSource[];
    raw: Record<string, unknown>;
};

export type CoocaaMediaSegment = CoocaaMediaAsset & {
    segmentIndex: number | null;
    varietyPeriod: string;
    coocaaMId: string;
};

export type CoocaaMediaSegmentResult = {
    total: number;
    pageIndex: number;
    lastPage: boolean;
    segments: CoocaaMediaSegment[];
    raw: Record<string, unknown>;
};

export type MediaSearchItem = {
    id: string;
    title: string;
    subtitle: string;
    category: string;
    tag: string;
    source: string;
    image: string;
    episodeCount: number;
    playable: boolean;
    nodeType?: string;
};

export type MediaPlaySource = CoocaaPlaybackSource;

export type MediaSegment = MediaSearchItem & {
    index: number | null;
    playSources: MediaPlaySource[];
    coocaaMId: string;
};

export type MediaDetail = MediaSearchItem & {
    status: number | null;
    playSources: MediaPlaySource[];
    highEnergySources: MediaPlaySource[];
    trailerSources: MediaPlaySource[];
    shouldLoadSegments: boolean;
    segments: MediaSegment[];
};

export type MediaDownloadStatus = {
    coocaaVId: string;
    coocaaMId: string;
    movieTitle: string;
    resolution: string;
    duration: number | null;
    createdAt: string;
    priority: number | null;
    estimatedTime: number | null;
    mediumUrl: string;
    isDownload: 0 | 1 | 2 | 3 | null;
    failureReason: string;
};

type CoocaaEnvelope = { code?: number; msg?: unknown; message?: unknown; error?: unknown; data?: unknown };

export class CoocaaMediaApiError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly payload?: unknown,
    ) {
        super(message);
        this.name = "CoocaaMediaApiError";
    }
}

export function parseCoocaaHeaders(value: string): Record<string, string> {
    const parsed = parseJsonObject(value, "请求头");
    return Object.fromEntries(
        Object.entries(parsed).map(([key, headerValue]) => {
            if (typeof headerValue !== "string" && typeof headerValue !== "number" && typeof headerValue !== "boolean") {
                throw new Error(`请求头 ${key} 必须是字符串、数字或布尔值`);
            }
            return [key, String(headerValue)];
        }),
    );
}

export function parseCoocaaDevInfo(value: string): Record<string, unknown> {
    return parseJsonObject(value, "设备信息");
}

export async function searchCoocaaMedia(config: CoocaaMediaRuntimeConfig, input: CoocaaMediaSearchInput): Promise<CoocaaMediaSearchResult> {
    const keyword = input.keyword.trim();
    if (!keyword) throw new Error("请输入片名、节目或关键词");
    const data = await postCoocaa<CoocaaEnvelope>(config, "/v2/pt/search", {
        keyword,
        version_type: input.versionType ?? 0,
        ...(input.businessType ? { business_type: input.businessType } : {}),
        ...(input.categoryName ? { category_name: input.categoryName } : {}),
        ...(input.userSourceSign ? { user_source_sign: input.userSourceSign } : {}),
    }, input.signal);
    const response = objectValue(data.data);
    const videoInfo = objectValue(response.video_info);
    const groups = arrayValue(videoInfo.category_type_list).map((group) => ({
        itemType: numberValue(group.item_type),
        name: stringValue(group.name),
        subName: stringValue(group.sub_name),
        subTitle: stringValue(group.sub_title),
        uiType: stringValue(group.ui_type),
        lightTitle: stringValue(group.light_title),
        items: arrayValue(group.video_list).map(normalizeMediaAsset),
    }));
    const directItems = arrayValue(videoInfo.video_list).map(normalizeMediaAsset);
    const items = groups.flatMap((group) => group.items);
    const fallbackItems = items.length ? items : directItems;
    return {
        total: numberValue(response.total) ?? fallbackItems.length,
        pageIndex: numberValue(response.page_index) ?? 0,
        lastPage: booleanValue(response.last_page),
        groups,
        items: fallbackItems,
        raw: response,
    };
}

export async function getCoocaaMediaDetail(config: CoocaaMediaRuntimeConfig, input: { id: string; vuId?: string; nodeType?: string; signal?: AbortSignal }): Promise<CoocaaMediaDetail> {
    const id = input.id.trim();
    if (!id) throw new Error("缺少媒资 ID");
    const envelope = await postCoocaa<CoocaaEnvelope>(config, "/v2/pt/getVideoDetail", {
        id,
        ...(input.vuId ? { vu_id: input.vuId } : {}),
        ...(input.nodeType ? { node_type: input.nodeType } : {}),
    }, input.signal);
    const raw = objectValue(envelope.data);
    const baseInfo = objectValue(raw.base_info);
    const controlInfo = objectValue(raw.control_info);
    return {
        id: stringValue(baseInfo.id) || id,
        baseInfo,
        playSources: normalizePlaybackSources(controlInfo.play_sources),
        assignPlaySources: normalizePlaybackSources(controlInfo.assign_play_sources),
        attachSources: normalizePlaybackSources(controlInfo.attach_sources),
        raw,
    };
}

export async function getCoocaaMediaSegments(
    config: CoocaaMediaRuntimeConfig,
    input: { id: string; pageIndex?: number; pageSize?: number; nodeType?: string; signal?: AbortSignal },
): Promise<CoocaaMediaSegmentResult> {
    const id = input.id.trim();
    if (!id) throw new Error("缺少媒资 ID");
    const envelope = await postCoocaa<CoocaaEnvelope>(config, "/v2/pt/getVideoSegmentList", {
        id,
        page_index: input.pageIndex ?? 0,
        page_size: input.pageSize ?? 30,
        ...(input.nodeType ? { node_type: input.nodeType } : {}),
    }, input.signal);
    const raw = objectValue(envelope.data);
    return {
        total: numberValue(raw.total) ?? 0,
        pageIndex: numberValue(raw.page_index) ?? 0,
        lastPage: booleanValue(raw.last_page),
        segments: arrayValue(raw.segments).map((segment) => ({ ...normalizeMediaAsset(segment), segmentIndex: numberValue(segment.segment_index), varietyPeriod: stringValue(segment.variety_period), coocaaMId: stringValue(segment.coocaa_m_id) })),
        raw,
    };
}

export function resolveFirstPlayableSource(value: CoocaaMediaDetail | CoocaaMediaAsset | CoocaaMediaSegment | readonly CoocaaPlaybackSource[] | null | undefined): CoocaaPlaybackSource | null {
    let sources: readonly CoocaaPlaybackSource[] = [];
    if (Array.isArray(value)) sources = value;
    else if (value && "assignPlaySources" in value) sources = [...value.playSources, ...value.assignPlaySources, ...value.attachSources];
    else if (value) sources = (value as CoocaaMediaAsset).playSources;
    return sources.find((source) => /^https?:\/\//i.test(source.url)) || null;
}

export function mediaApiReady(config: CoocaaMediaRuntimeConfig) {
    try {
        const headers = parseCoocaaHeaders(config.headersText);
        return Boolean(config.baseUrl.trim()) && ["source", "cVaid", "cOpenId", "cLicense", "cResolution", "cPkg", "partnerCode"].every((key) => headers[key]?.trim());
    } catch {
        return false;
    }
}

export async function searchMedia(keyword: string, signal?: AbortSignal): Promise<MediaSearchItem[]> {
    const result = await searchCoocaaMediaV4(keyword, signal);
    return result.items.map(toMediaSearchItem);
}

export async function getMediaDetail(config: CoocaaMediaRuntimeConfig, id: string, nodeType?: string, signal?: AbortSignal): Promise<MediaDetail> {
    const detail = await getCoocaaMediaDetail(config, { id, nodeType, signal });
    const controlInfo = objectValue(detail.raw.control_info);
    const requestAction = controlInfo.requset_action ?? controlInfo.request_action;
    const base = normalizeMediaAsset(detail.baseInfo);
    return {
        ...toMediaSearchItem(base),
        status: numberValue(detail.baseInfo.video_status),
        playSources: detail.playSources,
        highEnergySources: detail.assignPlaySources,
        trailerSources: detail.attachSources,
        shouldLoadSegments: base.currentSegments > 1 || (numberValue(requestAction) ?? 0) > 0 || (numberValue(objectValue(requestAction).get_segment) ?? 0) > 0,
        segments: [],
    };
}

export async function getMediaSegments(config: CoocaaMediaRuntimeConfig, id: string, nodeType?: string, signal?: AbortSignal): Promise<MediaSegment[]> {
    const result = await getCoocaaMediaSegments(config, { id, nodeType, signal });
    return result.segments.map((segment) => ({
        ...toMediaSearchItem(segment),
        index: segment.segmentIndex,
        playSources: segment.playSources,
        coocaaMId: segment.coocaaMId,
    }));
}

export async function getMediaDownloadSegments(id: string, signal?: AbortSignal): Promise<MediaSegment[]> {
    const albumId = id.trim();
    if (!albumId) throw new Error("缺少媒资专辑 ID");
    const params = new URLSearchParams({ node_type: "res", id: albumId, page_size: "60", ws: "" });
    const response = await fetchCoocaaDownload(`${COOCAA_DOWNLOAD_SEGMENTS_URL}?${params}`, signal);
    const data = objectValue(response.data);
    return arrayValue(data.segments).map((segment) => {
        const asset = normalizeMediaAsset(segment);
        return { ...toMediaSearchItem(asset), index: numberValue(segment.segment_index), playSources: asset.playSources, coocaaMId: stringValue(segment.coocaa_m_id) };
    });
}

export async function getMediaDownloadStatus(baseUrl: string, input: { coocaaVId: string; coocaaMId: string; signal?: AbortSignal }): Promise<MediaDownloadStatus> {
    const params = new URLSearchParams({ coocaaVId: input.coocaaVId, coocaaMId: input.coocaaMId, mediumType: "1" });
    const response = await fetchCoocaaDownload(`${downloadApiBaseUrl(baseUrl)}/require/obtainMovieDetail?${params}`, input.signal);
    return toMediaDownloadStatus(objectValue(response.data), input);
}

export async function addMediaDownloadTask(baseUrl: string, input: { coocaaVId: string; coocaaMId: string; priority?: number; signal?: AbortSignal }): Promise<MediaDownloadStatus> {
    const params = new URLSearchParams({ coocaaVId: input.coocaaVId, coocaaMId: input.coocaaMId, mediumType: "1", priority: String(input.priority ?? 80) });
    const response = await fetchCoocaaDownload(`${downloadApiBaseUrl(baseUrl)}/require/addDownloadTask?${params}`, input.signal);
    return toMediaDownloadStatus(objectValue(response.data), input);
}

function toMediaDownloadStatus(data: Record<string, unknown>, input: { coocaaVId: string; coocaaMId: string }): MediaDownloadStatus {
    return {
        coocaaVId: stringValue(data.coocaaVId) || input.coocaaVId,
        coocaaMId: stringValue(data.coocaaMId) || input.coocaaMId,
        movieTitle: stringValue(data.movieTitle),
        resolution: stringValue(data.resolution),
        duration: numberValue(data.duration),
        createdAt: stringValue(data.createTime),
        priority: numberValue(data.priority),
        estimatedTime: numberValue(data.estimatedTime),
        mediumUrl: stringValue(data.mediumUrl),
        isDownload: downloadStatus(data.isDownload),
        failureReason: stringValue(data.downloadFaliureReason) || stringValue(data.downloadFailureReason),
    };
}

export function mediaDownloadFileUrl(input: { coocaaVId: string; coocaaMId: string }) {
    const params = new URLSearchParams(input);
    return `${COOCAA_DOWNLOAD_FILE_URL}?${params}`;
}

async function postCoocaa<T extends CoocaaEnvelope>(config: CoocaaMediaRuntimeConfig, path: string, data: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    if (!baseUrl) throw new Error("请先配置酷开媒资接口地址");
    const headers = new Headers(parseCoocaaHeaders(config.headersText));
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    let response: Response;
    try {
        response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify({ data, devInfo: parseCoocaaDevInfo(config.devInfoText) }), signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new CoocaaMediaApiError(error instanceof Error ? error.message : "酷开媒资接口请求失败");
    }
    const payload = await readJson(response);
    const envelope = objectValue(payload) as CoocaaEnvelope;
    if (!response.ok) throw new CoocaaMediaApiError(apiMessage(envelope) || `酷开媒资接口请求失败（${response.status}）`, response.status, payload);
    if ((typeof envelope.code === "number" || typeof envelope.code === "string") && String(envelope.code) !== "0") throw new CoocaaMediaApiError(apiMessage(envelope) || `酷开媒资接口返回错误码 ${envelope.code}`, response.status, payload);
    return envelope as T;
}

async function fetchCoocaaDownload(url: string, signal?: AbortSignal): Promise<CoocaaEnvelope> {
    let response: Response;
    try {
        response = await fetch(url, { signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new CoocaaMediaApiError(error instanceof Error ? error.message : "酷开媒资下载服务请求失败");
    }
    const payload = await readJson(response);
    const envelope = objectValue(payload) as CoocaaEnvelope;
    if (!response.ok) throw new CoocaaMediaApiError(apiMessage(envelope) || `酷开媒资下载服务请求失败（${response.status}）`, response.status, payload);
    if ((typeof envelope.code === "number" || typeof envelope.code === "string") && String(envelope.code) !== "0") throw new CoocaaMediaApiError(apiMessage(envelope) || `酷开媒资下载服务返回错误码 ${envelope.code}`, response.status, payload);
    return envelope;
}

function downloadApiBaseUrl(baseUrl: string) {
    const value = baseUrl.trim().replace(/\/+$/, "");
    if (!value) throw new Error("请先配置酷开下载服务地址");
    return value;
}

async function searchCoocaaMediaV4(keyword: string, signal?: AbortSignal): Promise<CoocaaMediaSearchResult> {
    const value = keyword.trim();
    if (!value) throw new Error("请输入片名、节目或关键词");
    const params = new URLSearchParams({ version_type: "1", business_type: "0", keyword: value, category_en_name: "VIDEO" });
    let response: Response;
    try {
        response = await fetch(`${COOCAA_SEARCH_V4_URL}?${params}`, { signal });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new CoocaaMediaApiError(error instanceof Error ? error.message : "酷开 v4.0 检索请求失败");
    }
    const payload = await readJson(response);
    const envelope = objectValue(payload) as CoocaaEnvelope;
    if (!response.ok) throw new CoocaaMediaApiError(apiMessage(envelope) || `酷开 v4.0 检索请求失败（${response.status}）`, response.status, payload);
    if ((typeof envelope.code === "number" || typeof envelope.code === "string") && String(envelope.code) !== "0") throw new CoocaaMediaApiError(apiMessage(envelope) || `酷开 v4.0 检索返回错误码 ${envelope.code}`, response.status, payload);
    const data = objectValue(envelope.data);
    const videoInfo = objectValue(data.video_info);
    const groups = arrayValue(videoInfo.category_type_list).map((group) => ({
        itemType: numberValue(group.item_type),
        name: stringValue(group.name),
        subName: stringValue(group.sub_name),
        subTitle: stringValue(group.sub_title),
        uiType: stringValue(group.ui_type),
        lightTitle: stringValue(group.light_title),
        items: arrayValue(group.video_list).map(normalizeMediaAsset),
    }));
    const items = groups.flatMap((group) => group.items);
    return {
        total: numberValue(data.total) ?? items.length,
        pageIndex: numberValue(data.page_index) ?? 0,
        lastPage: booleanValue(data.last_page),
        groups,
        items,
        raw: data,
    };
}

function normalizeMediaAsset(raw: Record<string, unknown>): CoocaaMediaAsset {
    const images = arrayValue(raw.images).map(normalizeImage);
    return {
        id: stringValue(raw.id),
        title: stringValue(raw.title),
        subtitle: stringValue(raw.sub_title),
        nodeType: stringValue(raw.node_type),
        videoType: stringValue(raw.video_type),
        businessType: stringValue(raw.business_type),
        categoryId: stringValue(raw.category_id),
        categoryName: stringValue(raw.category_name),
        score: stringValue(raw.score),
        description: stringValue(raw.desc),
        tagName: stringValue(raw.tag_name),
        totalSegments: numberValue(raw.publist_segment) ?? numberValue(raw.total_segment) ?? 0,
        currentSegments: numberValue(raw.current_segment) ?? numberValue(raw.update_segment) ?? numberValue(raw.updated_segment) ?? 0,
        isPlayable: booleanValue(raw.is_play),
        thirdSource: stringValue(raw.third_source),
        images,
        posterUrl: selectPoster(images),
        playSources: normalizePlaybackSources(raw.play_sources),
        raw,
    };
}

function toMediaSearchItem(asset: CoocaaMediaAsset): MediaSearchItem {
    return {
        id: asset.id,
        title: asset.title,
        subtitle: asset.subtitle,
        category: asset.categoryName || asset.videoType,
        tag: asset.tagName,
        source: asset.thirdSource,
        image: asset.posterUrl,
        episodeCount: asset.totalSegments || asset.currentSegments,
        playable: asset.isPlayable || asset.playSources.some((source) => Boolean(source.url)),
        nodeType: asset.nodeType || "",
    };
}

function normalizeImage(raw: Record<string, unknown>): CoocaaMediaImage {
    return { url: stringValue(raw.url), style: stringValue(raw.style), size: stringValue(raw.size) };
}

function normalizePlaybackSources(value: unknown): CoocaaPlaybackSource[] {
    return arrayValue(value).map((source) => ({
        id: stringValue(source.id),
        source: stringValue(source.source),
        sourceName: stringValue(source.source_name),
        url: stringValue(source.url),
        urlType: stringValue(source.url_type),
        streamType: stringValue(source.stream_type),
        streamInfo: stringValue(source.stream_info),
    }));
}

function selectPoster(images: CoocaaMediaImage[]) {
    return images.find((image) => image.style === "h")?.url || images[0]?.url || "";
}

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

function apiMessage(value: CoocaaEnvelope): string {
    return stringValue(value.msg) || stringValue(value.message) || stringValue(objectValue(value.error).message) || stringValue(value.error);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
    const text = value.trim();
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        return parsed as Record<string, unknown>;
    } catch {
        throw new Error(`${label}必须是 JSON 对象`);
    }
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length) : [];
}

function stringValue(value: unknown): string {
    return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function numberValue(value: unknown): number | null {
    const result = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    return Number.isFinite(result) ? result : null;
}

function booleanValue(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || value === "true";
}

function downloadStatus(value: unknown): 0 | 1 | 2 | 3 | null {
    const status = numberValue(value);
    return status === 0 || status === 1 || status === 2 || status === 3 ? status : null;
}
