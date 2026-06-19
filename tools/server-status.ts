import * as util from "minecraft-server-util";

type ServerState = "online" | "sleeping" | "offline";

type ServerStatus = {
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

const host = process.argv[2] ?? "yarik_anime_studio.exaroton.me";
const port = Number(process.argv[3] ?? "46919");

function stripMinecraftColors(value: string): string {
    return value.replace(/§[0-9A-FK-OR]/gi, "");
}

function offlineStatus(error: string): ServerStatus {
    return {
        state: "offline",
        online: false,
        sleeping: false,
        host,
        port,
        playersOnline: 0,
        maxPlayers: 0,
        pingMs: null,
        version: "Unknown",
        description: "",
        error,
    };
}

function getMotd(result: any): string {
    if (!result?.motd) {
        return "";
    }

    if (typeof result.motd.clean === "string") {
        return result.motd.clean;
    }

    if (Array.isArray(result.motd.clean)) {
        return result.motd.clean.join("\n");
    }

    if (typeof result.motd.raw === "string") {
        return result.motd.raw;
    }

    return "";
}

async function main() {
    try {
        const result = await util.status(host, port, {
            timeout: 5000,
            enableSRV: false,
        });

        const cleanVersion = stripMinecraftColors(result.version?.name ?? "Unknown");
        const cleanDescription = stripMinecraftColors(getMotd(result));

        const isSleeping =
            cleanVersion.toLowerCase().includes("sleeping") ||
            cleanDescription.toLowerCase().includes("sleeping");

        const status: ServerStatus = {
            state: isSleeping ? "sleeping" : "online",
            online: !isSleeping,
            sleeping: isSleeping,
            host,
            port,
            playersOnline: result.players?.online ?? 0,
            maxPlayers: result.players?.max ?? 0,
            pingMs: result.roundTripLatency ?? null,
            version: cleanVersion,
            description: cleanDescription,
        };

        console.log(JSON.stringify(status));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify(offlineStatus(message)));
    }
}

main();