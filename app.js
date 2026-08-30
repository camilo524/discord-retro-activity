import { DiscordSDK } from "@discord/embedded-app-sdk";

// ← Pon aquí tu Application ID real (el mismo del bot)
const DISCORD_CLIENT_ID = "1531718181213704212";

const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

let auth = null;

async function setupDiscordSdk() {
  try {
    await discordSdk.ready();
    console.log("✅ Discord SDK listo. instanceId:", discordSdk.instanceId);

    // 1. Pedir autorización
    const { code } = await discordSdk.commands.authorize({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [
        "identify",
        "guilds",
        "guilds.members.read",
        "rpc.voice.read",
        // "rpc.activities.write", // descomenta si quieres Rich Presence
      ],
    });

    // 2. Intercambiar code por access_token
    //    (necesitas un endpoint en tu backend o en el mismo dominio)
    //    Ejemplo si tienes /api/token en retro.camiloh.co:
    const response = await fetch("/.proxy/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const { access_token } = await response.json();

    // 3. Autenticar el SDK
    auth = await discordSdk.commands.authenticate({ access_token });

    console.log("✅ Usuario autenticado:", auth.user.username);

    // Opcional: poner Rich Presence
    // await discordSdk.commands.setActivity({
    //   activity: {
    //     type: 0,
    //     details: "Jugando Retro",
    //     state: "Contra (NES)",
    //     timestamps: { start: Math.floor(Date.now() / 1000) },
    //   },
    // });

    // Aquí puedes escuchar participantes de la instancia
    // discordSdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", ...);

  } catch (error) {
    console.error("❌ Error SDK Discord:", error);
  }
}

setupDiscordSdk();
