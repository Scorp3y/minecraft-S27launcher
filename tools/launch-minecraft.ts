import { spawn, type ChildProcess } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

type Library = {
    name?: string;
    downloads?: {
        artifact?: {
            path?: string;
        };
    };
    artifact?: {
        path?: string;
    };
};

type VersionJson = {
    id?: string;
    mainClass?: string;
    libraries?: Library[];
};

const PROJECT_ROOT = process.cwd();

const profileId: string = process.argv[2] ?? "mcdonaldsdnepr";
const username: string = process.argv[3] ?? "Player";

const MC_VERSION = "1.19.2";
const FORGE_VERSION = "43.4.12";
const CUSTOM_VERSION = `${MC_VERSION}-forge-${FORGE_VERSION}`;

const instanceDir = path.join(PROJECT_ROOT, "instances", profileId);
const librariesDir = path.join(instanceDir, "libraries");
const assetsDir = path.join(instanceDir, "assets");

const vanillaVersionDir = path.join(instanceDir, "versions", MC_VERSION);
const forgeVersionDir = path.join(instanceDir, "versions", CUSTOM_VERSION);

const vanillaJsonPath = path.join(vanillaVersionDir, `${MC_VERSION}.json`);
const forgeJsonPath = path.join(forgeVersionDir, `${CUSTOM_VERSION}.json`);
const forgeJarPath = path.join(forgeVersionDir, `${CUSTOM_VERSION}.jar`);

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJson<T>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
}

function libraryNameToPath(name: string): string {
    const parts = name.split(":");

    if (parts.length < 3) {
        throw new Error(`Некорректное имя библиотеки: ${name}`);
    }

    const group = parts[0];
    const artifact = parts[1];
    const version = parts[2];

    if (!group || !artifact || !version) {
        throw new Error(`Некорректное имя библиотеки: ${name}`);
    }

    const groupPath = group.replace(/\./g, "/");
    const fileName = `${artifact}-${version}.jar`;

    return path.join(groupPath, artifact, version, fileName);
}

function getLibraryRelativePath(library: Library): string | null {
    if (library.downloads?.artifact?.path) {
        return library.downloads.artifact.path;
    }

    if (library.artifact?.path) {
        return library.artifact.path;
    }

    if (library.name) {
        return libraryNameToPath(library.name);
    }

    return null;
}

async function collectClasspath(): Promise<string> {
    const vanillaJson = await readJson<VersionJson>(vanillaJsonPath);
    const forgeJson = await readJson<VersionJson>(forgeJsonPath);

    const libraries: Library[] = [
        ...(vanillaJson.libraries ?? []),
        ...(forgeJson.libraries ?? []),
    ];

    const classpath = new Set<string>();

    for (const library of libraries) {
        const relativePath = getLibraryRelativePath(library);

        if (!relativePath) {
            continue;
        }

        const normalizedPath = relativePath.replace(/\\/g, "/");

        if (
            normalizedPath.includes("natives-windows-x86") ||
            normalizedPath.includes("natives-windows-arm64") ||
            normalizedPath.includes("natives-linux") ||
            normalizedPath.includes("natives-macos") ||
            normalizedPath.includes("natives-osx")
        ) {
            continue;
        }

        const fullPath = path.join(librariesDir, relativePath);

        if (await fileExists(fullPath)) {
            classpath.add(fullPath);
        }
    }

    if (!(await fileExists(forgeJarPath))) {
        throw new Error(`Не найден jar версии: ${forgeJarPath}`);
    }

    classpath.add(forgeJarPath);

    return [...classpath].join(";");
}

