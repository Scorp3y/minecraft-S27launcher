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
    clean: string[];
};

const PROJECT_ROOT = process.cwd();
const PACKS_DIR = path.join(PROJECT_ROOT, "packs");

const packId = process.argv[2];

if (!packId) {
    console.error("Ошибка: укажи id сборки, например: npm.cmd run build-manifest s27");
    process.exit(1);
}

const packDir = path.join(PACKS_DIR, packId);
const ignoredFiles = new Set(["manifest.json"]);

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function getAllFiles(dir: string): Promise<string[]> {
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

async function sha256File(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return createHash("sha256").update(buffer).digest("hex");
}

function toManifestPath(fullPath: string): string {
    return path.relative(packDir, fullPath).replace(/\\/g, "/");
}

async function main() {
    if (!(await fileExists(packDir))) {
        console.error(`Ошибка: сборка не найдена: ${packDir}`);
        process.exit(1);
    }

    const allFiles = await getAllFiles(packDir);
    const files: ManifestFile[] = [];

    for (const fullPath of allFiles) {
        const relativePath = toManifestPath(fullPath);

        if (ignoredFiles.has(relativePath)) {
            continue;
        }

        const stat = await fs.stat(fullPath);
        const sha256 = await sha256File(fullPath);

        files.push({
            path: relativePath,
            url: `http://localhost:3000/packs/${packId}/${relativePath}`,
            sha256,
            size: stat.size,
        });
    }

    files.sort((a, b) => a.path.localeCompare(b.path));

    const manifest: Manifest = {
        id: packId,
        name: "SECTOR 27",
        version: "1.0.0",
        minecraftVersion: "1.19.2",
        loader: "forge",
        loaderVersion: "43.5.0",
        files,
        delete: [],
        clean: ["mods"],
    };

    const manifestPath = path.join(packDir, "manifest.json");

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    console.log("Готово: manifest.json создан");
    console.log(`Сборка: ${packId}`);
    console.log(`Файлов: ${files.length}`);
}

main().catch((error) => {
    console.error("Неожиданная ошибка:", error);
    process.exit(1);
});