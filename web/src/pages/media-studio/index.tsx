import { Alert, App, Button, Drawer, Empty, Input, Progress, Segmented, Tag, Tooltip } from "antd";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    ArrowDown,
    ArrowUp,
    Clapperboard,
    DatabaseZap,
    Download,
    FileText,
    Film,
    FolderCog,
    ListVideo,
    LoaderCircle,
    Play,
    Search,
    Settings2,
    Sparkles,
    Volume2,
    X,
} from "lucide-react";

import { getMediaDetail, getMediaDownloadSegments, mediaApiReady, searchMedia, type MediaDetail, type MediaPlaySource, type MediaSearchItem, type MediaSegment } from "@/services/api/coocaa-media";
import { COOCAA_ANALYSIS_API_BASE_URL, COOCAA_ANALYSIS_API_UPSTREAM_URL, COOCAA_MEDIA_API_UPSTREAM_URL, toCoocaaMediaRuntimeConfig, useCoocaaMediaStore, type CoocaaMediaConnectionConfig } from "@/stores/use-coocaa-media-store";

import { useMediaDownload, type MediaDownloadProgress } from "./use-media-download";

type Clip = { id: string; title: string; inPoint: string; duration: number; purpose: string; image: string };
type ViewMode = "素材库" | "解析数据";

const sampleAssets: MediaSearchItem[] = [
    { id: "_otx_demo_8800", title: "雾港来信", subtitle: "第 01 集 · 失踪的列车", category: "电视剧", tag: "悬疑 / 都市", source: "示例媒资", image: "https://images.unsplash.com/photo-1729003622787-16e27ed2cbf2?auto=format&fit=crop&w=1200&q=80", episodeCount: 12, playable: false },
    { id: "_otx_demo_9201", title: "未熄的霓虹", subtitle: "第 06 集 · 最后的证词", category: "电影", tag: "犯罪 / 剧情", source: "示例媒资", image: "https://images.unsplash.com/photo-1763431921700-714a76958f8f?auto=format&fit=crop&w=1200&q=80", episodeCount: 1, playable: false },
    { id: "_otx_demo_7452", title: "远方的信号", subtitle: "第 01 集 · 归航", category: "综艺", tag: "剧情 / 家庭", source: "示例媒资", image: "https://images.unsplash.com/photo-1750688649916-80f83df98ecc?auto=format&fit=crop&w=1200&q=80", episodeCount: 8, playable: false },
];

const sampleClips: Clip[] = [
    { id: "station", title: "空站台与抵达列车", inPoint: "00:01:42", duration: 26, purpose: "开场钩子", image: "https://images.unsplash.com/photo-1729003622787-16e27ed2cbf2?auto=format&fit=crop&w=600&q=80" },
    { id: "platform", title: "月台上的遗留物", inPoint: "00:09:14", duration: 14, purpose: "线索铺垫", image: "https://images.unsplash.com/photo-1743155597990-7a86e6f1b39f?auto=format&fit=crop&w=600&q=80" },
    { id: "storm", title: "暴雨前的海岸", inPoint: "00:23:33", duration: 21, purpose: "情绪转折", image: "https://images.unsplash.com/photo-1691770585366-502ac04ea7ec?auto=format&fit=crop&w=600&q=80" },
];

