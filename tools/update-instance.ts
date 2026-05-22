import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";

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
};

const PROJECT_ROOT = process.cwd();
const PACKS_DIR = path.join(PROJECT_ROOT, "packs");
const INSTANCES_DIR = path.join(PROJECT_ROOT, "instances");

const packId = process.argv[2];

if (!packId) {
    console.error("Ошибка: укажи id сборки, например: npm.cmd run update-instance mcdonaldsdnepr");
    process.exit(1);
}

const packDir = path.join(PACKS_DIR, packId);
const instanceDir = path.join(INSTANCES_DIR, packId);
const manifestPath = path.join(packDir, "manifest.json");

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function sha256File(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return createHash("sha256").update(buffer).digest("hex");
}

async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function copyFileFromPack(relativePath: string): Promise<void> {
    const sourcePath = path.join(packDir, relativePath);
    const targetPath = path.join(instanceDir, relativePath);

    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
}

async function deleteFileFromInstance(relativePath: string): Promise<void> {
    const targetPath = path.join(instanceDir, relativePath);

    if (await fileExists(targetPath)) {
        await fs.unlink(targetPath);
        console.log(`Удалён: ${relativePath}`);
    }
}

async function main() {
    if (!(await fileExists(manifestPath))) {
        console.error(`Ошибка: manifest.json не найден: ${manifestPath}`);
        console.error("Сначала запусти: npm.cmd run build-manifest " + packId);
        process.exit(1);
    }

    const manifestRaw = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw) as Manifest;

    await ensureDir(instanceDir);

    console.log(`Обновление сборки: ${manifest.name}`);
    console.log(`Версия сборки: ${manifest.version}`);
    console.log(`Папка игрока: ${instanceDir}`);
    console.log("");

    let downloaded = 0;
    let skipped = 0;
    let deleted = 0;

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
                console.log(`Файл изменился: ${file.path}`);
            }
        }

        if (needsUpdate) {
            await copyFileFromPack(file.path);
            downloaded++;
            console.log(`Обновлён: ${file.path}`);
        } else {
            skipped++;
            console.log(`ОК: ${file.path}`);
        }
    }

    for (const fileToDelete of manifest.delete) {
        await deleteFileFromInstance(fileToDelete);
        deleted++;
    }

    console.log("");
    console.log("Готово.");
    console.log(`Обновлено файлов: ${downloaded}`);
    console.log(`Уже актуальных: ${skipped}`);
    console.log(`Удалено файлов: ${deleted}`);
}

main().catch((error) => {
    console.error("Неожиданная ошибка:", error);
    process.exit(1);
});