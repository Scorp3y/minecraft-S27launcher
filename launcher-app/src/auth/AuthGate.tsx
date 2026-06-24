import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    AuthUser,
    getCurrentUser,
    loginAccount,
    registerAccount,
} from "./authApi";
import {
    clearAccessToken,
    getStoredAccessToken,
    saveAccessToken,
} from "./authStorage";
import "./AuthGate.css";

type AuthMode = "login" | "register";

type AuthGateProps = {
    children: (auth: {
        user: AuthUser;
        accessToken: string;
        logout: () => void;
    }) => ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
    const [mode, setMode] = useState<AuthMode>("login");
    const [accessToken, setAccessToken] = useState<string | null>(() =>
        getStoredAccessToken()
    );
    const [user, setUser] = useState<AuthUser | null>(null);

    const [email, setEmail] = useState("");
    const [nickname, setNickname] = useState("");
    const [password, setPassword] = useState("");

    const [isBooting, setIsBooting] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const title = useMemo(() => {
        return mode === "login" ? "Вход в аккаунт" : "Создание аккаунта";
    }, [mode]);

    const subtitle = useMemo(() => {
        return mode === "login"
            ? "Войдите в свой аккаунт SECTOR 27, чтобы продолжить запуск лаунчера."
            : "Создайте аккаунт SECTOR 27 для доступа к лаунчеру и игровому профилю.";
    }, [mode]);

    useEffect(() => {
        let cancelled = false;

        async function boot() {
            setIsBooting(true);

            if (!accessToken) {
                setUser(null);
                setIsBooting(false);
                return;
            }

            try {
                const currentUser = await getCurrentUser(accessToken);

                if (!cancelled) {
                    setUser(currentUser);
                }
            } catch {
                clearAccessToken();

                if (!cancelled) {
                    setAccessToken(null);
                    setUser(null);
                }
            } finally {
                if (!cancelled) {
                    setIsBooting(false);
                }
            }
        }

        void boot();

        return () => {
            cancelled = true;
        };
    }, [accessToken]);

    async function minimizeWindow() {
        try {
            await getCurrentWindow().minimize();
        } catch (error) {
            console.error("Не удалось свернуть окно:", error);
        }
    }

    async function closeWindow() {
        try {
            await getCurrentWindow().close();
        } catch (error) {
            console.error("Не удалось закрыть окно:", error);
        }
    }

    function logout() {
        clearAccessToken();
        setAccessToken(null);
        setUser(null);
        setPassword("");
    }

    async function submitAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setAuthError(null);
        setIsSubmitting(true);

        try {
            const cleanEmail = email.trim();
            const cleanNickname = nickname.trim();

            const response =
                mode === "login"
                    ? await loginAccount({
                        email: cleanEmail,
                        password,
                    })
                    : await registerAccount({
                        email: cleanEmail,
                        nickname: cleanNickname,
                        password,
                    });

            saveAccessToken(response.access_token);
            setAccessToken(response.access_token);
            setUser(response.user);
            setPassword("");
        } catch (error) {
            setAuthError(
                error instanceof Error
                    ? error.message
                    : "Не удалось выполнить авторизацию"
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isBooting) {
        return (
            <div className="auth-screen">
                <div className="auth-window-bar">
                    <div className="auth-window-drag" data-tauri-drag-region>
                        <span>SECTOR 27 LAUNCHER</span>
                    </div>

                    <div className="auth-window-actions">
                        <button
                            className="auth-window-btn"
                            onClick={() => void minimizeWindow()}
                            title="Свернуть"
                        >
                            —
                        </button>
                        <button
                            className="auth-window-btn auth-window-btn-close"
                            onClick={() => void closeWindow()}
                            title="Закрыть"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div className="auth-card auth-card--loading">
                    <div className="auth-logo">S27</div>
                    <div className="auth-title">Проверка сессии</div>
                    <div className="auth-subtitle">Подключаемся к SECTOR 27 API...</div>
                </div>
            </div>
        );
    }

    if (user && accessToken) {
        return <>{children({ user, accessToken, logout })}</>;
    }

    return (
        <div className="auth-screen">
            <div className="auth-window-bar">
                <div className="auth-window-drag" data-tauri-drag-region>
                    <span>SECTOR 27 LAUNCHER</span>
                </div>

                <div className="auth-window-actions">
                    <button
                        className="auth-window-btn"
                        onClick={() => void minimizeWindow()}
                        title="Свернуть"
                    >
                        —
                    </button>
                    <button
                        className="auth-window-btn auth-window-btn-close"
                        onClick={() => void closeWindow()}
                        title="Закрыть"
                    >
                        ×
                    </button>
                </div>
            </div>

            <div className="auth-card">
                <div className="auth-logo">S27</div>

                <div className="auth-kicker">SECTOR 27 LAUNCHER</div>
                <h1 className="auth-title">{title}</h1>
                <p className="auth-subtitle">{subtitle}</p>

                <div className="auth-tabs">
                    <button
                        type="button"
                        className={mode === "login" ? "auth-tab active" : "auth-tab"}
                        onClick={() => {
                            setMode("login");
                            setAuthError(null);
                        }}
                    >
                        Войти
                    </button>

                    <button
                        type="button"
                        className={mode === "register" ? "auth-tab active" : "auth-tab"}
                        onClick={() => {
                            setMode("register");
                            setAuthError(null);
                        }}
                    >
                        Регистрация
                    </button>
                </div>

                <form className="auth-form" onSubmit={submitAuth}>
                    <label className="auth-field">
                        <span>{mode === "login" ? "Email или Nickname" : "Email"}</span>
                        <input
                            type={mode === "login" ? "text" : "email"}
                            placeholder={mode === "login" ? "Email или Nickname" : "you@example.com"}
                            value={email}
                            autoComplete={mode === "login" ? "username" : "email"}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                        />
                    </label>

                    {mode === "register" && (
                        <label className="auth-field">
                            <span>Nickname</span>
                            <input
                                type="text"
                                placeholder="Nickname"
                                value={nickname}
                                autoComplete="username"
                                onChange={(event) => setNickname(event.target.value)}
                                required
                            />
                        </label>
                    )}

                    <label className="auth-field">
                        <span>Пароль</span>
                        <input
                            type="password"
                            placeholder="Введите пароль"
                            value={password}
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                    </label>

                    {authError && <div className="auth-error">{authError}</div>}

                    <button className="auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? "Подключение..."
                            : mode === "login"
                                ? "Войти"
                                : "Создать аккаунт"}
                    </button>
                </form>

                <div className="auth-footer">
                    <span>Продолжая, вы соглашаетесь с правилами проекта.</span>
                    <button type="button" disabled>
                        Политика конфиденциальности скоро
                    </button>
                </div>
            </div>
        </div>
    );
}