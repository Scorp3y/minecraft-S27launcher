import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
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

type LogType = "INFO" | "OK" | "ERR";

type LogItem = {
    type: LogType;
    text: string;
};

type NavSection = "home" | "news" | "builds" | "settings";

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

function App() {
    const [settings, setSettings] = useState<LauncherSettings>(defaultSettings);
    const [launcherContent, setLauncherContent] =
        useState<LauncherContent>(defaultContent);

    const [isLaunching, setIsLaunching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const [logs, setLogs] = useState<LogItem[]>([
        { type: "INFO", text: "Лаунчер запущен" },
        { type: "INFO", text: "Активная сборка: McDonalds Dnepr" },
    ]);

    const logsRef = useRef<HTMLDivElement | null>(null);

    const [activeSection, setActiveSection] = useState<NavSection>("home");

    const homeRef = useRef<HTMLElement | null>(null);
    const newsRef = useRef<HTMLElement | null>(null);
    const buildsRef = useRef<HTMLElement | null>(null);
    const settingsRef = useRef<HTMLElement | null>(null);

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
        setLogs((prev) => [...prev, { type, text }]);
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

    async function saveSettings() {
        try {
            setIsSaving(true);

            await invoke("save_settings", {
                settings,
            });

            addLog("OK", "Настройки сохранены");
        } catch (error) {
            console.error(error);
            addLog("ERR", `Не удалось сохранить настройки: ${String(error)}`);
        } finally {
            setIsSaving(false);
        }
    }

    async function updateInstance() {
        try {
            setIsUpdating(true);

            addLog("INFO", "Проверка файлов сборки");
            addLog("INFO", "Синхронизация mods, config и resourcepacks");

            const result = await invoke<string>("update_instance");

            addLog("OK", "Сборка проверена и готова к запуску");

            if (result.trim()) {
                const shortResult = result
                    .split("\n")
                    .filter((line) => line.trim().length > 0)
                    .slice(-6);

                for (const line of shortResult) {
                    addLog("INFO", line);
                }
            }
        } catch (error) {
            console.error(error);
            addLog("ERR", "Ошибка при проверке файлов");
            addLog("ERR", String(error));
        } finally {
            setIsUpdating(false);
        }
    }

    async function launchMinecraft() {
        if (!settings.username.trim()) {
            addLog("ERR", "Введите ник игрока");
            return;
        }

        try {
            setIsLaunching(true);
            setIsUpdating(true);

            addLog("INFO", `Подготовка профиля: ${settings.username}`);
            addLog("INFO", "Сохранение настроек запуска");

            await invoke("save_settings", {
                settings,
            });

            addLog("OK", "Настройки применены");
            addLog("INFO", "Проверка файлов сборки");
            addLog("INFO", "Синхронизация mods, config и resourcepacks");

            const updateResult = await invoke<string>("update_instance");

            addLog("OK", "Файлы сборки проверены");

            if (updateResult.trim()) {
                const shortResult = updateResult
                    .split("\n")
                    .filter((line) => line.trim().length > 0)
                    .slice(-5);

                for (const line of shortResult) {
                    addLog("INFO", line);
                }
            }

            setIsUpdating(false);

            addLog("INFO", `Выделение памяти: ${settings.ramMin} - ${settings.ramMax}`);
            addLog("INFO", "Запуск Forge 1.19.2");

            await invoke<string>("launch_minecraft", {
                settings,
            });

            addLog("OK", "Minecraft запускается");

            if (settings.closeLauncherAfterStart) {
                setTimeout(async () => {
                    await getCurrentWindow().close();
                }, 1200);
            }
        } catch (error) {
            console.error(error);
            addLog("ERR", "Ошибка при запуске Minecraft");
            addLog("ERR", String(error));
        } finally {
            setIsUpdating(false);

            setTimeout(() => {
                setIsLaunching(false);
            }, 1500);
        }
    }

    async function minimizeWindow() {
        await getCurrentWindow().minimize();
    }

    async function closeWindow() {
        await getCurrentWindow().close();
    }

    useEffect(() => {
        loadSettings();
        loadLauncherContent();
    }, []);

    useEffect(() => {
        logsRef.current?.scrollTo({
            top: logsRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [logs]);

    return (
        <main className="app">
            <div className="window-bar" data-tauri-drag-region>
                <div className="window-title" data-tauri-drag-region>
                    SECTOR 27 Launcher
                </div>

                <div className="window-actions">
                    <button className="window-btn" onClick={minimizeWindow} title="Свернуть">
                        —
                    </button>
                    <button className="window-btn close" onClick={closeWindow} title="Закрыть">
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
                            <div className="brand-subtitle">Private Launcher</div>
                        </div>
                    </div>

                    <nav className="nav">
                        <button
                            className={`nav-item ${activeSection === "home" ? "active" : ""}`}
                            onClick={() => scrollToSection("home", homeRef)}
                        >
                            <span>01</span>
                            Главная
                        </button>

                        <button
                            className={`nav-item ${activeSection === "news" ? "active" : ""}`}
                            onClick={() => scrollToSection("news", newsRef)}
                        >
                            <span>02</span>
                            Новости
                        </button>

                        <button
                            className={`nav-item ${activeSection === "builds" ? "active" : ""}`}
                            onClick={() => scrollToSection("builds", buildsRef)}
                        >
                            <span>03</span>
                            Сборки
                        </button>

                        <button
                            className={`nav-item ${activeSection === "settings" ? "active" : ""}`}
                            onClick={() => scrollToSection("settings", settingsRef)}
                        >
                            <span>04</span>
                            Настройки
                        </button>
                    </nav>

                    <div className="sidebar-build">
                        <div className="sidebar-build-label">Текущая сборка</div>
                        <div className="sidebar-build-name">McDonalds Dnepr</div>
                        <div className="sidebar-build-meta">Forge 1.19.2 · RPG Pack</div>
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
                        <section className="hero" ref={homeRef}>
                            <div className="hero-content">
                                <div className="hero-kicker">{launcherContent.build.kicker}</div>

                                <h1>
                                    {launcherContent.build.titleLine1}
                                    <span>{launcherContent.build.titleLine2}</span>
                                </h1>

                                <p>{launcherContent.build.slogan}</p>

                                <div className="hero-tags">
                                    {launcherContent.build.tags.map((tag) => (
                                        <span key={tag}>{tag}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="status-card">
                                <div className="status-top">
                                    <span className="pulse"></span>
                                    {launcherContent.server.stateLabel}
                                </div>

                                <div className="status-grid">
                                    <div>
                                        <span>Онлайн</span>
                                        <strong>{launcherContent.server.players}</strong>
                                    </div>

                                    <div>
                                        <span>Пинг</span>
                                        <strong>{launcherContent.server.ping}</strong>
                                    </div>
                                </div>

                                <div className="status-version">
                                    <span>Версия клиента</span>
                                    <strong>{launcherContent.server.version}</strong>
                                </div>
                            </div>
                        </section>

                        <section className="quick-actions">
                            <button
                                className="play-button"
                                onClick={launchMinecraft}
                                disabled={isLaunching || isUpdating}
                            >
                                <span>{isLaunching ? "Запуск" : "Играть"}</span>
                                <small>Проверка и запуск сборки</small>
                            </button>

                            <button
                                className="update-button"
                                onClick={updateInstance}
                                disabled={isUpdating || isLaunching}
                            >
                                <span>{isUpdating ? "Проверка" : "Проверить"}</span>
                                <small>Файлы сборки</small>
                            </button>

                            <button
                                className="secondary-button"
                                onClick={saveSettings}
                                disabled={isSaving}
                            >
                                <span>Сохранить</span>
                                <small>Профиль и память</small>
                            </button>
                        </section>

                        <section className="build-section" ref={buildsRef}>
                            <div className="section-heading">
                                <div>
                                    <h2>О сборке</h2>
                                    <p>Основные особенности клиента McDonalds Dnepr</p>
                                </div>
                            </div>

                            <div className="build-grid">
                                <article className="build-card accent">
                                    <div className="build-card-label">Версия</div>
                                    <h3>Forge 1.19.2</h3>
                                    <p>Стабильная база сборки с поддержкой модов, колоний и технического прогресса.</p>
                                </article>

                                <article className="build-card">
                                    <div className="build-card-label">Геймплей</div>
                                    <h3>RPG + Колонии</h3>
                                    <p>Развитие персонажа, поселения, профессии жителей и постепенный рост базы.</p>
                                </article>

                                <article className="build-card">
                                    <div className="build-card-label">Технологии</div>
                                    <h3>Create</h3>
                                    <p>Механизмы, автоматизация, производство ресурсов и инженерные системы.</p>
                                </article>

                                <article className="build-card">
                                    <div className="build-card-label">Атмосфера</div>
                                    <h3>Community</h3>
                                    <p>Спокойная кооперативная игра, общие проекты и дружеское развитие сервера.</p>
                                </article>
                            </div>
                        </section>

                        <section className="dashboard" ref={settingsRef}>
                            <div className="panel player-panel">
                                <div className="panel-header">
                                    <div>
                                        <h2>Профиль игрока</h2>
                                        <p>Ник, Java и поведение лаунчера</p>
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
                                        Закрывать лаунчер после запуска игры
                                    </span>
                                </label>
                            </div>

                            <div className="panel memory-panel">
                                <div className="panel-header">
                                    <div>
                                        <h2>Память клиента</h2>
                                        <p>Рекомендуемый режим для сборки: 4–6 GB</p>
                                    </div>
                                </div>

                                <div className="memory-current">
                                    <span>Выбрано</span>
                                    <strong>
                                        {settings.ramMin} — {settings.ramMax}
                                    </strong>
                                </div>

                                <div className="memory-fields">
                                    <label className="field">
                                        <span>Минимум RAM</span>
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
                                        <span>Максимум RAM</span>
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

                                <div className="memory-bar">
                                    <div className="memory-fill"></div>
                                </div>
                            </div>
                        </section>

                        <section className="news-section" ref={newsRef}>
                            <div className="section-heading">
                                <div>
                                    <h2>Новости проекта</h2>
                                    <p>Актуальная информация по сборке и серверу</p>
                                </div>
                            </div>

                            <div className="news-grid">
                                {launcherContent.news.map((item, index) => (
                                    <article className="news-card" key={index}>
                                        <div className="news-tag">{item.tag}</div>
                                        <h3>{item.title}</h3>
                                        <p>{item.text}</p>
                                        <span>{item.date}</span>
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="log-panel">
                            <div className="log-header">
                                <div>
                                    <span>Лог лаунчера</span>
                                    <small>События запуска и настроек</small>
                                </div>

                                <button onClick={() => setLogs([])}>Очистить</button>
                            </div>

                            <div className="log-list" ref={logsRef}>
                                {logs.map((log, index) => (
                                    <div className={`log-line ${log.type.toLowerCase()}`} key={index}>
                                        <span>{log.type}</span>
                                        <p>{log.text}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </section>
            </div>
        </main>
    );
}

export default App;