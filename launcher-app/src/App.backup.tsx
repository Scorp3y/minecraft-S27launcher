import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type LauncherSettings = {
    username: string;
    ramMin: string;
    ramMax: string;
    javaPath: string;
    closeLauncherAfterStart: boolean;
};

type LauncherContent = {
    build: {
        kicker: string;
        titleLine1: string;
        titleLine2: string;
        slogan: string;
        tags: string[];
    };
    server: {
        stateLabel: string;
        players: string;
        ping: string;
        version: string;
    };
    news: {
        tag: string;
        title: string;
        text: string;
        date: string;
    }[];
};

type ServerState = "online" | "sleeping" | "offline";

type LaunchStepId =
    | "prepare"
    | "manifest"
    | "mods"
    | "config"
    | "resourcepacks"
    | "servers"
    | "launch"
    | "done";

type ProgressStatus = "pending" | "active" | "done" | "error";

type LaunchProgressEvent = {
    step: string;
    label: string;
    message: string;
    percent: number;
    status: string;
};

type LaunchProgress = {
    currentStep: LaunchStepId;
    message: string;
    percent: number;
    status: ProgressStatus;
};

type LiveServerStatus = {
    state: ServerState;
    online: boolean;
    sleeping: boolean;
    host: string;
    port: number;
    playersOnline: number;
    maxPlayers: number;
    pingMs: number | null;
    version: string;
    description: string;
    error?: string;
};

type RuntimeInfo = {
    root: string;
    launcherData: string;
    settingsFile: string;
    logs: string;
    logFile: string;
    instances: string;
    activeInstance: string;
    cache: string;
    downloadsCache: string;
    manifestsCache: string;
    iconsCache: string;
    temp: string;
    backups: string;
    runtime: string;
    runtimeFile: string;
};

type LogType = "INFO" | "OK" | "ERR";

type LogItem = {
    type: LogType;
    text: string;
};

type NavSection = "home" | "builds" | "settings" | "news";

const SERVER_ADDRESS = "yarik_anime_studio.exaroton.me:46919";

const defaultSettings: LauncherSettings = {
    username: "Scorpy",
    ramMin: "2G",
    ramMax: "4G",
    javaPath: "java",
    closeLauncherAfterStart: false,
};

const defaultContent: LauncherContent = {
    build: {
        kicker: "RPG · CREATE · MINECOLONIES",
        titleLine1: "McDonalds",
        titleLine2: "Dnepr",
        slogan:
            "RPG-сборка с технологиями Create, развитием собственной колонии, атмосферным прогрессом и дружной серверной атмосферой.",
        tags: ["MineColonies", "Create", "RPG Progression", "Community"],
    },
    server: {
        stateLabel: "СЕРВЕР АКТИВЕН",
        players: "24 / 100",
        ping: "34 ms",
        version: "Forge 1.19.2 · 43.4.12",
    },
    news: [
        {
            tag: "СЕЗОН",
            title: "Открытие сборки",
            text: "Игроков ждёт развитие поселений, технологические цепочки Create и RPG-прогрессия.",
            date: "SECTOR 27",
        },
        {
            tag: "МОДЫ",
            title: "MineColonies и Create",
            text: "Строй колонию, автоматизируй производство и развивай базу вместе с другими игроками.",
            date: "McDonalds Dnepr",
        },
        {
            tag: "КОМЬЮНИТИ",
            title: "Дружеская атмосфера",
            text: "Сборка рассчитана на спокойную кооперативную игру, развитие и общие проекты.",
            date: "Online",
        },
    ],
};

const launchSteps: { id: LaunchStepId; label: string }[] = [
    { id: "prepare", label: "Подготовка" },
    { id: "manifest", label: "Manifest" },
    { id: "mods", label: "Mods" },
    { id: "config", label: "Config" },
    { id: "resourcepacks", label: "Resourcepacks" },
    { id: "servers", label: "servers.dat" },
    { id: "launch", label: "Запуск" },
    { id: "done", label: "Готово" },
];

