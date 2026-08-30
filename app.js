import { DiscordSDK } from "@discord/embedded-app-sdk";

const DISCORD_CLIENT_ID = "1531718181213704212";
const discordSdk = new DiscordSDK(DISCORD_CLIENT_ID);

async function setup() {
  try {
    await discordSdk.ready();
    console.log("SDK listo. instanceId:", discordSdk.instanceId);
  } catch (err) {
    console.error("Error SDK:", err);
  }
}

setup();
