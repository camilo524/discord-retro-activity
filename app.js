import { DiscordSDK } from "@discord/embedded-app-sdk";

// Pega aquí tu Application ID (Client ID) real de Discord
const DISCORD_CLIENT_ID = "TU_CLIENT_ID_AQUI";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

async function initDiscord() {
    try {
        await discordSdk.ready();
        console.log("Discord SDK conectado con éxito.");

        // Opcional: Obtener información del usuario actual para saludarlo
        const { code } = await discordSdk.commands.authorize({
            client_id: DISCORD_CLIENT_ID,
            response_type: "code",
            scope: ["identify", "guilds"],
            prompt: "none",
        });

    } catch (error) {
        console.error("Error en la inicialización de Discord:", error);
    }
}

initDiscord();