const initialProgress: LaunchProgress = {
    currentStep: "prepare",
    message: "Готов к запуску",
    percent: 0,
    status: "pending",
};

function isLaunchStepId(value: string): value is LaunchStepId {
    return launchSteps.some((step) => step.id === value);
}

function normalizeProgressStatus(value: string): ProgressStatus {
    if (
        value === "pending" ||
        value === "active" ||
        value === "done" ||
        value === "error"
    ) {
        return value;
    }

    return "active";
}

function clampPercent(value: number) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
}

function App() {
    const [settings, setSettings] = useState<LauncherSettings>(defaultSettings);
    const [launcherContent, setLauncherContent] =
        useState<LauncherContent>(defaultContent);

    const [serverStatus, setServerStatus] = useState<LiveServerStatus | null>(null);

    const [isLaunching, setIsLaunching] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);

    const [launchProgress, setLaunchProgress] =
        useState<LaunchProgress>(initialProgress);
    const [launchError, setLaunchError] = useState<string | null>(null);

    const [logs, setLogs] = useState<LogItem[]>([
        { type: "INFO", text: "Лаунчер запущен" },
        { type: "INFO", text: "Активная сборка: McDonalds Dnepr" },
    ]);

    const logsRef = useRef<HTMLDivElement | null>(null);

    const [activeSection, setActiveSection] = useState<NavSection>("home");

    const homeRef = useRef<HTMLElement | null>(null);
    const aboutRef = useRef<HTMLElement | null>(null);
    const settingsRef = useRef<HTMLElement | null>(null);
    const newsRef = useRef<HTMLElement | null>(null);

    function scrollToSection(
        section: NavSection,
        ref: RefObject<HTMLElement | null>
    ) {
        setActiveSection(section);

        ref.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
    }

    function addLog(type: LogType, text: string) {
        const time = new Date().toLocaleTimeString("ru-RU", {
            hour12: false,
        });

        const fileLine = `[${time}] [${type}] ${text}`;

        setLogs((prev) => [...prev, { type, text }]);

        void invoke("append_launcher_log", {
            line: fileLine,
        }).catch((error) => {
            console.error("Не удалось записать launcher.log:", error);
        });
    }

    function resetLaunchProgress(message = "Подготовка запуска") {
        setLaunchError(null);
        setLaunchProgress({
            currentStep: "prepare",
            message,
            percent: 1,
            status: "active",
        });
    }

    function applyProgressEvent(event: LaunchProgressEvent) {
        const currentStep = isLaunchStepId(event.step) ? event.step : "prepare";
        const status = normalizeProgressStatus(event.status);

        setLaunchProgress({
            currentStep,
            message: event.message || event.label || "Выполняется операция",
            percent: clampPercent(event.percent),
            status,
        });

        if (status === "error") {
            setLaunchError(event.message || "Неизвестная ошибка запуска");
        }
    }

    function setProgressError(error: unknown) {
        const message = String(error);

        setLaunchError(message);
        setLaunchProgress((prev) => ({
            ...prev,
            message,
            status: "error",
        }));
    }

    function logBackendSummary(result: string, maxLines = 7) {
        const shortResult = result
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .slice(-maxLines);

        for (const line of shortResult) {
            addLog("INFO", line);
        }
    }

    function updateSettings<K extends keyof LauncherSettings>(
        key: K,
        value: LauncherSettings[K]
    ) {
        setSettings((prev) => ({
            ...prev,
            [key]: value,
        }));
    }

    async function prepareRuntime() {
        try {
            const runtime = await invoke<RuntimeInfo>("prepare_runtime");
            addLog("OK", `Runtime готов: ${runtime.root}`);
        } catch (error) {
            console.error(error);
            addLog("ERR", `Не удалось подготовить runtime: ${String(error)}`);
        }
    }

    async function loadSettings() {
        try {
            const loaded = await invoke<LauncherSettings>("read_settings");

            setSettings({
                username: loaded.username || defaultSettings.username,
                ramMin: loaded.ramMin || defaultSettings.ramMin,
                ramMax: loaded.ramMax || defaultSettings.ramMax,
                javaPath: loaded.javaPath || defaultSettings.javaPath,
                closeLauncherAfterStart:
                    loaded.closeLauncherAfterStart ??
                    defaultSettings.closeLauncherAfterStart,
            });

            addLog("OK", "Настройки профиля загружены");
        } catch (error) {
            console.error(error);
            addLog("ERR", `Не удалось загрузить настройки: ${String(error)}`);
        }
    }

    async function loadLauncherContent() {
        try {
            const loaded = await invoke<LauncherContent>("read_launcher_content");

            setLauncherContent({
                build: {
                    ...defaultContent.build,
                    ...loaded.build,
                },
                server: {
                    ...defaultContent.server,
                    ...loaded.server,
                },
                news:
                    loaded.news && loaded.news.length > 0
                        ? loaded.news
                        : defaultContent.news,
            });

            addLog("OK", "Контент лаунчера загружен");
        } catch (error) {
            console.error(error);
            setLauncherContent(defaultContent);
            addLog("ERR", `Не удалось загрузить контент: ${String(error)}`);
        }
    }

    async function loadServerStatus() {
        try {
            const status = await invoke<LiveServerStatus>("get_server_status");
            setServerStatus(status);
        } catch (error) {
            console.error(error);

            setServerStatus({
                state: "offline",
                online: false,
                sleeping: false,
                host: "yarik_anime_studio.exaroton.me",
                port: 46919,
                playersOnline: 0,
                maxPlayers: 0,
                pingMs: null,
                version: "Unknown",
                description: "",
                error: String(error),
            });
        }
    }

    async function launchMinecraft() {
        if (!settings.username.trim()) {
            addLog("ERR", "Введите ник игрока");
            setLaunchError("Введите ник игрока");
            return;
        }

        try {
            resetLaunchProgress("Подготовка профиля");
            setIsLaunching(true);
            setIsUpdating(true);

            addLog("INFO", `Подготовка профиля: ${settings.username}`);
            addLog("INFO", "Сохранение настроек запуска");

            await invoke("save_settings", {
                settings,
            });

            addLog("OK", "Настройки применены");

            const updateResult = await invoke<string>("update_instance");

            addLog("OK", "Файлы сборки проверены");

            if (updateResult.trim()) {
                logBackendSummary(updateResult);
            }

            setIsUpdating(false);

            addLog("INFO", `Выделение памяти: ${settings.ramMin} - ${settings.ramMax}`);
            addLog("INFO", "Запуск Forge 1.19.2");

            const launchResult = await invoke<string>("launch_minecraft", {
                settings,
            });

            addLog("OK", launchResult || "Minecraft запускается");

            if (settings.closeLauncherAfterStart) {
                setTimeout(async () => {
                    await getCurrentWindow().close();
                }, 1200);
            }
        } catch (error) {
            console.error(error);
            setProgressError(error);
            addLog("ERR", "Ошибка при запуске Minecraft");
            addLog("ERR", String(error));
        } finally {
            setIsUpdating(false);

            setTimeout(() => {
                setIsLaunching(false);
            }, 900);
        }
    }

    async function openGameFolder() {
        try {
            await invoke("open_game_folder");
            addLog("OK", "Открыта папка игры");
        } catch (error) {
            console.error(error);
            addLog("ERR", `Не удалось открыть папку игры: ${String(error)}`);
            setProgressError(error);
        }
    }

    async function openLogsFolder() {
        try {
            await invoke("open_logs_folder");
            addLog("OK", "Открыта папка логов");
        } catch (error) {
            console.error(error);
            addLog("ERR", `Не удалось открыть папку логов: ${String(error)}`);
            setProgressError(error);
        }
    }

    async function repairInstance() {
        try {
            resetLaunchProgress("Ремонт сборки");
            setIsRepairing(true);
            setIsUpdating(true);

            addLog("INFO", "Запущен ремонт сборки");
            addLog("INFO", "Очистка и повторная синхронизация файлов");

            const result = await invoke<string>("repair_instance");

            addLog("OK", "Сборка починена");

            if (result.trim()) {
                logBackendSummary(result, 10);
            }
        } catch (error) {
            console.error(error);
            setProgressError(error);
            addLog("ERR", "Ремонт сборки завершился ошибкой");
            addLog("ERR", String(error));
        } finally {
            setIsUpdating(false);
            setIsRepairing(false);
        }
    }

    async function minimizeWindow() {
        try {
            await getCurrentWindow().minimize();
        } catch (error) {
            console.error("Не удалось свернуть окно:", error);
            addLog("ERR", `Не удалось свернуть окно: ${String(error)}`);
            setProgressError(error);
        }
    }

    async function closeWindow() {
        try {
            await getCurrentWindow().close();
        } catch (error) {
            console.error("Не удалось закрыть окно:", error);
            addLog("ERR", `Не удалось закрыть окно: ${String(error)}`);
            setProgressError(error);
        }
    }

    useEffect(() => {
        let unlistenProgress: (() => void) | null = null;
        let mounted = true;

        listen<LaunchProgressEvent>("launch-progress", (event) => {
            applyProgressEvent(event.payload);
        })
            .then((unlisten) => {
                if (mounted) {
                    unlistenProgress = unlisten;
                } else {
                    unlisten();
                }
            })
            .catch((error) => {
                console.error("Не удалось подписаться на launch-progress:", error);
                addLog("ERR", `Не удалось включить прогресс запуска: ${String(error)}`);
            });

        return () => {
            mounted = false;
            unlistenProgress?.();
        };
    }, []);

    useEffect(() => {
        prepareRuntime();
        loadSettings();
        loadLauncherContent();
        loadServerStatus();

        const interval = window.setInterval(() => {
            loadServerStatus();
        }, 30000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        logsRef.current?.scrollTo({
            top: logsRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [logs]);

    const serverState = serverStatus?.state ?? "offline";

    const serverStateLabel =
        serverState === "online"
            ? "Онлайн"
            : serverState === "sleeping"
                ? "Спит"
                : "Недоступен";

    const serverPlayers =
        serverStatus && serverStatus.maxPlayers > 0
            ? `${serverStatus.playersOnline} / ${serverStatus.maxPlayers}`
            : "—";

    const serverPing =
        serverStatus?.pingMs !== null && serverStatus?.pingMs !== undefined
            ? `${serverStatus.pingMs} ms`
            : "—";

    const serverVersion =
        serverStatus?.version && serverStatus.version !== "Unknown"
            ? serverStatus.version
            : launcherContent.server.version;

    const isBusy = isLaunching || isUpdating || isRepairing;
    const showMiniProgress = isBusy;

    const activeStep =
        launchSteps.find((step) => step.id === launchProgress.currentStep)?.label ??
        "Выполняется";

    const playButtonTitle = isRepairing
        ? "Ремонт"
        : isLaunching
            ? "Запуск"
            : "Играть";

    const playButtonSubtitle =
        isBusy && launchProgress.message
            ? launchProgress.message
            : "Forge 1.19.2 · McDonalds Dnepr";

    const latestErrorLogs = logs.slice(-7);

    return (
        <main className="app">
            <div className="window-bar">
                <div className="window-drag" data-tauri-drag-region>
                    <span>SECTOR 27 Launcher</span>
                </div>

                <div className="window-actions">
                    <button
                        className="window-btn"
                        onClick={(event) => {
                            event.stopPropagation();
                            void minimizeWindow();
                        }}
                        title="Свернуть"
                    >
                        —
                    </button>
                    <button
                        className="window-btn close"
                        onClick={(event) => {
                            event.stopPropagation();
                            void closeWindow();
                        }}
                        title="Закрыть"
                    >
                        ×
                    </button>
                </div>
            </div>

            <div className="layout">
                <aside className="sidebar">
                    <div className="brand">
                        <div className="brand-mark">S27</div>
                        <div>
                            <div className="brand-title">SECTOR 27</div>
                            <div className="brand-subtitle">McDonalds Dnepr</div>
                        </div>
                    </div>

                    <nav className="nav">
                        <button
                            className={`nav-item ${activeSection === "home" ? "active" : ""}`}
                            onClick={() => scrollToSection("home", homeRef)}
                        >
                            <span>🌐</span>
                            Главная
                        </button>

                        <button
                            className={`nav-item ${activeSection === "builds" ? "active" : ""}`}
                            onClick={() => scrollToSection("builds", aboutRef)}
                        >
                            <span>📦</span>
                            Сборка
                        </button>

                        <button
                            className={`nav-item ${activeSection === "settings" ? "active" : ""}`}
                            onClick={() => scrollToSection("settings", settingsRef)}
                        >
                            <span>⚙️</span>
                            Настройки
                        </button>

                        <button
                            className={`nav-item ${activeSection === "news" ? "active" : ""}`}
                            onClick={() => scrollToSection("news", newsRef)}
                        >
                            <span>📰</span>
                            Новости
                        </button>
                    </nav>

                    <div className="sidebar-pack">
                        <span>Активная сборка</span>
                        <strong>McDonalds Dnepr</strong>
                        <p>Forge 1.19.2 · 43.4.12</p>
                    </div>

                    <div className="profile-card">
                        <div className="profile-avatar">
                            {settings.username.slice(0, 1).toUpperCase() || "P"}
                        </div>
                        <div>
                            <div className="profile-name">{settings.username || "Player"}</div>
                            <div className="profile-role">Игрок SECTOR 27</div>
                        </div>
                    </div>
                </aside>

                <section className="content">
                    <div className="scroll-area">
                        <section className="workspace" ref={homeRef}>
                            <div className="main-column">
                                <article className={`server-board ${serverState}`}>
                                    <div className="server-board-top">
                                        <div>
                                            <div className="eyebrow">🌐 Статус сервера</div>
                                            <h1>{serverStateLabel}</h1>
                                        </div>

                                        <div className={`status-dot ${serverState}`}></div>
                                    </div>

                                    <div className="server-metrics">
                                        <div>
                                            <span>Игроки</span>
                                            <strong>{serverPlayers}</strong>
                                        </div>
                                        <div>
                                            <span>Пинг</span>
                                            <strong>{serverPing}</strong>
                                        </div>
                                        <div>
                                            <span>Клиент</span>
                                            <strong>{serverVersion}</strong>
                                        </div>
                                    </div>
                                </article>

                                <article className="about-wide" ref={aboutRef}>
                                    <div className="eyebrow">📦 О сборке</div>
                                    <div className="about-content">
                                        <div>
                                            <h2>
                                                {launcherContent.build.titleLine1}{" "}
                                                <span>{launcherContent.build.titleLine2}</span>
                                            </h2>
                                            <p>{launcherContent.build.slogan}</p>
                                        </div>

                                        <div className="about-tags">
                                            <span>🏘 MineColonies</span>
                                            <span>🧪 Create</span>
                                            <span>⚔️ RPG Progression</span>
                                            <span>🤝 Community</span>
                                        </div>
                                    </div>
                                </article>

                                <section className="news-section" ref={newsRef}>
                                    <div className="section-title">
                                        <div>
                                            <span>📰 Новости</span>
                                            <h2>Последнее по проекту</h2>
                                        </div>
                                    </div>

                                    <div className="news-grid">
                                        {launcherContent.news.map((item, index) => (
                                            <article className="news-card" key={index}>
                                                <span>{item.tag}</span>
                                                <h3>{item.title}</h3>
                                                <p>{item.text}</p>
                                                <small>{item.date}</small>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            <aside className="right-column">
                                <article className="play-panel">
                                    <div className="play-panel-head">
                                        <span>🚀 Запуск</span>
                                        <strong>{settings.username || "Player"}</strong>
                                    </div>

                                    <button
                                        className="play-button"
                                        onClick={launchMinecraft}
                                        disabled={isBusy}
                                    >
                                        <span>{playButtonTitle}</span>
                                        <small>{playButtonSubtitle}</small>
                                    </button>

                                    {showMiniProgress && (
                                        <div className="mini-progress">
                                            <div className="mini-progress-top">
                                                <span>{activeStep}</span>
                                                <strong>{launchProgress.percent}%</strong>
                                            </div>
                                            <div className="mini-progress-line">
                                                <div
                                                    style={{
                                                        width: `${launchProgress.percent}%`,
                                                    }}
                                                ></div>
                                            </div>
                                            <p>{launchProgress.message}</p>
                                        </div>
                                    )}

                                    <div className="tool-buttons">
                                        <button onClick={openGameFolder} disabled={isBusy}>
                                            <span>📁</span>
                                            Папка игры
                                        </button>
                                        <button onClick={openLogsFolder} disabled={isBusy}>
                                            <span>📝</span>
                                            Логи
                                        </button>
                                        <button onClick={repairInstance} disabled={isBusy}>
                                            <span>🛠</span>
                                            Починить
                                        </button>
                                    </div>
                                </article>

                                <article className="settings-panel" ref={settingsRef}>
                                    <div className="section-title compact">
                                        <div>
                                            <span>⚙️ Настройки</span>
                                            <h2>Профиль</h2>
                                        </div>
                                    </div>

                                    <label className="field">
                                        <span>Ник игрока</span>
                                        <input
                                            value={settings.username}
                                            onChange={(event) =>
                                                updateSettings("username", event.target.value)
                                            }
                                            placeholder="Введите ник"
                                        />
                                    </label>

                                    <label className="field">
                                        <span>Java</span>
                                        <input
                                            value={settings.javaPath}
                                            onChange={(event) =>
                                                updateSettings("javaPath", event.target.value)
                                            }
                                            placeholder="java"
                                        />
                                    </label>

                                    <div className="ram-grid">
                                        <label className="field">
                                            <span>Min RAM</span>
                                            <select
                                                value={settings.ramMin}
                                                onChange={(event) =>
                                                    updateSettings("ramMin", event.target.value)
                                                }
                                            >
                                                <option value="1G">1 GB</option>
                                                <option value="2G">2 GB</option>
                                                <option value="3G">3 GB</option>
                                                <option value="4G">4 GB</option>
                                            </select>
                                        </label>

                                        <label className="field">
                                            <span>Max RAM</span>
                                            <select
                                                value={settings.ramMax}
                                                onChange={(event) =>
                                                    updateSettings("ramMax", event.target.value)
                                                }
                                            >
                                                <option value="2G">2 GB</option>
                                                <option value="3G">3 GB</option>
                                                <option value="4G">4 GB</option>
                                                <option value="5G">5 GB</option>
                                                <option value="6G">6 GB</option>
                                                <option value="8G">8 GB</option>
                                                <option value="10G">10 GB</option>
                                                <option value="12G">12 GB</option>
                                            </select>
                                        </label>
                                    </div>

                                    <label className="switch-field">
                                        <input
                                            type="checkbox"
                                            checked={settings.closeLauncherAfterStart}
                                            onChange={(event) =>
                                                updateSettings(
                                                    "closeLauncherAfterStart",
                                                    event.target.checked
                                                )
                                            }
                                        />
                                        <span className="switch-ui"></span>
                                        <span className="switch-text">
                                            Закрывать после запуска
                                        </span>
                                    </label>
                                </article>
                            </aside>
                        </section>
                    </div>
                </section>
            </div>

            {launchError && (
                <section className="error-console">
                    <div className="error-console-head">
                        <div>
                            <span>⚠️ Ошибка</span>
                            <strong>Последние события</strong>
                        </div>
                        <button onClick={() => setLaunchError(null)}>×</button>
                    </div>

                    <p className="error-text">{launchError}</p>

                    <div className="error-log" ref={logsRef}>
                        {latestErrorLogs.map((log, index) => (
                            <div className={`error-log-line ${log.type.toLowerCase()}`} key={index}>
                                <span>{log.type}</span>
                                <p>{log.text}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </main>
    );
}

export default App;