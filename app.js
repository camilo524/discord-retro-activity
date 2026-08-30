import { DiscordSDK } from "@discord/embedded-app-sdk";

const DISCORD_CLIENT_ID = "1531718181213704212";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

// Variables globales que usa el emulador
window.discordInstanceId = null;
window.discordUser = null;

async function setupDiscordSdk() {
  try {
    await discordSdk.ready();
    console.log("✅ Discord SDK listo");

    // Guardamos el instanceId (clave del multijugador)
    window.discordInstanceId = discordSdk.instanceId;
    console.log("Instance ID:", window.discordInstanceId);

    // Autorización básica
    const { code } = await discordSdk.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds", "guilds.members.read"],
    });

    // Intentar obtener el usuario (opcional, no bloquea si falla)
    try {
      const res = await fetch("/.proxy/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        const { access_token } = await res.json();
        const auth = await discordSdk.commands.authenticate({ access_token });
        window.discordUser = auth.user;
        console.log("Usuario:", auth.user.username);
      }
    } catch (e) {
      // Normal si todavía no tienes backend de token
      console.warn("Auth opcional no disponible:", e.message);
    }

    window.dispatchEvent(new CustomEvent("discord-ready"));
  } catch (error) {
    console.error("Error SDK:", error);
    // Aun así permitimos jugar
    window.dispatchEvent(new CustomEvent("discord-ready"));
  }
}

setupDiscordSdk();
