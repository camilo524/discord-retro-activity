import { DiscordSDK } from "@discord/embedded-app-sdk";

const DISCORD_CLIENT_ID = "1531718181213704212";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

// Variable global que usará el emulador
window.discordInstanceId = null;
window.discordUser = null;

async function setupDiscordSdk() {
  try {
    await discordSdk.ready();
    console.log("✅ Discord SDK listo");

    // Guardamos el instanceId (clave para el multijugador)
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

    // Intentar autenticar (si tienes backend de token)
    // Si aún no tienes /api/token, esto fallará silenciosamente y seguimos
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
      console.warn("No se pudo autenticar con token (normal si aún no tienes backend):", e.message);
    }

    // Notificar a la UI que el SDK está listo
    window.dispatchEvent(new CustomEvent("discord-ready"));

  } catch (error) {
    console.error("Error SDK:", error);
    // Aun así permitimos jugar en modo singleplayer
    window.dispatchEvent(new CustomEvent("discord-ready"));
  }
}

setupDiscordSdk();
