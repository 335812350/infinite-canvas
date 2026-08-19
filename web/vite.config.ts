import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");
const coocaaMediaOrigin = "http://movie.tc.skysrt.com";
const coocaaDownloadOrigin = "http://106.53.102.240:6003";
const coocaaSegmentOrigin = "https://demo-media.skysrt.com";

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

function coocaaMediaFileProxy(): Plugin {
    return {
        name: "coocaa-media-file-proxy",
        configureServer(server) {
            server.middlewares.use("/api/coocaa/file", async (request, response) => {
                if (request.method !== "GET") {
                    response.setHeader("Allow", "GET");
                    response.statusCode = 405;
                    response.end("Method not allowed");
                    return;
                }
                const params = new URL(request.url || "", "http://vite.local").searchParams;
                const coocaaVId = params.get("coocaaVId")?.trim();
                const coocaaMId = params.get("coocaaMId")?.trim();
                if (!coocaaVId || !coocaaMId || coocaaVId.length > 200 || coocaaMId.length > 200) {
                    response.statusCode = 400;
                    response.end("Missing media identifiers");
                    return;
                }
                try {
                    const statusParams = new URLSearchParams({ coocaaVId, coocaaMId, mediumType: "1" });
                    const statusResponse = await fetch(`${coocaaDownloadOrigin}/require/obtainMovieDetail?${statusParams}`);
                    const status = await statusResponse.json() as { code?: number | string; data?: { isDownload?: number; mediumUrl?: string } };
                    const mediaUrl = status.data?.mediumUrl;
                    if (!statusResponse.ok || String(status.code) !== "0" || Number(status.data?.isDownload) !== 2 || !/^https?:\/\//i.test(mediaUrl)) {
                        response.statusCode = 409;
                        response.end("Media file is not ready");
                        return;
                    }
                    const mediaResponse = await fetch(mediaUrl);
                    if (!mediaResponse.ok || !mediaResponse.body) {
                        response.statusCode = mediaResponse.status || 502;
                        response.end("Failed to download media file");
                        return;
                    }
                    response.statusCode = mediaResponse.status;
                    for (const header of ["content-type", "content-length", "accept-ranges"]) {
                        const value = mediaResponse.headers.get(header);
                        if (value) response.setHeader(header, value);
                    }
                    response.setHeader("Cache-Control", "no-store");
                    Readable.fromWeb(mediaResponse.body as unknown as import("node:stream/web").ReadableStream).on("error", () => response.destroy()).pipe(response);
                } catch {
                    if (!response.headersSent) {
                        response.statusCode = 502;
                        response.end("Failed to reach Coocaa media service");
                    } else {
                        response.destroy();
                    }
                }
            });
        },
    };
}

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest(), coocaaMediaFileProxy()],
    server: {
        proxy: {
            "/api/ark": {
                target: "https://ark.cn-beijing.volces.com",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/ark/, "/api/v3"),
            },
            "/api/coocaa/media": {
                target: coocaaMediaOrigin,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/coocaa\/media/, ""),
            },
            "/api/coocaa/download": {
                target: coocaaDownloadOrigin,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/coocaa\/download/, ""),
            },
            "/api/coocaa/segments": {
                target: coocaaSegmentOrigin,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/coocaa\/segments/, ""),
            },
        },
    },
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
});
