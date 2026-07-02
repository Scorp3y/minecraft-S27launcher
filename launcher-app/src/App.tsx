import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AuthGate } from "./auth/AuthGate";
import { getCurrentUser, type AuthUser } from "./auth/authApi";
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
    maintenance: {
        enabled: boolean;
        title: string;
        message: string;
        allowAdmins: boolean;
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

type RamInfo = {
    totalBytes: number;
    availableBytes: number;
    totalGb: number;
    availableGb: number;
    recommendedMin: string;
    recommendedMax: string;
    warningLimitGb: number;
    note: string;
};

type LogType = "INFO" | "OK" | "ERR";

type LogItem = {
    type: LogType;
    text: string;
};

type SkinPreview = {
    name: string;
    size: number;
    width: number;
    height: number;
    dataUrl: string;
    updatedAt: string;
};

type ModScanFile = {
    name: string;
    path: string;
    size: number;
    reason: string;
};

type ModScanResult = {
    status: "ok" | "warning" | "error" | string;
    modsPath: string;
    expectedSource: string;
    expectedJarCount: number;
    installedJarCount: number;
    extraJarFiles: ModScanFile[];
    emptyJarFiles: ModScanFile[];
    suspiciousFiles: ModScanFile[];
    nestedDirectories: string[];
    issues: string[];
    scannedAt: number;
};

type NavSection = "home" | "builds" | "settings" | "profile" | "news";

type LauncherShellProps = {
    authUser: AuthUser;
    accessToken: string;
    onLogout: () => void;
};

const SKIN_STORAGE_KEY = "sector27.launcher.skinPreview";

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
    maintenance: {
        enabled: false,
        title: "Технические работы",
        message: "Сервер временно недоступен. Следите за новостями SECTOR 27.",
        allowAdmins: true,
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

function maskEmail(email: string) {
    const [name, domain] = email.split("@");

    if (!name || !domain) {
        return email;
    }

    if (name.length <= 3) {
        return `${name.slice(0, 1)}***@${domain}`;
    }

    return `${name.slice(0, 1)}${"*".repeat(Math.min(8, name.length - 3))}${name.slice(-2)}@${domain}`;
}

function formatAuthDate(value: string | null) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        return "0 KB";
    }

    if (value >= 1024 * 1024 * 1024) {
        return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
    }

    if (value >= 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(2)} MB`;
    }

    return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function parseRamGigabytes(value: string) {
    const match = value.trim().toUpperCase().match(/^(\d+(?:\.\d+)?)G$/);

    if (!match) {
        return 0;
    }

    return Number(match[1]);
}

function formatRamLabel(value: string) {
    const gb = parseRamGigabytes(value);

    if (!gb) {
        return value;
    }

    return `${gb} GB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
            }

            reject(new Error("Не удалось прочитать PNG-файл."));
        };

        reader.onerror = () => {
            reject(new Error("Не удалось прочитать PNG-файл."));
        };

        reader.readAsDataURL(file);
    });
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
            });
        };

        image.onerror = () => {
            reject(new Error("Файл не похож на корректный PNG skin."));
        };

        image.src = dataUrl;
    });
}