function forgeModulePath(): string {
    const modules: string[] = [
        "cpw/mods/bootstraplauncher/1.1.2/bootstraplauncher-1.1.2.jar",
        "cpw/mods/securejarhandler/2.1.4/securejarhandler-2.1.4.jar",
        "org/ow2/asm/asm-commons/9.7.1/asm-commons-9.7.1.jar",
        "org/ow2/asm/asm-util/9.7.1/asm-util-9.7.1.jar",
        "org/ow2/asm/asm-analysis/9.7.1/asm-analysis-9.7.1.jar",
        "org/ow2/asm/asm-tree/9.7.1/asm-tree-9.7.1.jar",
        "org/ow2/asm/asm/9.7.1/asm-9.7.1.jar",
        "net/minecraftforge/JarJarFileSystems/0.3.16/JarJarFileSystems-0.3.16.jar",
    ];

    return modules
        .map((relativePath) => path.join(librariesDir, relativePath))
        .join(";");
}

async function main(): Promise<void> {
    const forgeJson = await readJson<VersionJson>(forgeJsonPath);
    const mainClass: string =
        forgeJson.mainClass ?? "cpw.mods.bootstraplauncher.BootstrapLauncher";

    const classpath = await collectClasspath();
    const uuid = randomUUID().replace(/-/g, "");

    const ignoreList = [
        "bootstraplauncher",
        "securejarhandler",
        "asm-commons",
        "asm-util",
        "asm-analysis",
        "asm-tree",
        "asm",
        "JarJarFileSystems",
        "client-extra",
        "fmlcore",
        "javafmllanguage",
        "lowcodelanguage",
        "mclanguage",
        "forge-",
        `${CUSTOM_VERSION}.jar`,
    ].join(",");

    const args: string[] = [
        "-XX:-UseAdaptiveSizePolicy",
        "-XX:-OmitStackTraceInFastThrow",
        "-Dfml.ignorePatchDiscrepancies=true",
        "-Dfml.ignoreInvalidMinecraftCertificates=true",
        `-Djava.library.path=${instanceDir}`,
        "-Xmx4G",
        "-Xms2G",

        "-Djava.net.preferIPv6Addresses=system",
        `-DignoreList=${ignoreList}`,
        "-DmergeModules=jna-5.12.1.jar,jna-platform-5.12.1.jar",
        `-DlibraryDirectory=${librariesDir}`,

        "-p",
        forgeModulePath(),

        "--add-modules",
        "ALL-MODULE-PATH",

        "--add-opens",
        "java.base/java.util.jar=cpw.mods.securejarhandler",

        "--add-opens",
        "java.base/java.lang.invoke=cpw.mods.securejarhandler",

        "--add-exports",
        "java.base/sun.security.util=cpw.mods.securejarhandler",

        "--add-exports",
        "jdk.naming.dns/com.sun.jndi.dns=java.naming",

        "-cp",
        classpath,

        mainClass,

        "--launchTarget",
        "forgeclient",

        "--fml.forgeVersion",
        FORGE_VERSION,

        "--fml.mcVersion",
        MC_VERSION,

        "--fml.forgeGroup",
        "net.minecraftforge",

        "--fml.mcpVersion",
        "20220805.130853",

        "--username",
        username,

        "--version",
        CUSTOM_VERSION,

        "--gameDir",
        instanceDir,

        "--assetsDir",
        assetsDir,

        "--assetIndex",
        "legacy",

        "--uuid",
        uuid,

        "--accessToken",
        uuid,

        "--clientId",
        uuid,

        "--xuid",
        uuid,

        "--userType",
        "mojang",

        "--versionType",
        "release",
    ];

    console.log("Запускаю Minecraft напрямую через Java...");
    console.log(`Профиль: ${profileId}`);
    console.log(`Ник: ${username}`);
    console.log(`Папка игры: ${instanceDir}`);
    console.log(`Версия: ${CUSTOM_VERSION}`);
    console.log("");
    console.log("[java args]");
    console.log(args.join(" "));

    const child: ChildProcess = spawn("java", args, {
        cwd: instanceDir,
        stdio: "inherit",
    });

    child.on("close", (code: number | null) => {
        console.log("");
        console.log("Minecraft закрыт.");
        console.log("Код выхода:", code);
    });

    child.on("error", (error: Error) => {
        console.error("Ошибка запуска Java:", error);
    });
}

main().catch((error: unknown) => {
    console.error("Ошибка запуска:", error);
    process.exit(1);
});