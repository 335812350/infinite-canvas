import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const dynamicKeys = [
    "settingsPanels.common.auto",
    "settingsPanels.common.low",
    "settingsPanels.common.medium",
    "settingsPanels.common.high",
    "settingsPanels.common.xhigh",
    "settingsPanels.video.modes.frames",
    "settingsPanels.video.modes.reference",
    "assets.kinds.text",
    "assets.kinds.image",
    "assets.kinds.video",
    "assets.kinds.audio",
    "canvas.videoFrames.first",
    "canvas.videoFrames.last",
    "canvas.videoFrames.current",
    "canvas.videoFrames.firstTitle",
    "canvas.videoFrames.lastTitle",
    "canvas.videoFrames.currentTitle",
    "canvas.videoFrames.captured",
    "canvas.videoFrames.failed",
    "canvas.composer.resources.image",
    "canvas.composer.resources.video",
    "canvas.composer.resources.audio",
    "canvas.composer.resources.text",
    "canvas.composer.resources.group",
    "canvas.editors.high",
    "canvas.editors.highDescription",
    "canvas.editors.bilinear",
    "canvas.editors.bilinearDescription",
    "canvas.editors.nearest",
    "canvas.editors.nearestDescription",
    "agent.skillManager.groups.project",
    "agent.skillManager.groups.global",
    "agent.skillManager.groups.all",
    "agent.skillManager.scopes.repo",
    "agent.skillManager.scopes.user",
    "agent.skillManager.scopes.system",
    "agent.skillManager.scopes.admin",
    "agent.composer.effort.minimal",
    "agent.composer.effort.low",
    "agent.composer.effort.medium",
    "agent.composer.effort.high",
    "agent.composer.effort.xhigh",
    "agent.composer.effort.max",
    "agent.composer.effort.ultra",
    "config.webdav.domains.canvas",
    "config.webdav.domains.assets",
    "config.webdav.domains.imageWorkbench",
    "config.webdav.domains.videoWorkbench",
    "version.types.added",
    "version.types.fixed",
    "version.types.changed",
    "version.types.optimized",
    "version.types.docs",
];

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "web/src");
const en = (await import("../web/src/i18n/locales/en-US.ts")).default;
const zh = (await import("../web/src/i18n/locales/zh-CN.ts")).default;
const sourceFiles = await findSourceFiles(sourceRoot);
const keys = new Map();

for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    collectStaticKeys(source, file);
    collectRuntimeKeys(source, file);
}

for (const key of dynamicKeys) keys.set(key, new Set(["known dynamic key family"]));
for (const key of new Set([...collectDictionaryKeys(en), ...collectDictionaryKeys(zh)])) {
    if (!keys.has(key)) keys.set(key, new Set(["locale structure"]));
}

const missing = [];
for (const [key, files] of keys) {
    for (const [locale, dictionary] of Object.entries({ "en-US": en, "zh-CN": zh })) {
        if (getValue(dictionary, key) === undefined) missing.push({ locale, key, files: [...files] });
    }
}

if (missing.length) {
    for (const { locale, key, files } of missing) console.error(`[${locale}] ${key}\n  ${files.join("\n  ")}`);
    process.exitCode = 1;
} else {
    console.log(`i18n key check passed: ${keys.size} keys in en-US and zh-CN.`);
}

async function findSourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return findSourceFiles(path);
        return /\.(?:ts|tsx)$/.test(entry.name) && !path.includes("/i18n/locales/") && !path.includes("\\i18n\\locales\\") ? [path] : [];
    }));
    return files.flat();
}

function collectStaticKeys(source, file) {
    for (const match of source.matchAll(/(?<![\w$.])(?:i18n\.)?t\(\s*(["'])([^"']+)\1/g)) addKey(match[2], file);
}

function collectRuntimeKeys(source, file) {
    for (const match of source.matchAll(/(?<![\w$.])rt\(\s*(["'])([^"']+)\1/g)) addKey(`agent.runtime.${match[2]}`, file);
}

function addKey(key, file) {
    if (!key.includes("{{")) {
        const files = keys.get(key) || new Set();
        files.add(file.replace(`${root}\\`, "").replace(`${root}/`, ""));
        keys.set(key, files);
    }
}

function getValue(dictionary, key) {
    return key.split(".").reduce((value, segment) => value && typeof value === "object" ? value[segment] : undefined, dictionary);
}

function collectDictionaryKeys(value, prefix = "") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
    return Object.entries(value).flatMap(([key, child]) => collectDictionaryKeys(child, prefix ? `${prefix}.${key}` : key));
}
