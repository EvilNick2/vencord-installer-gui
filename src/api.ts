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
  vencordRepoDir: string;
  userRepositories: string[];
  providedRepositories: ProvidedRepository[];
  closeDiscordOnBackup: boolean;
  selectedDiscordClients: string[];
};

export type BackupResult = {
  sourcePath: string;
  backupPath: string;
  closedClients: string[];
  restartedClients: string[];
  closingSkipped: boolean;
};

export type DiscordProcess = {
  pid: string;
  name: string;
  exe?: string;
  cmd: string[];
};

export type FlowStepStatus = "completed" | "skipped" | "pending";

export type FlowStepResult<T> = {
  status: FlowStepStatus;
  message?: string;
  detail?: T;
};

export type PatchFlowResult = {
  closeDiscord: FlowStepResult<string[]>;
  backup: FlowStepResult<BackupResult>;
  syncRepo: FlowStepResult<string>;
  build: FlowStepResult<string>;
  inject: FlowStepResult<string>;
  reopenDiscord: FlowStepResult<string[]>;
};

export type DevTestStep = 
  | "closeDiscord"
  | "backup"
  | "syncRepo"
  | "build"
  | "inject"
  | "reopenDiscord";

export type DevModuleResult =
  | { kind: "closeDiscord"; closedClients: string[]; closingSkipped: boolean }
  | { kind: "backup"; result: BackupResult }
  | { kind: "syncRepo"; path: string }
  | { kind: "build"; message?: string; path?: string }
  | { kind: "inject"; message?: string; path?: string }
  | { kind: "reopenDiscord"; restarted: string[]; closedClients: string[]; closingSkipped: boolean; };

export async function getDiscordInstalls(): Promise<DiscordInstall[]> {
  return await invoke<DiscordInstall[]>("get_discord_installs")
}

export async function getUserOptions(): Promise<UserOptions> {
  return await invoke<UserOptions>("get_user_options");
}

export async function updateUserOptions(options: UserOptions): Promise<UserOptions> {
  return await invoke<UserOptions>("update_user_options", { options });
}

export async function backupVencordInstall(sourcePath: string): Promise<BackupResult> {
  return await invoke<BackupResult>("backup_vencord_install", { sourcePath });
}

export async function runPatchFlow(sourcePath: string): Promise<PatchFlowResult> {
  return await invoke<PatchFlowResult>("run_patch_flow", { sourcePath });
}

export async function runDevTest(
  step: DevTestStep,
  sourcePath?: string
): Promise<DevModuleResult> {
  return await invoke<DevModuleResult>("run_dev_test", { step, sourcePath });
}

export async function listDiscordProcesses(): Promise<DiscordProcess[]> {
  return await invoke<DiscordProcess[]>("list_discord_processes");
}

export async function updateSelectedDiscordClients(
  selected: string[],
): Promise<void> {
  await invoke("update_selected_discord_clients", { selected });
}