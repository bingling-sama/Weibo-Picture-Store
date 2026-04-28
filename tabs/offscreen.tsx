import { useEffect, useState } from "react";

function Offscreen() {
    const [srcUrl] = useState(() => new URLSearchParams(location.search).get("srcUrl") || "");

    useEffect(() => {
        if (!srcUrl) {
            window.setTimeout(() => window.close(), 300);
            return;
        }

        const timer = window.setTimeout(() => {
            window.close();
        }, 4000);

        return () => window.clearTimeout(timer);
    }, [srcUrl]);

    return (
        <main style={{ display: "none" }}>
            {srcUrl ? <iframe title="weibo-login-activator" src={srcUrl} style={{ display: "none" }} /> : null}
        </main>
    );
}

export default Offscreen;
