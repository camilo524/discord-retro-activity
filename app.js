import { DiscordSDK } from "@discord/embedded-app-sdk";

// Reemplaza esto con el Client ID (Application ID) de tu app en el Developer Portal
const DISCORD_CLIENT_ID = "TU_CLIENT_ID_AQUI";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

async function setupDiscord() {
    try {
        await discordSdk.ready();
        console.log("¡Discord SDK inicializado correctamente!");
    } catch (error) {
        console.error("Error al inicializar el SDK de Discord:", error);
    }
}

setupDiscord();
