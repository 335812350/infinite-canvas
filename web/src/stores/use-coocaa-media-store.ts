import { create } from "zustand";

import type { CoocaaMediaRuntimeConfig } from "@/services/api/coocaa-media";

export const COOCAA_MEDIA_API_BASE_URL = "/api/coocaa/media";
export const COOCAA_ANALYSIS_API_BASE_URL = "/api/coocaa/download";
export const COOCAA_MEDIA_API_UPSTREAM_URL = "http://movie.tc.skysrt.com";
export const COOCAA_ANALYSIS_API_UPSTREAM_URL = "http://106.53.102.240:6003";

export type CoocaaMediaConnectionConfig = {
    source: string;
    cVaid: string;
    cOpenId: string;
    cLicense: string;
    sourceSign: string;
    cPkg: string;
    partnerCode: string;
    cModel: string;
    cChip: string;
    cSize: string;
    cResolution: string;
    cTcVersion: string;
    cPattern: string;
    cAppVersion: string;
    cVirtualModel: string;
    activateTimestamp: string;
    mac: string;
    cudid: string;
};

export const DEFAULT_COOCAA_MEDIA_CONFIG: CoocaaMediaConnectionConfig = {
    source: "",
    cVaid: "",
    cOpenId: "",
    cLicense: "",
    sourceSign: "",
    cPkg: "",
    partnerCode: "",
    cModel: "",
    cChip: "",
    cSize: "0",
    cResolution: "",
    cTcVersion: "0",
    cPattern: "normal",
    cAppVersion: "0",
    cVirtualModel: "",
    activateTimestamp: "",
    mac: "",
    cudid: "",
};

export function toCoocaaMediaRuntimeConfig(config: CoocaaMediaConnectionConfig): CoocaaMediaRuntimeConfig {
    return {
        baseUrl: COOCAA_MEDIA_API_BASE_URL,
        headersText: JSON.stringify({
            source: config.source,
            cVaid: config.cVaid,
            cOpenId: config.cOpenId,
            cModel: config.cModel,
            cChip: config.cChip,
            cSize: config.cSize,
            cResolution: config.cResolution,
            cTcVersion: config.cTcVersion,
            cPattern: config.cPattern,
            cLicense: config.cLicense,
            cAppVersion: config.cAppVersion,
            sourceSign: config.sourceSign,
            cVirtualModel: config.cVirtualModel,
            cPkg: config.cPkg,
            partnerCode: config.partnerCode,
        }),
        devInfoText: JSON.stringify({
            source: config.source,
            sourceSign: config.sourceSign,
            activateTimestamp: config.activateTimestamp,
            csize: config.cSize,
            cresolution: config.cResolution,
            cpattern: config.cPattern,
            mac: config.mac,
            cudid: config.cudid,
            cvaid: config.cVaid,
            cpkg: config.cPkg,
            keyValueMap: {},
            cmodel: config.cModel,
            cchip: config.cChip,
            ctcVersion: config.cTcVersion,
            clicense: config.cLicense,
            cappVersion: config.cAppVersion,
            copenId: config.cOpenId,
            cvirtualModel: config.cVirtualModel,
        }),
    };
}

type CoocaaMediaStore = {
    config: CoocaaMediaConnectionConfig;
    updateConfig: <K extends keyof CoocaaMediaConnectionConfig>(key: K, value: CoocaaMediaConnectionConfig[K]) => void;
    resetConfig: () => void;
};

export const useCoocaaMediaStore = create<CoocaaMediaStore>((set) => ({
    config: DEFAULT_COOCAA_MEDIA_CONFIG,
    updateConfig: (key, value) => set((state) => ({ config: { ...state.config, [key]: value } })),
    resetConfig: () => set({ config: DEFAULT_COOCAA_MEDIA_CONFIG }),
}));