function readStoredSkinPreview(): SkinPreview | null {
    try {
        const raw = window.localStorage.getItem(SKIN_STORAGE_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as SkinPreview;

        if (!parsed.dataUrl || !parsed.width || !parsed.height) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

function getAccountRoleView(role: string) {
    switch (role) {
        case "admin":
            return {
                label: "ADMIN",
                className: "admin",
            };

        case "moderator":
            return {
                label: "MODERATOR",
                className: "moderator",
            };

        case "user":
            return {
                label: "USER",
                className: "user",
            };

        default:
            return {
                label: role.toUpperCase(),
                className: "unknown",
            };
    }
}

function getAccountStatusView(status: string) {
    switch (status) {
        case "active":
            return {
                label: "ACTIVE",
                className: "active",
                title: "Аккаунт активен",
                description:
                    "Профиль полностью доступен. Можно запускать Minecraft и пользоваться лаунчером.",
            };

        case "pending_email_verification":
            return {
                label: "EMAIL REQUIRED",
                className: "pending",
                title: "Нужно подтвердить почту",
                description:
                    "Почта ещё не подтверждена. Подтверди email, чтобы аккаунт стал полностью активным.",
            };

        case "banned":
            return {
                label: "BANNED",
                className: "banned",
                title: "Аккаунт заблокирован",
                description:
                    "Доступ к запуску может быть ограничен администрацией проекта.",
            };

        case "disabled":
            return {
                label: "DISABLED",
                className: "disabled",
                title: "Аккаунт отключён",
                description:
                    "Профиль временно отключён. Обратись к администрации SECTOR 27.",
            };

        default:
            return {
                label: status.toUpperCase(),
                className: "unknown",
                title: "Неизвестный статус",
                description:
                    "Лаунчер получил нестандартный статус аккаунта. Лучше обновить профиль.",
            };
    }
}

function LauncherShell({ authUser, accessToken, onLogout }: LauncherShellProps) {
    const [currentUser, setCurrentUser] = useState<AuthUser>(authUser);
    const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
    const [profileNotice, setProfileNotice] = useState<string | null>(null);
    const [profileError, setProfileError] = useState<string | null>(null);

    const [skinPreview, setSkinPreview] = useState<SkinPreview | null>(() =>
        readStoredSkinPreview()
    );
    const [skinNotice, setSkinNotice] = useState<string | null>(null);
    const [skinError, setSkinError] = useState<string | null>(null);
    const [isCheckingSkin, setIsCheckingSkin] = useState(false);

    const [settings, setSettings] = useState<LauncherSettings>(defaultSettings);
    const [launcherContent, setLauncherContent] =
        useState<LauncherContent>(defaultContent);

    const [serverStatus, setServerStatus] = useState<LiveServerStatus | null>(null);
    const [ramInfo, setRamInfo] = useState<RamInfo | null>(null);
    const [ramNotice, setRamNotice] = useState<string | null>(null);
    const [ramError, setRamError] = useState<string | null>(null);

    const [modScanResult, setModScanResult] = useState<ModScanResult | null>(null);
    const [isScanningMods, setIsScanningMods] = useState(false);
    const [modScanError, setModScanError] = useState<string | null>(null);

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
    const skinInputRef = useRef<HTMLInputElement | null>(null);

    const [activeSection, setActiveSection] = useState<NavSection>("home");

    const homeRef = useRef<HTMLElement | null>(null);
    const aboutRef = useRef<HTMLElement | null>(null);
    const settingsRef = useRef<HTMLElement | null>(null);
    const profileRef = useRef<HTMLElement | null>(null);
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
        if (key === "ramMin" || key === "ramMax") {
            setRamNotice(null);
            setRamError(null);
        }

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
                username: loaded.username || currentUser.nickname || defaultSettings.username,
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
                maintenance: {
                    ...defaultContent.maintenance,
                    ...loaded.maintenance,
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

    async function loadRamInfo() {
        try {
            const info = await invoke<RamInfo>("get_ram_info");

            setRamInfo(info);
            setRamError(null);
            addLog(
                "OK",
                `RAM системы: ${info.totalGb} GB · рекомендовано ${info.recommendedMin} - ${info.recommendedMax}`
            );
        } catch (error) {
            console.error(error);
            setRamError(`Не удалось получить RAM системы: ${String(error)}`);
            addLog("ERR", `Не удалось получить RAM системы: ${String(error)}`);
        }
    }

    function applyRecommendedRam() {
        if (!ramInfo) {
            setRamError("Информация о RAM ещё не загружена.");
            return;
        }

        setSettings((prev) => ({
            ...prev,
            ramMin: ramInfo.recommendedMin,
            ramMax: ramInfo.recommendedMax,
        }));

        setRamError(null);
        setRamNotice(
            `Применено: ${formatRamLabel(ramInfo.recommendedMin)} - ${formatRamLabel(ramInfo.recommendedMax)}`
        );
        addLog(
            "OK",
            `RAM авто: ${ramInfo.recommendedMin} - ${ramInfo.recommendedMax}`
        );
    }


    async function scanInstanceMods() {
        try {
            setIsScanningMods(true);
            setModScanError(null);

            const result = await invoke<ModScanResult>("scan_instance_mods");

            setModScanResult(result);

            if (result.status === "ok") {
                addLog("OK", `Mods scanner: ${result.installedJarCount} .jar, проблем нет`);
            } else {
                addLog(
                    "ERR",
                    `Mods scanner: найдено проблем: ${result.issues.length}`
                );
            }
        } catch (error) {
            const message = String(error);

            setModScanError(message);
            addLog("ERR", `Mods scanner failed: ${message}`);
        } finally {
            setIsScanningMods(false);
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

        if (isLaunchBlockedByMaintenance) {
            const message = `${launcherContent.maintenance.title}: ${launcherContent.maintenance.message}`;

            addLog("ERR", "Запуск заблокирован: maintenance mode");
            addLog("ERR", message);
            setLaunchError(message);
            setLaunchProgress({
                currentStep: "prepare",
                message,
                percent: 0,
                status: "error",
            });
            return;
        }

        try {
            resetLaunchProgress("Проверка аккаунта");
            setIsLaunching(true);
            setIsUpdating(true);

            await verifyAccountBeforeLaunch();

            resetLaunchProgress("Подготовка профиля");
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

    async function refreshProfile() {
        try {
            setIsRefreshingProfile(true);
            setProfileNotice(null);
            setProfileError(null);

            const freshUser = await getCurrentUser(accessToken);

            setCurrentUser(freshUser);
            setProfileNotice("Профиль обновлён.");
            addLog("OK", "Профиль аккаунта обновлён");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Не удалось обновить профиль";

            setProfileError(message);
            addLog("ERR", `Не удалось обновить профиль: ${message}`);
        } finally {
            setIsRefreshingProfile(false);
        }
    }

    async function verifyAccountBeforeLaunch() {
        addLog("INFO", "Проверка статуса аккаунта перед запуском");

        const freshUser = await getCurrentUser(accessToken);
        setCurrentUser(freshUser);

        if (freshUser.status !== "active") {
            const statusView = getAccountStatusView(freshUser.status);

            throw new Error(
                `Запуск заблокирован: ${statusView.title}. ${statusView.description}`
            );
        }

        addLog("OK", "Аккаунт активен, запуск разрешён");
    }

    function chooseSkinFile() {
        setSkinNotice(null);
        setSkinError(null);
        skinInputRef.current?.click();
    }

    async function handleSkinFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        event.target.value = "";

        if (!file) {
            return;
        }

        setIsCheckingSkin(true);
        setSkinNotice(null);
        setSkinError(null);

        try {
            const lowerName = file.name.toLowerCase();
            const isPng = file.type === "image/png" || lowerName.endsWith(".png");

            if (!isPng) {
                throw new Error("Можно выбрать только PNG-файл скина.");
            }

            if (file.size > 1024 * 1024) {
                throw new Error("Файл слишком большой. Максимум 1 MB.");
            }

            const dataUrl = await readFileAsDataUrl(file);
            const size = await readImageSize(dataUrl);

            const isValidSkinSize =
                (size.width === 64 && size.height === 64) ||
                (size.width === 64 && size.height === 32);

            if (!isValidSkinSize) {
                throw new Error(
                    `Неверный размер skin: ${size.width}x${size.height}. Нужен PNG 64x64 или 64x32.`
                );
            }

            const nextSkin: SkinPreview = {
                name: file.name,
                size: file.size,
                width: size.width,
                height: size.height,
                dataUrl,
                updatedAt: new Date().toISOString(),
            };

            setSkinPreview(nextSkin);
            window.localStorage.setItem(SKIN_STORAGE_KEY, JSON.stringify(nextSkin));
            setSkinNotice("Skin проверен и сохранён локально для preview.");
            addLog("OK", `Skin выбран: ${file.name} (${size.width}x${size.height})`);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Не удалось выбрать skin.";

            setSkinError(message);
            addLog("ERR", `Skin не принят: ${message}`);
        } finally {
            setIsCheckingSkin(false);
        }
    }

    function clearSkinPreview() {
        setSkinPreview(null);
        setSkinNotice("Локальный skin preview очищен.");
        setSkinError(null);
        window.localStorage.removeItem(SKIN_STORAGE_KEY);
        addLog("INFO", "Локальный skin preview очищен");
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
        setCurrentUser(authUser);
    }, [authUser]);

    useEffect(() => {
        prepareRuntime();
        loadSettings();
        loadLauncherContent();
        loadRamInfo();
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

    const maintenance = launcherContent.maintenance;
    const isMaintenanceEnabled = maintenance.enabled;
    const canBypassMaintenance = Boolean(
        isMaintenanceEnabled && maintenance.allowAdmins && currentUser.role === "admin"
    );
    const isLaunchBlockedByMaintenance = isMaintenanceEnabled && !canBypassMaintenance;
    const maintenanceBadgeLabel = canBypassMaintenance ? "ADMIN BYPASS" : "MAINTENANCE";

    const activeStep =
        launchSteps.find((step) => step.id === launchProgress.currentStep)?.label ??
        "Выполняется";

    const playButtonTitle = isLaunchBlockedByMaintenance
        ? "Техработы"
        : isRepairing
            ? "Ремонт"
            : isLaunching
                ? "Запуск"
                : "Играть";

    const playButtonSubtitle = isLaunchBlockedByMaintenance
        ? launcherContent.maintenance.title
        : isBusy && launchProgress.message
            ? launchProgress.message
            : "Forge 1.19.2 · McDonalds Dnepr";

    const latestErrorLogs = logs.slice(-7);

    const accountRole = getAccountRoleView(currentUser.role);
    const accountStatus = getAccountStatusView(currentUser.status);
    const isAdminAccount = currentUser.role === "admin";
    const isAccountActive = currentUser.status === "active";

    const selectedMaxRamGb = parseRamGigabytes(settings.ramMax);
    const selectedMinRamGb = parseRamGigabytes(settings.ramMin);
    const isRamTooHigh = Boolean(
        ramInfo && selectedMaxRamGb > ramInfo.warningLimitGb
    );
    const isRamRangeInvalid = Boolean(
        selectedMinRamGb && selectedMaxRamGb && selectedMinRamGb > selectedMaxRamGb
    );

    const modScanIssueCount = modScanResult?.issues.length ?? 0;

    const modScanStatusLabel = !modScanResult
        ? "IDLE"
        : modScanResult.status === "ok"
            ? "OK"
            : modScanResult.status === "warning"
                ? "WARNING"
                : modScanResult.status === "error"
                    ? "ERROR"
                    : modScanResult.status.toUpperCase();


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
                            className={`nav-item ${activeSection === "profile" ? "active" : ""}`}
                            onClick={() => scrollToSection("profile", profileRef)}
                        >
                            <span>👤</span>
                            Профиль
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

                    <div className="profile-card account-card">
                        <div className="account-main">
                            <div className="profile-avatar">
                                {currentUser.nickname.slice(0, 1).toUpperCase() || "S"}
                            </div>

                            <div className="profile-meta">
                                <div className="profile-name">{currentUser.nickname}</div>
                                <div className="profile-role">{maskEmail(currentUser.email)}</div>
                            </div>
                        </div>

                        <button className="logout-button" onClick={onLogout}>
                            Выйти
                        </button>
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

                                {isMaintenanceEnabled && (
                                    <article className={`maintenance-banner ${canBypassMaintenance ? "admin" : "blocked"}`}>
                                        <div>
                                            <span>{maintenanceBadgeLabel}</span>
                                            <h2>{maintenance.title}</h2>
                                            <p>{maintenance.message}</p>
                                        </div>

                                        <strong>
                                            {canBypassMaintenance
                                                ? "Администратор может запускать"
                                                : "Запуск временно заблокирован"}
                                        </strong>
                                    </article>
                                )}

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

                                <section className="account-profile-section" ref={profileRef}>
                                    <div className="account-profile-hero">
                                        <div className="account-profile-main">
                                            <div className="account-profile-avatar">
                                                {currentUser.nickname.slice(0, 1).toUpperCase() || "S"}
                                            </div>

                                            <div className="account-profile-identity">
                                                <div className="eyebrow">👤 Профиль аккаунта</div>

                                                <div className="account-profile-title-row">
                                                    <h2>{currentUser.nickname}</h2>

                                                    <span className={`account-role-badge ${accountRole.className}`}>
                                                        {accountRole.label}
                                                    </span>

                                                    {isAdminAccount && (
                                                        <span className="account-admin-badge">
                                                            ADMIN ACCESS
                                                        </span>
                                                    )}
                                                </div>

                                                <p>{maskEmail(currentUser.email)}</p>
                                            </div>
                                        </div>

                                        <div className={`account-status-card ${accountStatus.className}`}>
                                            <span>{accountStatus.label}</span>
                                            <strong>{accountStatus.title}</strong>
                                            <p>{accountStatus.description}</p>
                                        </div>
                                    </div>

                                    {!isAccountActive && (
                                        <div className={`account-warning ${accountStatus.className}`}>
                                            <strong>Внимание</strong>
                                            <p>{accountStatus.description}</p>
                                        </div>
                                    )}

                                    <div className="account-profile-grid">
                                        <article className="account-info-panel">
                                            <div className="section-title compact">
                                                <div>
                                                    <span>ACCOUNT DATA</span>
                                                    <h2>Данные аккаунта</h2>
                                                </div>
                                            </div>

                                            <div className="account-info-list">
                                                <div className="account-info-row">
                                                    <span>Nickname</span>
                                                    <strong>{currentUser.nickname}</strong>
                                                </div>

                                                <div className="account-info-row">
                                                    <span>Email</span>
                                                    <strong>{maskEmail(currentUser.email)}</strong>
                                                </div>

                                                <div className="account-info-row">
                                                    <span>Role</span>
                                                    <strong>{currentUser.role}</strong>
                                                </div>

                                                <div className="account-info-row">
                                                    <span>Status</span>
                                                    <strong>{currentUser.status}</strong>
                                                </div>
                                            </div>
                                        </article>

                                        <article className="account-info-panel">
                                            <div className="section-title compact">
                                                <div>
                                                    <span>TIMELINE</span>
                                                    <h2>Активность</h2>
                                                </div>
                                            </div>

                                            <div className="account-info-list">
                                                <div className="account-info-row">
                                                    <span>Registered</span>
                                                    <strong>{formatAuthDate(currentUser.registered_at)}</strong>
                                                </div>

                                                <div className="account-info-row">
                                                    <span>Email verified</span>
                                                    <strong>{formatAuthDate(currentUser.email_verified_at)}</strong>
                                                </div>

                                                <div className="account-info-row">
                                                    <span>Last login</span>
                                                    <strong>{formatAuthDate(currentUser.last_login_at)}</strong>
                                                </div>
                                            </div>
                                        </article>
                                    </div>

                                    {(profileNotice || profileError) && (
                                        <div className={profileError ? "account-message error" : "account-message"}>
                                            {profileError || profileNotice}
                                        </div>
                                    )}

                                    <div className="account-actions">
                                        <button
                                            className="account-action-button"
                                            onClick={() => void refreshProfile()}
                                            disabled={isRefreshingProfile}
                                        >
                                            <span>↻</span>
                                            {isRefreshingProfile ? "Обновляем..." : "Обновить профиль"}
                                        </button>

                                        <button
                                            className="account-action-button danger"
                                            onClick={onLogout}
                                        >
                                            <span>⏻</span>
                                            Выйти из аккаунта
                                        </button>
                                    </div>
                                </section>

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
                                        disabled={isBusy || isLaunchBlockedByMaintenance}
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

                                <article className="skin-panel">
                                    <div className="section-title compact">
                                        <div>
                                            <span>🧍 Minecraft Skin</span>
                                            <h2>Скин игрока</h2>
                                        </div>
                                    </div>

                                    <input
                                        ref={skinInputRef}
                                        className="skin-file-input"
                                        type="file"
                                        accept="image/png,.png"
                                        onChange={(event) => void handleSkinFileChange(event)}
                                    />

                                    <div className="skin-preview-box">
                                        {skinPreview ? (
                                            <img
                                                src={skinPreview.dataUrl}
                                                alt="Minecraft skin preview"
                                            />
                                        ) : (
                                            <div className="skin-preview-empty">
                                                <span>PNG</span>
                                                <p>64x64 или 64x32</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="skin-meta">
                                        <div>
                                            <span>Файл</span>
                                            <strong>{skinPreview?.name || "Не выбран"}</strong>
                                        </div>

                                        <div>
                                            <span>Размер</span>
                                            <strong>
                                                {skinPreview
                                                    ? `${skinPreview.width}x${skinPreview.height} · ${formatBytes(skinPreview.size)}`
                                                    : "PNG до 1 MB"}
                                            </strong>
                                        </div>
                                    </div>

                                    {(skinNotice || skinError) && (
                                        <div className={skinError ? "skin-message error" : "skin-message"}>
                                            {skinError || skinNotice}
                                        </div>
                                    )}

                                    <div className="skin-actions">
                                        <button
                                            type="button"
                                            onClick={chooseSkinFile}
                                            disabled={isBusy || isCheckingSkin}
                                        >
                                            <span>🖼</span>
                                            {isCheckingSkin ? "Проверяем..." : "Выбрать PNG"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={clearSkinPreview}
                                            disabled={!skinPreview || isBusy}
                                        >
                                            <span>✕</span>
                                            Очистить
                                        </button>
                                    </div>

                                    <p className="skin-hint">
                                        Сейчас это локальный preview. Следующим шагом подключим применение skin к Minecraft через выбранную схему.
                                    </p>
                                </article>

                                <article className="mod-scan-panel">
                                    <div className="section-title compact">
                                        <div>
                                            <span>🧪 Mod Scanner</span>
                                            <h2>Проверка mods</h2>
                                        </div>
                                    </div>

                                    <div className={`mod-scan-status ${modScanResult?.status || "idle"}`}>
                                        <span>{modScanStatusLabel}</span>
                                        <strong>
                                            {modScanResult
                                                ? `${modScanResult.installedJarCount} .jar · проблем: ${modScanIssueCount}`
                                                : "Проверка ещё не запускалась"}
                                        </strong>
                                    </div>

                                    <div className="mod-scan-grid">
                                        <div>
                                            <span>Ожидается</span>
                                            <strong>
                                                {modScanResult?.expectedJarCount
                                                    ? `${modScanResult.expectedJarCount} .jar`
                                                    : "—"}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>Источник</span>
                                            <strong>{modScanResult?.expectedSource || "—"}</strong>
                                        </div>
                                    </div>

                                    {modScanResult?.issues.length ? (
                                        <div className="mod-scan-issues">
                                            {modScanResult.issues.slice(0, 4).map((issue, index) => (
                                                <p key={index}>{issue}</p>
                                            ))}
                                        </div>
                                    ) : null}

                                    {modScanResult && (
                                        <div className="mod-scan-lists">
                                            {modScanResult.extraJarFiles.length > 0 && (
                                                <div>
                                                    <span>Лишние .jar</span>
                                                    {modScanResult.extraJarFiles.slice(0, 4).map((file) => (
                                                        <p key={file.path}>{file.name} · {formatBytes(file.size)}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {modScanResult.emptyJarFiles.length > 0 && (
                                                <div>
                                                    <span>Пустые .jar</span>
                                                    {modScanResult.emptyJarFiles.slice(0, 4).map((file) => (
                                                        <p key={file.path}>{file.name}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {modScanResult.suspiciousFiles.length > 0 && (
                                                <div>
                                                    <span>Не .jar файлы</span>
                                                    {modScanResult.suspiciousFiles.slice(0, 4).map((file) => (
                                                        <p key={file.path}>{file.name} · {formatBytes(file.size)}</p>
                                                    ))}
                                                </div>
                                            )}

                                            {modScanResult.nestedDirectories.length > 0 && (
                                                <div>
                                                    <span>Папки внутри mods</span>
                                                    {modScanResult.nestedDirectories.slice(0, 4).map((name) => (
                                                        <p key={name}>{name}</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {modScanError && (
                                        <div className="mod-scan-message error">
                                            {modScanError}
                                        </div>
                                    )}

                                    <div className="mod-scan-actions">
                                        <button
                                            type="button"
                                            onClick={() => void scanInstanceMods()}
                                            disabled={isBusy || isScanningMods}
                                        >
                                            <span>🔍</span>
                                            {isScanningMods ? "Проверяем..." : "Проверить mods"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={repairInstance}
                                            disabled={isBusy || isScanningMods}
                                        >
                                            <span>🛠</span>
                                            Починить
                                        </button>
                                    </div>

                                    <p className="mod-scan-hint">
                                        Сканер пока только показывает проблемы. Автоудаление лишних файлов подключим отдельным безопасным этапом.
                                    </p>
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

                                    <div className="ram-advisor-card">
                                        <div className="ram-advisor-top">
                                            <div>
                                                <span>RAM Advisor</span>
                                                <strong>
                                                    {ramInfo
                                                        ? `${ramInfo.totalGb} GB установлено · ${ramInfo.availableGb} GB свободно`
                                                        : "Определяем RAM системы..."}
                                                </strong>
                                            </div>

                                            <button
                                                type="button"
                                                className="ram-auto-button"
                                                onClick={applyRecommendedRam}
                                                disabled={!ramInfo || isBusy}
                                            >
                                                Авто
                                            </button>
                                        </div>

                                        <p>
                                            {ramInfo
                                                ? ramInfo.note
                                                : "Лаунчер получит объём RAM через Rust backend и предложит безопасные значения для сборки."}
                                        </p>

                                        {ramInfo && (
                                            <div className="ram-recommendation">
                                                <span>Рекомендовано</span>
                                                <strong>
                                                    {formatRamLabel(ramInfo.recommendedMin)} - {formatRamLabel(ramInfo.recommendedMax)}
                                                </strong>
                                            </div>
                                        )}

                                        {(ramNotice || ramError || isRamTooHigh || isRamRangeInvalid) && (
                                            <div
                                                className={
                                                    ramError || isRamTooHigh || isRamRangeInvalid
                                                        ? "ram-message error"
                                                        : "ram-message"
                                                }
                                            >
                                                {ramError ||
                                                    (isRamRangeInvalid
                                                        ? "Min RAM не должен быть больше Max RAM."
                                                        : isRamTooHigh
                                                            ? `Выбрано ${settings.ramMax}, это слишком много для ${ramInfo?.totalGb ?? "?"} GB RAM. Лучше не поднимать выше ${ramInfo?.warningLimitGb ?? "?"}G.`
                                                            : ramNotice)}
                                            </div>
                                        )}
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

function App() {
    return (
        <AuthGate>
            {({ user, accessToken, logout }) => (
                <LauncherShell
                    authUser={user}
                    accessToken={accessToken}
                    onLogout={logout}
                />
            )}
        </AuthGate>
    );
}

export default App;