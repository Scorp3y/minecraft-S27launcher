import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";

type Profile = {
    id: string;
    name: string;
    description: string;
    minecraftVersion: string;
    loader: "forge" | "fabric" | "neoforge" | "vanilla";
    loaderVersion: string;
    serverIp: string;
    manifestUrl: string;
    bannerUrl?: string;
    status?: string;
};

type ProfilesConfig = {
    launcherName: string;
    version: string;
    profiles: Profile[];
};

type ManifestFile = {
    path: string;
    url: string;
    sha256: string;
    size: number;
};

type Manifest = {
    id: string;
    name: string;
    version: string;
    minecraftVersion: string;
    loader: "forge" | "fabric" | "neoforge" | "vanilla";
    loaderVersion: string;
    files: ManifestFile[];
    delete: string[];
    clean: string[];
};

const PROJECT_ROOT = process.cwd();
const INSTANCES_DIR = path.join(PROJECT_ROOT, "instances");

const profileId = process.argv[2];
const profilesUrl = process.argv[3] ?? "http://127.0.0.1:3000/public/profiles.json";

if (!profileId) {
    console.error("Ошибка: укажи id сборки.");
    console.error("Пример:");
    console.error("npm.cmd run update-profile mcdonaldsdnepr");
    process.exit(1);
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function sha256File(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return createHash("sha256").update(buffer).digest("hex");
}

async function downloadJson<T>(url: string): Promise<T> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Не удалось скачать JSON: ${url}. Статус: ${response.status}`);
    }

    return (await response.json()) as T;
}

async function downloadFile(url: string, targetPath: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Не удалось скачать файл: ${url}. Статус: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, buffer);
}

async function deleteFileFromInstance(instanceDir: string, relativePath: string): Promise<boolean> {
    const targetPath = path.join(instanceDir, relativePath);

    if (await fileExists(targetPath)) {
        await fs.unlink(targetPath);
        console.log(`Удалён: ${relativePath}`);
        return true;
    }

    return false;
}

async function getAllFiles(dir: string): Promise<string[]> {
    if (!(await fileExists(dir))) {
        return [];
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });

    const files = await Promise.all(
        entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                return getAllFiles(fullPath);
            }

            return [fullPath];
        })
    );

    return files.flat();
}

function toManifestStylePath(baseDir: string, fullPath: string): string {
    return path.relative(baseDir, fullPath).replace(/\\/g, "/");
}

async function cleanExtraFiles(instanceDir: string, manifest: Manifest): Promise<number> {
    const allowedFiles = new Set(manifest.files.map((file) => file.path));
    let removed = 0;

    for (const cleanDir of manifest.clean ?? []) {
        const targetCleanDir = path.join(instanceDir, cleanDir);
        const localFiles = await getAllFiles(targetCleanDir);

        for (const localFile of localFiles) {
            const relativePath = toManifestStylePath(instanceDir, localFile);

            if (!allowedFiles.has(relativePath)) {
                await fs.unlink(localFile);
                removed++;
                console.log(`Удалён лишний файл: ${relativePath}`);
            }
        }
    }

    return removed;
}

async function updateByManifest(manifestUrl: string): Promise<void> {
    console.log("Скачиваю manifest:");
    console.log(manifestUrl);
    console.log("");

    const manifest = await downloadJson<Manifest>(manifestUrl);
    const instanceDir = path.join(INSTANCES_DIR, manifest.id);

    await ensureDir(instanceDir);

    console.log(`Обновление сборки: ${manifest.name}`);
    console.log(`ID сборки: ${manifest.id}`);
    console.log(`Версия сборки: ${manifest.version}`);
    console.log(`Minecraft: ${manifest.minecraftVersion}`);
    console.log(`Loader: ${manifest.loader} ${manifest.loaderVersion}`);
    console.log(`Папка игрока: ${instanceDir}`);
    console.log("");

    let downloaded = 0;
    let skipped = 0;
    let deleted = 0;
    let failed = 0;

    for (const file of manifest.files) {
        const targetPath = path.join(instanceDir, file.path);

        let needsUpdate = false;

        if (!(await fileExists(targetPath))) {
            needsUpdate = true;
            console.log(`Нет файла: ${file.path}`);
        } else {
            const currentHash = await sha256File(targetPath);

            if (currentHash !== file.sha256) {
                needsUpdate = true;
                console.log(`Файл устарел или изменён: ${file.path}`);
            }
        }

        if (!needsUpdate) {
            skipped++;
            console.log(`ОК: ${file.path}`);
            continue;
        }

        try {
            console.log(`Скачиваю: ${file.url}`);
            await downloadFile(file.url, targetPath);

            const newHash = await sha256File(targetPath);

            if (newHash !== file.sha256) {
                await fs.unlink(targetPath);
                failed++;
                console.error(`Ошибка файла: ${file.path}`);
                console.error(`Хэш не совпал после скачивания.`);
                continue;
            }

            downloaded++;
            console.log(`Обновлён: ${file.path}`);
        } catch (error) {
            failed++;
            console.error(`Ошибка файла: ${file.path}`);
            console.error(error);
        }
    }

    for (const fileToDelete of manifest.delete) {
        const wasDeleted = await deleteFileFromInstance(instanceDir, fileToDelete);

        if (wasDeleted) {
            deleted++;
        }
    }

    const cleaned = await cleanExtraFiles(instanceDir, manifest);
    deleted += cleaned;

    console.log("");
    console.log("Готово.");
    console.log(`Скачано/обновлено: ${downloaded}`);
    console.log(`Уже актуальных: ${skipped}`);
    console.log(`Удалено: ${deleted}`);
    console.log(`Ошибок: ${failed}`);

    if (failed > 0) {
        process.exit(1);
    }
}

async function main() {
    console.log("Скачиваю profiles.json:");
    console.log(profilesUrl);
    console.log("");

    const config = await downloadJson<ProfilesConfig>(profilesUrl);
    const profile = config.profiles.find((item) => item.id === profileId);

    if (!profile) {
        console.error(`Ошибка: профиль не найден: ${profileId}`);
        console.error("Доступные профили:");

        for (const item of config.profiles) {
            console.error(`- ${item.id}: ${item.name}`);
        }

        process.exit(1);
    }

    console.log(`Лаунчер: ${config.launcherName}`);
    console.log(`Выбран профиль: ${profile.name}`);
    console.log(`Описание: ${profile.description}`);
    console.log(`Minecraft: ${profile.minecraftVersion}`);
    console.log(`Loader: ${profile.loader} ${profile.loaderVersion}`);
    console.log(`Server IP: ${profile.serverIp}`);
    console.log("");

    await updateByManifest(profile.manifestUrl);
}

main().catch((error) => {
    console.error("Критическая ошибка:", error);
    process.exit(1);
});