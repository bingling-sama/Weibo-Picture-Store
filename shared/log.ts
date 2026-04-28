const MAXIMUM_LOGS = 2000;

type LogLevel = "debug" | "warn" | "error";

type LogInput = {
    module: string;
    remark?: unknown;
    error?: unknown;
};

type LogItem = {
    module: string;
    type: LogLevel;
    timestamp: number;
    remark: string;
    error: string;
};

const store: LogItem[] = [];

function stringify(value: unknown) {
    if (!value) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (value instanceof Error) {
        return value.message;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function add(type: LogLevel, input: LogInput) {
    while (store.length >= MAXIMUM_LOGS) {
        store.shift();
    }

    const item = {
        module: input.module,
        type,
        timestamp: Date.now(),
        remark: stringify(input.remark),
        error: stringify(input.error),
    };
    store.push(item);

    const writer = console[type] || console.log;
    writer(`[${item.module}]`, item.remark || item.error);
}

export const Log = {
    d(input: LogInput) {
        add("debug", input);
    },
    w(input: LogInput) {
        add("warn", input);
    },
    e(input: LogInput) {
        add("error", input);
    },
    serialize(types: LogLevel[] = ["debug", "warn", "error"]) {
        const pad = Math.max(...types.map((type) => type.length));
        const rows = [
            "------------------ Metadata Starting ------------------",
            `Version: ${chrome.runtime.getManifest().version}`,
            `User-Agent: ${navigator.userAgent}`,
            "------------------ Metadata Finished ------------------",
        ];

        for (const item of store) {
            if (!types.includes(item.type)) {
                continue;
            }
            rows.push(
                `[${item.type.toUpperCase().padEnd(pad, ".")}]-[${new Date(item.timestamp).toISOString()}]-[${
                    item.module
                }]-[${item.error}]-[${item.remark}]`,
            );
        }

        return rows.join("\r\n");
    },
    download() {
        const url = `data:text/plain;charset=utf-8,${encodeURIComponent(Log.serialize())}`;
        return chrome.downloads.download({
            url,
            filename: "Weibo-Picture-Store_logs.txt",
            saveAs: true,
        });
    },
};
