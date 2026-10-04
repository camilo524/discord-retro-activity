/**
 * Discord SDK para Camulador.
 * Import desde esm.sh (o copia local) — el bare "@discord/embedded-app-sdk"
 * solo funciona con Vite/Webpack, no en hosting estático.
 */
import { DiscordSDK } from "https://esm.sh/@discord/embedded-app-sdk@1.9.0";

const DISCORD_CLIENT_ID = "1531718181213704212";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

window.discordInstanceId = null;
window.discordUser = null;

async function setupDiscordSdk() {
  try {
    await discordSdk.ready();
    console.log("✅ Discord SDK listo");
    window.discordInstanceId = discordSdk.instanceId;
    console.log("Instance ID:", window.discordInstanceId);

    const { code } = await discordSdk.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds", "guilds.members.read"],
    });

    try {
      // Token endpoint vive en el BOT (mapeo raíz), no en retro.camiloh.co
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
      console.warn("Auth opcional no disponible:", e.message);
    }

    window.dispatchEvent(new CustomEvent("discord-ready"));
  } catch (error) {
    console.error("Error SDK:", error);
    window.dispatchEvent(new CustomEvent("discord-ready"));
  }
}

setupDiscordSdk();