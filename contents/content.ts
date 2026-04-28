import type { PlasmoCSConfig } from "plasmo";
import type { ContentMessage } from "../shared/constants";

export const config = {
    matches: ["<all_urls>"],
    all_frames: true,
    match_about_blank: true,
    run_at: "document_start",
    css: [],
} as PlasmoCSConfig;

let pointerEnabled = false;

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.cmd === "WriteToClipboard") {
        navigator.clipboard.writeText(message.content).then(
            () => sendResponse({ valid: true, done: true }),
            () => sendResponse({ valid: true, done: false }),
        );
        return true;
    }

    if (message.cmd === "AllowPointerEvents") {
        pointerEnabled = !pointerEnabled;
        document.documentElement.dataset["rewritePointerEvents"] = String(pointerEnabled);
        document.documentElement.style.outline = pointerEnabled ? "4px solid rgba(255, 0, 0, 0.8)" : "";
        sendResponse({ valid: true });
        return true;
    }

    if (message.cmd === "CaptureVideoFrame") {
        const videoRefs = document.querySelectorAll("video");
        for (const videoRef of videoRefs) {
            if (videoRef.currentSrc && videoRef.currentSrc !== message.srcUrl) {
                continue;
            }

            const width = videoRef.videoWidth;
            const height = videoRef.videoHeight;
            if (!width || !height) {
                sendResponse({ found: false });
                return true;
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) {
                sendResponse({ found: false });
                return true;
            }

            context.drawImage(videoRef, 0, 0, width, height);
            try {
                sendResponse({ found: true, dataURL: canvas.toDataURL("image/jpeg", 0.92) });
            } catch {
                sendResponse({ found: false });
            }
            return true;
        }

        sendResponse({ found: false });
        return true;
    }
});

document.addEventListener(
    "contextmenu",
    (event) => {
        if (pointerEnabled) {
            event.stopImmediatePropagation();
        }
    },
    true,
);
