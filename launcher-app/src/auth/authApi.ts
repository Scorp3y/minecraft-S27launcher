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
        return "Неверный email или пароль.";
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

async function requestJson<T>(
    path: string,
    options: RequestInit
): Promise<T> {
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
}): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    });
}

export async function loginAccount(input: {
    email: string;
    password: string;
}): Promise<AuthResponse> {
    return requestJson<AuthResponse>("/auth/login", {
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