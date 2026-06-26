import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    type AuthUser,
    confirmPasswordReset,
    getCurrentUser,
    loginAccount,
    registerAccount,
    requestPasswordReset,
    resendVerificationCode,
    verifyEmail,
} from "./authApi";
import {
    clearAccessToken,
    getStoredAccessToken,
    saveAccessToken,
} from "./authStorage";
import "./AuthGate.css";

type AuthMode = "login" | "register" | "verifyEmail" | "forgotPassword" | "resetPassword";

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

    const [login, setLogin] = useState("");
    const [email, setEmail] = useState("");
    const [nickname, setNickname] = useState("");
    const [password, setPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [code, setCode] = useState("");

    const [pendingEmail, setPendingEmail] = useState("");
    const [resetEmail, setResetEmail] = useState("");

    const [isBooting, setIsBooting] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [authNotice, setAuthNotice] = useState<string | null>(null);

    const title = useMemo(() => {
        switch (mode) {
            case "register":
                return "Создание аккаунта";
            case "verifyEmail":
                return "Подтверждение почты";
            case "forgotPassword":
                return "Восстановление пароля";
            case "resetPassword":
                return "Новый пароль";
            case "login":
            default:
                return "Вход в аккаунт";
        }
    }, [mode]);

    const subtitle = useMemo(() => {
        switch (mode) {
            case "register":
                return "Создайте аккаунт SECTOR 27 для доступа к лаунчеру и игровому профилю.";
            case "verifyEmail":
                return "Введите 6-значный код, который мы отправили на вашу почту.";
            case "forgotPassword":
                return "Укажите email аккаунта, и мы отправим код восстановления пароля.";
            case "resetPassword":
                return "Введите код из письма и задайте новый пароль для аккаунта.";
            case "login":
            default:
                return "Войдите в свой аккаунт SECTOR 27, чтобы продолжить запуск лаунчера.";
        }
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
        setNewPassword("");
        setCode("");
        setAuthError(null);
        setAuthNotice(null);
    }

    function switchMode(nextMode: AuthMode) {
        setMode(nextMode);
        setAuthError(null);
        setAuthNotice(null);
        setPassword("");
        setNewPassword("");
        setCode("");

        if (nextMode === "login") {
            setPendingEmail("");
            setResetEmail("");
        }
    }

    function applyAuthSuccess(token: string, currentUser: AuthUser) {
        saveAccessToken(token);
        setAccessToken(token);
        setUser(currentUser);
        setPassword("");
        setNewPassword("");
        setCode("");
        setAuthError(null);
        setAuthNotice(null);
    }

    function normalizeCode(value: string) {
        return value.replace(/\D/g, "").slice(0, 6);
    }

    function getSubmitLabel() {
        if (isSubmitting) {
            return "Подключение...";
        }

        switch (mode) {
            case "register":
                return "Создать аккаунт";
            case "verifyEmail":
                return "Подтвердить почту";
            case "forgotPassword":
                return "Отправить код";
            case "resetPassword":
                return "Обновить пароль";
            case "login":
            default:
                return "Войти";
        }
    }

    async function submitAuth(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setAuthError(null);
        setAuthNotice(null);
        setIsSubmitting(true);

        try {
            if (mode === "login") {
                const response = await loginAccount({
                    login: login.trim(),
                    password,
                });

                applyAuthSuccess(response.access_token, response.user);
                return;
            }

            if (mode === "register") {
                const cleanEmail = email.trim();
                const cleanNickname = nickname.trim();

                await registerAccount({
                    email: cleanEmail,
                    nickname: cleanNickname,
                    password,
                });

                setPendingEmail(cleanEmail);
                setEmail(cleanEmail);
                setPassword("");
                setCode("");
                setMode("verifyEmail");
                setAuthNotice("Код подтверждения отправлен на почту.");
                return;
            }

            if (mode === "verifyEmail") {
                const targetEmail = (pendingEmail || email).trim();

                const response = await verifyEmail({
                    email: targetEmail,
                    code: code.trim(),
                });

                applyAuthSuccess(response.access_token, response.user);
                return;
            }

            if (mode === "forgotPassword") {
                const cleanEmail = email.trim();

                await requestPasswordReset({
                    email: cleanEmail,
                });

                setResetEmail(cleanEmail);
                setEmail(cleanEmail);
                setCode("");
                setNewPassword("");
                setMode("resetPassword");
                setAuthNotice("Код восстановления отправлен на почту.");
                return;
            }

            if (mode === "resetPassword") {
                const targetEmail = (resetEmail || email).trim();

                await confirmPasswordReset({
                    email: targetEmail,
                    code: code.trim(),
                    new_password: newPassword,
                });

                setLogin(targetEmail);
                setPassword("");
                setNewPassword("");
                setCode("");
                setMode("login");
                setAuthNotice("Пароль обновлён. Теперь можно войти.");
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Не удалось выполнить действие";

            setAuthError(message);

            if (message.includes("Почта не подтверждена")) {
                const targetEmail = login.includes("@") ? login.trim() : email.trim();

                if (targetEmail) {
                    setPendingEmail(targetEmail);
                    setEmail(targetEmail);
                    setMode("verifyEmail");
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    async function resendCode() {
        const targetEmail = (pendingEmail || email).trim();

        if (!targetEmail) {
            setAuthError("Укажите email для отправки кода.");
            return;
        }

        setAuthError(null);
        setAuthNotice(null);
        setIsSubmitting(true);

        try {
            await resendVerificationCode({
                email: targetEmail,
            });

            setAuthNotice("Новый код подтверждения отправлен на почту.");
        } catch (error) {
            setAuthError(
                error instanceof Error ? error.message : "Не удалось отправить код"
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
                        <span>SECTOR 27 Launcher</span>
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
                    <span>SECTOR 27 Launcher</span>
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

                {(mode === "login" || mode === "register") && (
                    <div className="auth-tabs">
                        <button
                            type="button"
                            className={mode === "login" ? "auth-tab active" : "auth-tab"}
                            onClick={() => switchMode("login")}
                        >
                            Войти
                        </button>

                        <button
                            type="button"
                            className={mode === "register" ? "auth-tab active" : "auth-tab"}
                            onClick={() => switchMode("register")}
                        >
                            Регистрация
                        </button>
                    </div>
                )}

                <form className="auth-form" onSubmit={submitAuth}>
                    {mode === "login" && (
                        <>
                            <label className="auth-field">
                                <span>Email или Nickname</span>
                                <input
                                    type="text"
                                    placeholder="Email или Nickname"
                                    value={login}
                                    autoComplete="username"
                                    onChange={(event) => setLogin(event.target.value)}
                                    required
                                />
                            </label>

                            <label className="auth-field">
                                <span>Пароль</span>
                                <input
                                    type="password"
                                    placeholder="Введите пароль"
                                    value={password}
                                    autoComplete="current-password"
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                />
                            </label>
                        </>
                    )}

                    {mode === "register" && (
                        <>
                            <label className="auth-field">
                                <span>Email</span>
                                <input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    autoComplete="email"
                                    onChange={(event) => setEmail(event.target.value)}
                                    required
                                />
                            </label>

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

                            <label className="auth-field">
                                <span>Пароль</span>
                                <input
                                    type="password"
                                    placeholder="Введите пароль"
                                    value={password}
                                    autoComplete="new-password"
                                    onChange={(event) => setPassword(event.target.value)}
                                    required
                                />
                            </label>
                        </>
                    )}

                    {mode === "verifyEmail" && (
                        <>
                            <label className="auth-field">
                                <span>Email</span>
                                <input
                                    type="email"
                                    value={pendingEmail || email}
                                    onChange={(event) => {
                                        setPendingEmail(event.target.value);
                                        setEmail(event.target.value);
                                    }}
                                    required
                                />
                            </label>

                            <label className="auth-field">
                                <span>Код подтверждения</span>
                                <input
                                    type="text"
                                    placeholder="6 цифр"
                                    value={code}
                                    inputMode="numeric"
                                    maxLength={6}
                                    onChange={(event) => setCode(normalizeCode(event.target.value))}
                                    required
                                />
                            </label>
                        </>
                    )}

                    {mode === "forgotPassword" && (
                        <label className="auth-field">
                            <span>Email</span>
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                autoComplete="email"
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                        </label>
                    )}

                    {mode === "resetPassword" && (
                        <>
                            <label className="auth-field">
                                <span>Email</span>
                                <input
                                    type="email"
                                    value={resetEmail || email}
                                    onChange={(event) => {
                                        setResetEmail(event.target.value);
                                        setEmail(event.target.value);
                                    }}
                                    required
                                />
                            </label>

                            <label className="auth-field">
                                <span>Код восстановления</span>
                                <input
                                    type="text"
                                    placeholder="6 цифр"
                                    value={code}
                                    inputMode="numeric"
                                    maxLength={6}
                                    onChange={(event) => setCode(normalizeCode(event.target.value))}
                                    required
                                />
                            </label>

                            <label className="auth-field">
                                <span>Новый пароль</span>
                                <input
                                    type="password"
                                    placeholder="Введите новый пароль"
                                    value={newPassword}
                                    autoComplete="new-password"
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    required
                                />
                            </label>
                        </>
                    )}

                    {authNotice && <div className="auth-message">{authNotice}</div>}
                    {authError && <div className="auth-error">{authError}</div>}

                    <button className="auth-submit" type="submit" disabled={isSubmitting}>
                        {getSubmitLabel()}
                    </button>
                </form>

                <div className="auth-actions">
                    {mode === "login" && (
                        <button type="button" onClick={() => switchMode("forgotPassword")}>
                            Забыли пароль?
                        </button>
                    )}

                    {mode === "verifyEmail" && (
                        <button
                            type="button"
                            onClick={() => void resendCode()}
                            disabled={isSubmitting}
                        >
                            Отправить код ещё раз
                        </button>
                    )}

                    {(mode === "verifyEmail" ||
                        mode === "forgotPassword" ||
                        mode === "resetPassword") && (
                            <button type="button" onClick={() => switchMode("login")}>
                                Вернуться ко входу
                            </button>
                        )}
                </div>

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