import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type LogType = "info" | "success" | "error";

type LogItem = {
    type: LogType;
    text: string;
};

function App() {
    const [username, setUsername] = useState("Scorpy");
    const [status, setStatus] = useState("Готов к работе");
    const [logs, setLogs] = useState<LogItem[]>([
        { type: "info", text: "Лаунчер запущен" },
        { type: "info", text: "Выбрана сборка McDonalds Dnepr" },
    ]);

    const logsRef = useRef<HTMLDivElement | null>(null);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        logsRef.current?.scrollTo({
            top: logsRef.current.scrollHeight,
            behavior: "smooth",
        });
    }, [logs]);

    function addLog(type: LogType, text: string) {
        setLogs((prev) => [...prev, { type, text }]);
    }

    function addMultilineLog(type: LogType, text: string) {
        const lines = text.split("\n").filter((line) => line.trim().length > 0);

        for (const line of lines) {
            addLog(type, line);
        }
    }

    async function handleUpdate() {
        setStatus("Проверка файлов...");
        addLog("info", "Начинаю проверку файлов сборки");

        try {
            const result = await invoke<string>("update_profile");

            setStatus("Файлы актуальны");
            addLog("success", "Проверка файлов завершена");
            addMultilineLog("info", result);
        } catch (error) {
            setStatus("Ошибка обновления");
            addLog("error", "Ошибка при обновлении файлов");
            addMultilineLog("error", String(error));
        }
    }

    async function handlePlay() {
        if (!username.trim()) {
            setStatus("Введите ник");
            addLog("error", "Никнейм не указан");
            return;
        }

        setStatus("Запуск Minecraft...");
        addLog("info", `Запуск Minecraft для игрока ${username}`);

        try {
            const result = await invoke<string>("launch_minecraft", {
                username: username.trim(),
            });

            setStatus("Minecraft запускается");
            addLog("success", result);
        } catch (error) {
            setStatus("Ошибка запуска");
            addLog("error", "Ошибка при запуске Minecraft");
            addMultilineLog("error", String(error));
        }
    }

    return (
        <main className="launcher">
            <aside className="sidebar">
                <div className="logo">
                    <div className="logo-cube">S27</div>

                    <div>
                        <h1>SECTOR 27</h1>
                        <p>Launcher</p>
                    </div>
                </div>

                <nav className="nav">
                    <button className="nav-item active">Главная</button>
                    <button className="nav-item">Новости</button>
                    <button className="nav-item">Сборки</button>
                    <button className="nav-item">Настройки</button>
                </nav>
            </aside>

            <section className="content">
                <header className="topbar" data-tauri-drag-region>
                    <div data-tauri-drag-region>
                        <h2>McDonalds Dnepr</h2>
                        <p>Minecraft 1.19.2 · Forge 43.4.12</p>
                    </div>

                    <div className="topbar-right">
                        <div className="status-pill">{status}</div>

                        <button
                            className="window-button"
                            onClick={() => appWindow.minimize()}
                            title="Свернуть"
                        >
                            —
                        </button>

                        <button
                            className="window-button close"
                            onClick={() => appWindow.close()}
                            title="Закрыть"
                        >
                            ×
                        </button>
                    </div>
                </header>

                <div className="content-scroll">
                    <div className="grid">
                        <section className="card hero-card">
                            <h3>Основная сборка сервера</h3>

                            <p>
                                Лаунчер проверяет моды, конфиги и ресурспаки, скачивает
                                недостающие файлы и удаляет лишние моды перед запуском игры.
                            </p>

                            <div className="profile-info">
                                <div>
                                    <span>Профиль</span>
                                    <strong>mcdonaldsdnepr</strong>
                                </div>

                                <div>
                                    <span>Версия сборки</span>
                                    <strong>1.0.0</strong>
                                </div>

                                <div>
                                    <span>Loader</span>
                                    <strong>Forge 43.4.12</strong>
                                </div>
                            </div>

                            <label className="input-label">
                                Никнейм
                                <input
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="Введите ник"
                                />
                            </label>

                            <div className="actions">
                                <button className="secondary-button" onClick={handleUpdate}>
                                    Проверить файлы
                                </button>

                                <button className="play-button" onClick={handlePlay}>
                                    Играть
                                </button>
                            </div>
                        </section>

                        <section className="card news-card">
                            <div className="banner">
                                <span>НОВЫЙ СЕЗОН</span>
                            </div>

                            <h3>Новости проекта</h3>

                            <p>
                                Скоро здесь будут новости, обновления сборки, статус сервера и
                                события проекта.
                            </p>

                            <ul>
                                <li>Автообновление модов</li>
                                <li>Удаление лишних файлов</li>
                                <li>Запуск Forge 1.19.2</li>
                            </ul>
                        </section>
                    </div>

                    <section className="card logs-card">
                        <div className="logs-header">
                            <h3>Лог лаунчера</h3>

                            <button className="clear-logs-button" onClick={() => setLogs([])}>
                                Очистить
                            </button>
                        </div>

                        <div className="logs" ref={logsRef}>
                            {logs.map((log, index) => (
                                <div key={index} className={`log-line ${log.type}`}>
                                    <span className="log-prefix">
                                        {log.type === "success"
                                            ? "OK"
                                            : log.type === "error"
                                                ? "ERR"
                                                : "INFO"}
                                    </span>

                                    <span>{log.text}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}

export default App;