export default function MediaStudioPage() {
    const { message } = App.useApp();
    const connection = useCoocaaMediaStore((state) => state.config);
    const config = useMemo(() => toCoocaaMediaRuntimeConfig(connection), [connection]);
    const [configOpen, setConfigOpen] = useState(false);
    const [sampleMode, setSampleMode] = useState(false);
    const [query, setQuery] = useState("");
    const [items, setItems] = useState<MediaSearchItem[]>([]);
    const [activeItem, setActiveItem] = useState<MediaSearchItem>();
    const [detail, setDetail] = useState<MediaDetail>();
    const [segments, setSegments] = useState<MediaSegment[]>([]);
    const [activeSegment, setActiveSegment] = useState<MediaSegment>();
    const [activeSource, setActiveSource] = useState<MediaPlaySource>();
    const [view, setView] = useState<ViewMode>("素材库");
    const [searching, setSearching] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState("");
    const [playError, setPlayError] = useState("");
    const [timeline, setTimeline] = useState<Clip[]>([]);
    const requestRef = useRef<AbortController | undefined>(undefined);
    const detailApiReady = mediaApiReady(config);
    const mediaDownload = useMediaDownload(COOCAA_ANALYSIS_API_BASE_URL);

    const availableSources = activeSegment?.playSources.length ? activeSegment.playSources : detail?.highEnergySources.length ? detail.highEnergySources : detail?.playSources || [];
    const previewUrl = activeSource?.url || "";
    const timelineDuration = timeline.reduce((total, clip) => total + clip.duration, 0);
    const displayItems = sampleMode ? sampleAssets.filter((item) => includesSearch(item, query)) : items;
    const displayTitle = detail?.title || activeItem?.title || "选择一部影视开始";
    const displaySubtitle = detail?.subtitle || activeItem?.subtitle || "搜索电影、综艺或电视剧，查看真实媒资回包";

    useEffect(() => () => requestRef.current?.abort(), []);

    const runSearch = async (keyword = query) => {
        const value = keyword.trim();
        if (!value) return message.info("请输入影视名称、类型或标签");
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setSampleMode(false);
        setSearching(true);
        setError("");
        setItems([]);
        setActiveItem(undefined);
        setDetail(undefined);
        setSegments([]);
        setActiveSegment(undefined);
        setActiveSource(undefined);
        setPlayError("");
        try {
            const result = await searchMedia(value, controller.signal);
            setItems(result);
            if (!result.length) setError("接口已返回，但没有匹配影视。请检查关键词、用户权益和业务分类条件。");
        } catch (cause) {
            if (controller.signal.aborted) return;
            setError(cause instanceof Error ? cause.message : "媒资搜索失败");
        } finally {
            if (!controller.signal.aborted) setSearching(false);
        }
    };

    const selectItem = async (item: MediaSearchItem) => {
        setActiveItem(item);
        setDetail(undefined);
        setSegments([]);
        setActiveSegment(undefined);
        setActiveSource(undefined);
        setPlayError("");
        if (sampleMode) {
            setTimeline(sampleClips);
            return;
        }
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setLoadingDetail(true);
        setError("");
        try {
            const segmentRequest = getMediaDownloadSegments(item.id, controller.signal);
            const next = detailApiReady ? await getMediaDetail(config, item.id, item.nodeType, controller.signal) : undefined;
            const nextSegments = await segmentRequest;
            setDetail(next ? { ...next, segments: nextSegments } : undefined);
            setSegments(nextSegments);
            const segment = nextSegments.find((entry) => entry.playSources.length) || nextSegments[0];
            const source = segment?.playSources[0] || next?.highEnergySources[0] || next?.playSources[0];
            setActiveSegment(segment);
            setActiveSource(source);
            if (!detailApiReady) setError("已取得可下载单集。填写媒资连接中的身份信息后可继续读取详情和浏览器播放源。");
        } catch (cause) {
            if (controller.signal.aborted) return;
            setError(cause instanceof Error ? cause.message : "影视详情加载失败");
        } finally {
            if (!controller.signal.aborted) setLoadingDetail(false);
        }
    };

    const loadSample = () => {
        setSampleMode(true);
        setItems([]);
        setActiveItem(sampleAssets[0]);
        setDetail(undefined);
        setSegments([]);
        setActiveSegment(undefined);
        setActiveSource(undefined);
        setTimeline(sampleClips);
        setError("");
        setPlayError("当前为界面示例，只有图片缩略图，没有真实视频流。");
    };

    const selectSegment = (segment: MediaSegment) => {
        setActiveSegment(segment);
        setActiveSource(segment.playSources[0]);
        setPlayError("");
    };

    const moveClip = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= timeline.length) return;
        setTimeline((current) => {
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    return (
        <main className="flex h-full min-w-0 flex-col overflow-hidden bg-[#f7f7f5] text-stone-900 dark:bg-[#171716] dark:text-stone-100">
            <section className="shrink-0 border-b border-stone-200 bg-background px-4 py-3 sm:px-6 dark:border-stone-800">
                <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950"><Clapperboard className="size-5" /></div>
                        <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-semibold">影视解说</h1><Tag className="m-0" color={sampleMode ? "gold" : "green"}>{sampleMode ? "界面示例" : detailApiReady ? "详情接口已就绪" : "v4.0 检索已就绪"}</Tag></div><p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">搜索影片 · 选择单集 · 预览播放串 · 组合审片时间线</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2"><Button icon={<FolderCog className="size-4" />} onClick={() => setConfigOpen(true)}>媒资连接</Button><Button icon={<Sparkles className="size-4" />} disabled={!activeItem}>生成解说初稿</Button><Button type="primary" icon={<Play className="size-4" />} disabled={!activeItem}>生成审片</Button></div>
                </div>
            </section>

            <div className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden lg:px-4">
                <div className="grid min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)_330px] lg:overflow-hidden">
                    <aside className="border-b border-stone-200 bg-background lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0 dark:border-stone-800">
                        <div className="p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-stone-500 dark:text-stone-400">媒资检索</span><Tooltip title="GET /v2/search/v4.0"><DatabaseZap className="size-4 text-stone-400" /></Tooltip></div><div className="flex gap-2"><Input id="media-search" value={query} onChange={(event) => setQuery(event.target.value)} onPressEnter={() => void runSearch()} prefix={<Search className="size-4 text-stone-400" />} placeholder="输入电影、综艺或电视剧名称" allowClear /><Button type="primary" icon={<Search className="size-4" />} loading={searching} onClick={() => void runSearch()} aria-label="搜索媒资" /></div><div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="text-emerald-600 dark:text-emerald-400">v4.0 真实检索</span><button type="button" className="text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100" onClick={loadSample}>查看示例</button></div></div>
                        {error ? <Alert className="mx-3 mb-3" type="warning" showIcon title={error} /> : null}
                        <div className="space-y-1 px-2 pb-3">{displayItems.map((item) => <SearchResult key={item.id} item={item} active={item.id === activeItem?.id} onClick={() => void selectItem(item)} />)}{searching ? <div className="flex justify-center py-8"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div> : null}{!searching && !displayItems.length ? <Empty className="py-8" image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入片名后开始 v4.0 真实检索" /> : null}</div>
                    </aside>

                    <section className="min-w-0 border-b border-stone-200 bg-[#f7f7f5] p-4 sm:p-6 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0 dark:border-stone-800 dark:bg-[#171716]">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{displayTitle}</h2>{activeItem ? <Tag className="m-0">{detail?.category || activeItem.category}</Tag> : null}{activeItem && detail ? <Tag className="m-0" color={detail.status === 1 ? "green" : "gold"}>{detail.status === 1 ? "已上架" : "状态待确认"}</Tag> : null}</div><p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{displaySubtitle}{detail?.episodeCount ? ` · ${detail.episodeCount} 集` : ""}</p></div><Segmented value={view} onChange={(value) => setView(value as ViewMode)} options={["素材库", "解析数据"]} disabled={!activeItem} /></div>
                        {loadingDetail ? <div className="flex aspect-video items-center justify-center bg-stone-950"><LoaderCircle className="size-6 animate-spin text-white" /></div> : activeItem ? <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)]"><MediaPlayer item={activeItem} segment={activeSegment} source={activeSource} playError={playError} download={mediaDownload.progress} downloading={mediaDownload.downloading} onPlayError={setPlayError} onDownload={() => activeSegment && void mediaDownload.download({ coocaaVId: activeItem.id, coocaaMId: activeSegment.coocaaMId, title: activeSegment.title || activeItem.title })} onCancelDownload={mediaDownload.cancel} /><InterfaceMap detail={detail} segment={activeSegment} /></div> : <EmptyState onConfigure={() => setConfigOpen(true)} onSample={loadSample} />}
                        {activeItem && view === "素材库" ? <MediaContent detail={detail} segments={segments} activeSegment={activeSegment} sources={availableSources} sampleMode={sampleMode} onSelectSegment={selectSegment} onSelectSource={(source) => { setActiveSource(source); setPlayError(""); }} /> : null}
                        {activeItem && view === "解析数据" ? <AnalysisPanel ready={sampleMode} /> : null}
                    </section>

                    <aside className="min-w-0 bg-background p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto dark:bg-[#1b1b1a]"><div className="flex items-center gap-2"><Sparkles className="size-4" /><h2 className="text-sm font-semibold">解说方案</h2></div></aside>
                </div>
                <Timeline timeline={timeline} onMove={moveClip} onRemove={(id) => setTimeline((items) => items.filter((item) => item.id !== id))} />
            </div>
            <MediaConnectionDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
        </main>
    );
}

function SearchResult({ item, active, onClick }: { item: MediaSearchItem; active: boolean; onClick: () => void }) {
    return <button type="button" onClick={onClick} className={`grid w-full grid-cols-[72px_minmax(0,1fr)] gap-3 p-2 text-left transition ${active ? "bg-stone-100 dark:bg-stone-800" : "hover:bg-stone-50 dark:hover:bg-stone-900"}`}>{item.image ? <img src={item.image} alt="" className="aspect-video h-[48px] w-[72px] object-cover" /> : <div className="flex h-[48px] w-[72px] items-center justify-center bg-stone-100 dark:bg-stone-800"><Film className="size-4 text-stone-400" /></div>}<span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-1 block truncate text-xs text-stone-500 dark:text-stone-400">{item.category}{item.tag ? ` · ${item.tag}` : ""}</span><span className="mt-1 block text-[11px] text-stone-500 dark:text-stone-400">{item.episodeCount ? `${item.episodeCount} 集` : item.source || "影视媒资"}</span></span></button>;
}

function MediaPlayer({ item, segment, source, playError, download, downloading, onPlayError, onDownload, onCancelDownload }: { item: MediaSearchItem; segment?: MediaSegment; source?: MediaPlaySource; playError: string; download: MediaDownloadProgress; downloading: boolean; onPlayError: (value: string) => void; onDownload: () => void; onCancelDownload: () => void }) {
    return <div className="overflow-hidden bg-stone-950">{source?.url ? <><video key={source.url} src={source.url} controls playsInline className="aspect-video w-full object-contain" onError={() => onPlayError("浏览器无法播放该播放串。可能是 DRM、需要第三方 SDK、跨域限制，或该 url_type 不是浏览器原生视频流。")} /><div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-stone-300"><span className="truncate">{source.sourceName || source.source || "默认播放源"} · {source.streamType || "default"}</span><span>{source.urlType || "未返回 url_type"}</span></div>{playError ? <Alert className="m-3" type="warning" showIcon title={playError} /> : null}</> : <div className="flex aspect-video flex-col items-center justify-center px-6 text-center text-white"><Play className="size-7 text-stone-400" /><p className="mt-3 text-sm">{item.source === "示例媒资" ? "示例模式没有真实视频流" : "该影片详情未返回可播放的 play_sources.url"}</p><p className="mt-1 text-xs text-stone-400">选择剧集后会读取分集的 play_sources；电影直接读取详情 play_sources。</p></div>}<MediaDownloadPanel segment={segment} progress={download} downloading={downloading} onDownload={onDownload} onCancel={onCancelDownload} /></div>;
}

function MediaDownloadPanel({ segment, progress, downloading, onDownload, onCancel }: { segment?: MediaSegment; progress: MediaDownloadProgress; downloading: boolean; onDownload: () => void; onCancel: () => void }) {
    const saving = progress.stage === "saving";
    const percent = progress.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0;
    const preparingText = progress.serverState === "queued" ? `服务端队列等待中，尚未开始下载 · 已排队 ${formatWaitTime(progress.queuedSeconds)}` : progress.serverState === "downloading" ? `服务端正在下载原片 · 已处理 ${formatWaitTime(progress.downloadingSeconds)}` : "服务端正在确认原片状态";
    const estimateText = progress.estimatedSeconds > 0 ? ` · 服务端预估 ${formatWaitTime(progress.estimatedSeconds)}` : "";
    const priorityText = progress.priority === null ? "" : ` · 服务端优先级 ${progress.priority}`;
    const stageText = progress.stage === "preparing" ? `${preparingText}${priorityText}${estimateText}` : saving ? progress.total ? `${formatBytes(progress.received)} / ${formatBytes(progress.total)}` : `已保存 ${formatBytes(progress.received)}，等待服务返回总大小` : progress.stage === "completed" ? "原片已保存到所选位置" : progress.stage === "canceled" ? "下载已取消" : progress.stage === "failed" ? progress.error : "选择保存位置后开始下载原片";
    return <div className="border-t border-stone-800 bg-background px-3 py-3 text-stone-900 dark:border-stone-700 dark:text-stone-100"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Download className="size-4 shrink-0 text-stone-500 dark:text-stone-400" /><span className="text-sm font-medium">下载当前单集</span>{segment?.coocaaMId ? <Tag className="m-0">原片 MP4</Tag> : <Tag className="m-0">等待选择单集</Tag>}</div><div className="flex items-center gap-1"><Button type="text" size="small" icon={<Download className="size-3.5" />} disabled={!segment?.coocaaMId || downloading} onClick={onDownload}>下载</Button>{downloading ? <Button type="text" danger size="small" icon={<X className="size-3.5" />} onClick={onCancel}>取消</Button> : null}</div></div>{progress.stage !== "idle" ? <div className="mt-3"><div className="flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400"><span className="min-w-0 truncate">{progress.title || segment?.title || "原片"}</span><span className="shrink-0">{saving && progress.total ? `${percent}%` : progress.stage === "completed" ? "完成" : ""}</span></div>{saving ? <Progress className="mt-2" percent={percent} status="active" showInfo={false} size="small" strokeColor="#d97706" railColor="rgba(120,113,108,.18)" /> : progress.stage === "preparing" ? <div className="mt-2 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400"><LoaderCircle className="size-3.5 animate-spin" />服务端不提供百分比，状态会每 2 秒刷新；可随时取消</div> : null}<p className={`mt-2 text-xs leading-5 ${progress.stage === "failed" ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"}`}>{stageText}</p></div> : null}</div>;
}

function formatWaitTime(seconds: number) {
    return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

function InterfaceMap({ detail, segment }: { detail?: MediaDetail; segment?: MediaSegment }) {
    return <div className="border-l-2 border-amber-500 bg-amber-50/70 p-4 dark:bg-amber-950/20"><div className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-amber-700 dark:text-amber-400" />当前模块调用链</div><dl className="mt-4 space-y-3 text-xs"><MapRow title="检索" value="GET /v2/search/v4.0" detail="keyword、version_type=1、business_type=0" /><MapRow title="详情" value="POST /v2/pt/getVideoDetail" detail={detail ? `id: ${detail.id}` : "连接媒资服务后读取"} /><MapRow title="分集" value="GET /v2/getVideoSegmentList" detail={segment ? `第 ${segment.index} 集 · coocaa_m_id 已确认` : "用于取得真实单集 ID"} /><MapRow title="原片下载" value="obtainMovieDetail → addDownloadTask" detail="原片就绪后选择本地保存位置并流式写入" /><MapRow title="播放" value="play_sources[].url" detail={detail ? "详情或分集回包中的播放串" : "等待详情回包"} /><MapRow title="镜头分析" value="VCA / OCR 文件" detail="当前接口仅返回文件 URL，尚未定义片段时间码 schema" /></dl></div>;
}

function MapRow({ title, value, detail }: { title: string; value: string; detail: string }) {
    return <div><dt className="text-stone-500 dark:text-stone-400">{title}</dt><dd className="mt-0.5 font-mono text-stone-800 dark:text-stone-200">{value}</dd><dd className="mt-0.5 text-stone-600 dark:text-stone-300">{detail}</dd></div>;
}

function MediaContent({ detail, segments, activeSegment, sources, sampleMode, onSelectSegment, onSelectSource }: { detail?: MediaDetail; segments: MediaSegment[]; activeSegment?: MediaSegment; sources: MediaPlaySource[]; sampleMode: boolean; onSelectSegment: (segment: MediaSegment) => void; onSelectSource: (source: MediaPlaySource) => void }) {
    if (sampleMode) return <div className="mt-6"><SectionTitle title="高光片段候选" detail="示例时间码，不来自真实 VCA/OCR 回包" /> <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{sampleClips.map((clip) => <SampleClip key={clip.id} clip={clip} />)}</div></div>;
    return <div className="mt-6"><SectionTitle title={segments.length ? "选择单集" : "播放源"} detail={segments.length ? "下载使用 segments[].coocaa_m_id，不使用 third_id" : "来自详情 play_sources / assign_play_sources"} />{segments.length ? <div className="grid gap-2 sm:grid-cols-2">{segments.map((segment) => <button key={segment.coocaaMId || `${segment.id}-${segment.index}`} type="button" onClick={() => onSelectSegment(segment)} className={`flex items-center justify-between border p-3 text-left transition ${activeSegment?.coocaaMId === segment.coocaaMId ? "border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-stone-800" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}><span><span className="block text-sm font-medium">第 {segment.index} 集 · {segment.title}</span><span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">{segment.subtitle || "无副标题"}</span></span><Tag className="m-0" color={segment.playable ? "green" : "default"}>{segment.playable ? "可播放" : "原片可下载"}</Tag></button>)}</div> : null}{sources.length ? <div className="mt-3 flex flex-wrap gap-2">{sources.map((source, index) => <Button key={`${source.id}-${source.url}`} size="small" icon={<Volume2 className="size-3.5" />} onClick={() => onSelectSource(source)}>{source.sourceName || source.source || `播放源 ${index + 1}`}</Button>)}</div> : detail ? <Alert className="mt-3" type="info" showIcon title="详情已加载，但没有返回浏览器可选的播放串" description="请检查回包中的 control_info.play_sources、assign_play_sources 或分集 play_sources。" /> : null}</div>;
}

function SectionTitle({ title, detail }: { title: string; detail: string }) { return <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Film className="size-4 text-stone-500" /><h3 className="text-sm font-semibold">{title}</h3></div><span className="text-xs text-stone-500 dark:text-stone-400">{detail}</span></div>; }

function SampleClip({ clip }: { clip: Clip }) { return <article className="overflow-hidden border border-stone-200 bg-background dark:border-stone-800"><img src={clip.image} alt="" className="aspect-video w-full object-cover" /><div className="p-3"><h4 className="text-sm font-medium">{clip.title}</h4><p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{clip.inPoint} · {clip.duration} 秒 · {clip.purpose}</p></div></article>; }

function AnalysisPanel({ ready }: { ready: boolean }) { const fields = ["speechFile", "characterFile", "faceRecognitionTrackingFile", "ownCharacterFile"]; return <div className="mt-6 border border-stone-200 bg-background dark:border-stone-800">{fields.map((field) => <div key={field} className="flex items-center justify-between border-b border-stone-100 px-4 py-3 last:border-0 dark:border-stone-800"><div><div className="text-sm font-medium">{field}</div><div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">/thirdMediaAnalyze/getVcaAnalysisResult 回包字段</div></div><Tag className="m-0" color={ready ? "gold" : "default"}>{ready ? "示例" : "待接入"}</Tag></div>)}</div>; }

function EmptyState({ onConfigure, onSample }: { onConfigure: () => void; onSample: () => void }) { return <div className="mt-5 flex aspect-video flex-col items-center justify-center bg-stone-950 px-6 text-center text-white"><DatabaseZap className="size-8 text-stone-400" /><p className="mt-4 text-sm">v4.0 检索结果来自真实媒资；详情与播放需要填写媒资身份信息。</p><div className="mt-4 flex gap-2"><Button icon={<Settings2 className="size-4" />} onClick={onConfigure}>配置详情与播放</Button><Button type="text" className="!text-stone-300" onClick={onSample}>查看界面示例</Button></div></div>; }

function Timeline({ timeline, onMove, onRemove }: { timeline: Clip[]; onMove: (index: number, direction: -1 | 1) => void; onRemove: (id: string) => void }) { const seconds = timeline.reduce((sum, clip) => sum + clip.duration, 0); return <section className="shrink-0 border-t border-stone-200 bg-background px-4 py-3 sm:px-6 dark:border-stone-800"><div className="mx-auto max-w-[1680px]"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><ListVideo className="size-4" /><h2 className="text-sm font-semibold">审片时间线</h2><span className="text-xs text-stone-500 dark:text-stone-400">{timeline.length} 个片段 · {seconds} 秒</span></div><Tag className="m-0" color={seconds >= 55 && seconds <= 75 ? "green" : "default"}>{seconds >= 55 && seconds <= 75 ? "时长匹配" : "等待镜头"}</Tag></div>{timeline.length ? <div className="flex gap-2 overflow-x-auto pb-1">{timeline.map((clip, index) => <div key={clip.id} className="grid h-[74px] min-w-56 grid-cols-[68px_minmax(0,1fr)_auto] overflow-hidden border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900"><img src={clip.image} alt="" className="h-full w-full object-cover" /><div className="min-w-0 px-2 py-2"><div className="truncate text-xs font-medium">{clip.title}</div><div className="mt-1 font-mono text-[11px] text-stone-500 dark:text-stone-400">{clip.inPoint} · {clip.duration}s</div><div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{clip.purpose}</div></div><div className="flex flex-col justify-center border-l border-stone-200 dark:border-stone-800"><Tooltip title="前移"><Button type="text" size="small" shape="circle" disabled={index === 0} icon={<ArrowUp className="size-3" />} onClick={() => onMove(index, -1)} /></Tooltip><Tooltip title="后移"><Button type="text" size="small" shape="circle" disabled={index === timeline.length - 1} icon={<ArrowDown className="size-3" />} onClick={() => onMove(index, 1)} /></Tooltip><Tooltip title="移除片段"><Button type="text" size="small" shape="circle" icon={<X className="size-3" />} onClick={() => onRemove(clip.id)} /></Tooltip></div></div>)}</div> : <div className="flex h-[74px] items-center justify-center border border-dashed border-stone-300 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">待接入 VCA/OCR 时间码解析后，才能从真实媒资创建可剪片段。</div>}</div></section>; }

function MediaConnectionDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const config = useCoocaaMediaStore((state) => state.config);
    const updateConfig = useCoocaaMediaStore((state) => state.updateConfig);
    const resetConfig = useCoocaaMediaStore((state) => state.resetConfig);
    return <Drawer title="媒资连接" placement="right" size={560} open={open} onClose={onClose}><div className="space-y-6"><Alert type="info" showIcon title="接口地址已按文档和实测预置" description="v4.0 检索无需身份信息；开发环境的详情、下载和原片流通过同源 API 转发，浏览器不再直连媒资服务。" /><ConnectionEndpoint title="v4.0 检索服务" url="https://movie-tc.skysrt.com" endpoints={["GET /v2/search/v4.0"]} /><ConnectionEndpoint title="下载单集服务" url="https://demo-media.skysrt.com" endpoints={["GET /v2/getVideoSegmentList → /api/coocaa/segments"]} /><ConnectionEndpoint title="详情与播放服务" url={COOCAA_MEDIA_API_UPSTREAM_URL} endpoints={["POST /v2/pt/getVideoDetail → /api/coocaa/media"]} /><ConnectionEndpoint title="下载与分析服务" url={COOCAA_ANALYSIS_API_UPSTREAM_URL} endpoints={["GET /addDownloadTask → /api/coocaa/download", "GET /obtainMovieDetail → /api/coocaa/download", "GET /file → /api/coocaa/file", "GET /addOcrAnalyseVideo", "GET /thirdMediaAnalyze/getVcaAnalysisResult"]} /><ConfigSection title="详情与播放必填信息" detail="文档标记为必填，实际值需由设备、账号或媒资接口方提供。"><ConfigGrid config={config} updateConfig={updateConfig} fields={[['source', '内容源 source', 'yinhe、tencent 或 youku'], ['cVaid', '设备 OneId cVaid', '由设备或接口方提供'], ['cOpenId', '账户 ID cOpenId', '由账号体系提供'], ['cLicense', '牌照 cLicense', '例如 NewTV、GiTV、CIBN'], ['cPkg', '客户端包名 cPkg', '接口方分配'], ['partnerCode', '合作方 partnerCode', '对接时分配'], ['cResolution', '播放能力 cResolution', '例如 720p、1080p、4K']]}/></ConfigSection><ConfigSection title="设备与权益补充" detail="以下值会同步写入请求 Header 和 devInfo；文档给出默认值的字段已自动预填。"><ConfigGrid config={config} updateConfig={updateConfig} fields={[['sourceSign', '权益 sourceSign', '无权益可保持空'], ['cModel', '机型 cModel', '默认空'], ['cChip', '机芯 cChip', '默认空'], ['cSize', '尺寸 cSize', '默认 0'], ['cTcVersion', '天赐版本 cTcVersion', '默认 0'], ['cPattern', '运行模式 normal / child / old'], ['cAppVersion', '应用版本 cappVersion', '仅数字'], ['cVirtualModel', '虚拟机型 cVirtualModel', '可选']]}/></ConfigSection><ConfigSection title="补充设备标识" detail="这些可选值会自动写入请求 body 的 devInfo。"><ConfigGrid config={config} updateConfig={updateConfig} fields={[['activateTimestamp', '激活时间 activateTimestamp', '可选'], ['mac', 'MAC 地址 mac', '可选'], ['cudid', '设备 UDID cudid', '可选']]}/></ConfigSection><div className="flex justify-end border-t border-stone-200 pt-4 dark:border-stone-800"><Button type="text" onClick={resetConfig}>恢复文档默认值</Button></div><div className="border-l-2 border-amber-500 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">原片下载与浏览器预览是两条独立链路。开发代理会在每次保存前刷新短时效 <code>mediumUrl</code> 并流式转发；生产环境需要提供同一套同源服务。</div></div></Drawer>;
}

function ConnectionEndpoint({ title, url, endpoints }: { title: string; url: string; endpoints: string[] }) { return <section className="border border-stone-200 p-4 dark:border-stone-800"><div className="text-sm font-semibold">{title}</div><div className="mt-1 break-all font-mono text-xs text-stone-600 dark:text-stone-300">{url}</div><div className="mt-3 flex flex-wrap gap-2">{endpoints.map((endpoint) => <Tag key={endpoint} className="m-0">{endpoint}</Tag>)}</div></section>; }

type ConfigFieldKey = keyof CoocaaMediaConnectionConfig;
type ConfigField = [ConfigFieldKey, string, string];

function ConfigSection({ title, detail, children }: { title: string; detail: string; children: ReactNode }) { return <section><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{detail}</p><div className="mt-3">{children}</div></section>; }

function ConfigGrid({ config, updateConfig, fields }: { config: CoocaaMediaConnectionConfig; updateConfig: <K extends ConfigFieldKey>(key: K, value: CoocaaMediaConnectionConfig[K]) => void; fields: ConfigField[] }) { return <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, placeholder]) => <Field key={key} label={label} detail=""><Input value={config[key]} placeholder={placeholder} onChange={(event) => updateConfig(key, event.target.value)} /></Field>)}</div>; }

function Field({ label, detail, children }: { label: string; detail: string; children: ReactNode }) { return <label className="block"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">{detail}</span><span className="mt-2 block">{children}</span></label>; }

function includesSearch(item: MediaSearchItem, query: string) { return `${item.title}${item.subtitle}${item.category}${item.tag}`.includes(query.trim()); }

function formatBytes(value: number) {
    if (!value) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
