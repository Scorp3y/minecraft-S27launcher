import { Client, Authenticator } from "minecraft-launcher-core";
import * as path from "path";

const PROJECT_ROOT = process.cwd();

const profileId = process.argv[2] ?? "mcdonaldsdnepr";
const username = process.argv[3] ?? "Player";

const instanceDir = path.join(PROJECT_ROOT, "instances", profileId);
const gameDir = instanceDir;

async function main() {
    const launcher = new Client();

    const auth = await Authenticator.getAuth(username);

    const options = {
        authorization: auth,
        root: gameDir,
        version: {
            number: "1.19.2",
            type: "release",
            custom: "1.19.2-forge-43.5.0"
        },
        memory: {
            max: "4G",
            min: "2G"
        }
    };

    console.log("Запускаю Minecraft...");
    console.log(`Профиль: ${profileId}`);
    console.log(`Ник: ${username}`);
    console.log(`Папка игры: ${gameDir}`);

    launcher.launch(options);

    launcher.on("debug", (e) => console.log("[debug]", e));
    launcher.on("data", (e) => console.log("[minecraft]", e));
    launcher.on("error", (e) => console.error("[error]", e));
    launcher.on("close", () => console.log("Minecraft закрыт."));
}

main().catch((error) => {
    console.error("Ошибка запуска:", error);
    process.exit(1);
});