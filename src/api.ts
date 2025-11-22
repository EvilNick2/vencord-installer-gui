import { invoke } from "@tauri-apps/api/core";

export type DiscordInstall = {
  id: string;
  name: string;
  path: string;
};

export type ProvidedRepository = {
  id: string;
  name: string;
  url: string;
  description: string;
  defaultEnabled: string;
  enabled: boolean;
};

export type UserOptions = {
  vencordRepoUrl: string;
  userRepositories: string[];
  providedRepositories: ProvidedRepository[];
};

export async function getDiscordInstalls(): Promise<DiscordInstall[]> {
  return await invoke<DiscordInstall[]>("get_discord_installs")
}

export async function getUserOptions(): Promise<UserOptions> {
  return await invoke<UserOptions>("get_user_options");
}

export async function updateUserOptions(options: UserOptions): Promise<UserOptions> {
  return await invoke<UserOptions>("update_user_options", { options });
}