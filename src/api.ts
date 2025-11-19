import { invoke } from "@tauri-apps/api/core";

export type DiscordInstall = {
  id: string;
  name: string;
  path: string;
};

export async function getDiscordInstalls(): Promise<DiscordInstall[]> {
  return await invoke<DiscordInstall[]>("get_discord_installs")
}