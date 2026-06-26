export const AUTH_API_BASE_URL = "http://79.76.122.80/api";

export type AuthUser = {
    id: string;
    email: string;
    nickname: string;
    role: "user" | "moderator" | "admin" | string;
    status: "active" | "pending_email_verification" | "banned" | "disabled" | string;
    registered_at: string;
    email_verified_at: string | null;
    last_login_at: string | null;
};

export type AuthResponse = {
    access_token: string;
    token_type: "Bearer" | string;
    user: AuthUser;
};

export type MessageResponse = {
    status: string;
    message: string;
};

type ApiErrorResponse = {
    error?: string;
};

function translateApiError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes("email already registered")) {
        return "Аккаунт с таким email уже существует.";
    }

    if (normalized.includes("nickname already registered")) {
        return "Этот никнейм уже занят.";
    }

    if (normalized.includes("invalid email or password")) {
        return "Неверный email, никнейм или пароль.";
    }

    if (normalized.includes("email not verified")) {
        return "Почта не подтверждена. Введите код подтверждения из письма.";
    }

    if (normalized.includes("password must be 8-128 characters")) {
        return "Пароль должен быть от 8 до 128 символов.";
    }

    if (normalized.includes("password must contain lowercase letter")) {
        return "Пароль должен содержать хотя бы одну маленькую букву.";
    }

    if (normalized.includes("password must contain uppercase letter")) {
        return "Пароль должен содержать хотя бы одну большую букву.";
    }

    if (normalized.includes("password must contain digit")) {
        return "Пароль должен содержать хотя бы одну цифру.";
    }

    if (normalized.includes("nickname must be 3-32 characters")) {
        return "Никнейм должен быть от 3 до 32 символов.";
    }

    if (normalized.includes("nickname can contain only")) {
        return "Никнейм может содержать только латинские буквы, цифры, _ и -.";
    }

    if (normalized.includes("invalid email")) {
        return "Некорректный email.";
    }

    if (normalized.includes("invalid verification code")) {
        return "Неверный код подтверждения.";
    }

    if (normalized.includes("verification code expired")) {
        return "Код подтверждения истёк. Отправьте новый код.";
    }

    if (normalized.includes("verification code attempts exceeded")) {
        return "Превышено количество попыток. Отправьте новый код.";
    }

    if (normalized.includes("verification code not found")) {
        return "Код подтверждения не найден. Отправьте код повторно.";
    }

    if (normalized.includes("email already verified")) {
        return "Почта уже подтверждена. Выполните вход.";
    }

    if (normalized.includes("invalid reset code")) {
        return "Неверный код восстановления пароля.";
    }

    if (normalized.includes("reset code expired")) {
        return "Код восстановления истёк. Запросите новый код.";
    }

    if (normalized.includes("reset code already used")) {
        return "Код восстановления уже использован.";
    }

    if (normalized.includes("failed to send email")) {
        return "Не удалось отправить письмо. Попробуйте позже.";
    }

    if (normalized.includes("user is not active")) {
        return "Аккаунт не активен.";
    }

    return message || "Неизвестная ошибка авторизации.";
}

async function readApiError(response: Response): Promise<string> {
    try {
        const data = (await response.json()) as ApiErrorResponse;
        return translateApiError(data.error || `HTTP ${response.status}`);
    } catch {
        return `Ошибка сервера: HTTP ${response.status}`;
    }
}

async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
    let response: Response;

    try {
        response = await fetch(`${AUTH_API_BASE_URL}${path}`, options);
    } catch {
        throw new Error(
            "Не удалось подключиться к серверу авторизации. Проверь интернет или доступность SECTOR 27 API."
        );
    }

    if (!response.ok) {
        throw new Error(await readApiError(response));
    }

    return (await response.json()) as T;
}

export async function registerAccount(input: {
    email: string;
    nickname: string;
    password: string;
}): Promise<MessageResponse> {
    return requestJson<MessageResponse>("/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
}

export async function loginAccount(input: {
    login: string;
    password: string;
}): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            email: input.login,
            password: input.password,
        }),
    });
}

export async function verifyEmail(input: {
    email: string;
    code: string;
}): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/auth/verify-email", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
}

export async function resendVerificationCode(input: {
    email: string;
}): Promise<MessageResponse> {
    return requestJson<MessageResponse>("/auth/verify-email/resend", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
}

export async function requestPasswordReset(input: {
    email: string;
}): Promise<MessageResponse> {
    return requestJson<MessageResponse>("/auth/password-reset/request", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
}

export async function confirmPasswordReset(input: {
    email: string;
    code: string;
    new_password: string;
}): Promise<MessageResponse> {
    return requestJson<MessageResponse>("/auth/password-reset/confirm", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
}

export async function getCurrentUser(accessToken: string): Promise<AuthUser> {
    return requestJson<AuthUser>("/users/me", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
}