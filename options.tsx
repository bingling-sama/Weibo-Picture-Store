import { useEffect, useState } from "react";

import "./legacy-ui.css";

import { getSettings, setSettings } from "./shared/storage";

function Options() {
    const [autoDisplayChangelog, setAutoDisplayChangelog] = useState(true);
    const [inheritWeiboWatermark, setInheritWeiboWatermark] = useState(false);
    const [allowUserAccount, setAllowUserAccount] = useState(false);
    const [accountUsername, setAccountUsername] = useState("");
    const [accountPassword, setAccountPassword] = useState("");
    const [httpRefererForge, setHttpRefererForge] = useState(false);
    const [httpRefererLocked, setHttpRefererLocked] = useState(false);

    useEffect(() => {
        void getSettings().then((settings) => {
            setAutoDisplayChangelog(settings.autoDisplayChangelog);
            setInheritWeiboWatermark(settings.inheritWeiboWatermark);
            setAllowUserAccount(settings.allowUserAccount);
            setAccountUsername(settings.accountUsername);
            setAccountPassword(settings.accountPassword);
        });

        chrome.permissions?.contains?.({ origins: ["*://*/*"] }, (result) => {
            setHttpRefererForge(result);
            setHttpRefererLocked(result);
        });
    }, []);

    const persist = async (
        next: Partial<{
            autoDisplayChangelog: boolean;
            inheritWeiboWatermark: boolean;
            allowUserAccount: boolean;
            accountUsername: string;
            accountPassword: string;
        }>,
    ) => {
        const nextState = {
            autoDisplayChangelog,
            inheritWeiboWatermark,
            allowUserAccount,
            accountUsername,
            accountPassword,
            ...next,
        };
        setAutoDisplayChangelog(nextState.autoDisplayChangelog);
        setInheritWeiboWatermark(nextState.inheritWeiboWatermark);
        setAllowUserAccount(nextState.allowUserAccount);
        setAccountUsername(nextState.accountUsername);
        setAccountPassword(nextState.accountPassword);
        await setSettings(nextState);
    };

    const requestHttpRefererPermission = () => {
        const oldValue = httpRefererForge;
        setHttpRefererForge(true);
        chrome.permissions?.request?.({ origins: ["*://*/*"] }, (granted) => {
            if (chrome.runtime.lastError || !granted) {
                setHttpRefererForge(oldValue);
                setHttpRefererLocked(oldValue);
                return;
            }
            setHttpRefererForge(true);
            setHttpRefererLocked(true);
        });
    };

    return (
        <div className="legacy-options">
            <h2>选项</h2>
            <div>
                <label title="扩展更新时显示此次更新的内容">
                    <input
                        type="checkbox"
                        value="auto_display_changelog"
                        checked={autoDisplayChangelog}
                        onChange={(event) => void persist({ autoDisplayChangelog: event.target.checked })}
                    />
                    <span>通知我更新详情</span>
                </label>
            </div>
            <div className="weibo-watermark">
                <label title="必须同时启用微博图片水印，图片水印才会生效呦~">
                    <input
                        type="checkbox"
                        value="weibo_inherited_watermark"
                        checked={inheritWeiboWatermark}
                        onChange={(event) => void persist({ inheritWeiboWatermark: event.target.checked })}
                    />
                    <span>继承微博图片水印</span>
                </label>
                <a
                    title="如何设置微博图片水印"
                    target="_blank"
                    href="https://www.weibo.com/ttarticle/p/show?id=2309404137032606682721"
                    rel="noreferrer"
                >
                    <i className="fa fa-info-circle" />
                </a>
            </div>
            <div className="http-referer">
                <label title="勾选此选项将同时开启该扩展的HTTP访问控制，可解决右键上传无法读取远程文件的问题">
                    <input
                        type="checkbox"
                        value="http_referer_forge"
                        checked={httpRefererForge}
                        disabled={httpRefererLocked}
                        onChange={requestHttpRefererPermission}
                    />
                    <span>伪造 HTTP Referer</span>
                </label>
                <a
                    title="HTTP访问控制(CORS)详解"
                    target="_blank"
                    href="https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS"
                    rel="noreferrer"
                >
                    <i className="fa fa-info-circle" />
                </a>
            </div>
            <h2>微博账户</h2>
            <div>
                <label title="账号/密码不会同步到任何服务器上">
                    <input
                        type="checkbox"
                        value="allow_user_account"
                        checked={allowUserAccount}
                        onChange={(event) => void persist({ allowUserAccount: event.target.checked })}
                    />
                    <span>使用账号和密码登录</span>
                </label>
                <fieldset disabled={!allowUserAccount}>
                    <div>
                        <label title="邮箱/手机号">
                            <input
                                spellCheck={false}
                                type="text"
                                placeholder="邮箱/手机号"
                                id="username"
                                value={accountUsername}
                                onChange={(event) => setAccountUsername(event.target.value)}
                            />
                        </label>
                    </div>
                    <div>
                        <label title="请输入密码">
                            <input
                                spellCheck={false}
                                type="password"
                                placeholder="请输入密码"
                                id="password"
                                value={accountPassword}
                                onChange={(event) => setAccountPassword(event.target.value)}
                            />
                        </label>
                    </div>
                    <div>
                        <label>
                            <input
                                spellCheck={false}
                                type="button"
                                value="确认"
                                id="confirm"
                                onClick={() => void persist({ accountUsername, accountPassword, allowUserAccount })}
                            />
                        </label>
                    </div>
                </fieldset>
            </div>
        </div>
    );
}

export default Options;
