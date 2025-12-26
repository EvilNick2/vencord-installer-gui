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

export type ProvidedTheme = {
  id: string;
  name: string;
  url: string;
  description: string;
  defaultEnabled: string;
  enabled: boolean;
}

export type UserOptions = {
  vencordRepoUrl: string;
  vencordRepoDir: string;
  userRepositories: string[];
  userThemes: string[];
  providedRepositories: ProvidedRepository[];
  providedThemes: ProvidedTheme[];
  closeDiscordOnBackup: boolean;
  selectedDiscordClients: string[];
  maxBackupCount?: number | null;
  maxBackupSizeMb?: number | null;
};

export type BackupResult = {
  sourcePath: string;
  backupPath: string;
  closedClients: string[];
  restartedClients: string[];
  closingSkipped: boolean;
};

export type BackupInfo = {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt?: string;
}

export type DiscordProcess = {
  pid: string;
  name: string;
  exe?: string;
  cmd: string[];
};

export type FlowStepStatus = "running" | "completed" | "skipped" | "pending";

export type FlowStepResult<T = unknown> = {
  status: FlowStepStatus;
  message?: string;
  detail?: T;
};

export type PatchFlowStepEvent<T = unknown> = FlowStepResult<T> & {
  step: keyof PatchFlowResult;
}

export type DependencyStatus = {
  id: string;
  name: string;
  recommendedVersion: string;
  installedVersion?: string;
  status: 'installed' | 'missing' | 'outdated' | 'error';
  message?: string;
  canInstall: boolean;
  installLabel?: string;
};

export type PatchFlowResult = {
  closeDiscord: FlowStepResult<string[]>;
  backup: FlowStepResult<BackupResult>;
  syncRepo: FlowStepResult<string>;
  build: FlowStepResult<string>;
  inject: FlowStepResult<string>;
  downloadThemes: FlowStepResult<string>;
  reopenDiscord: FlowStepResult<string[]>;
};

export type DevTestStep = 
  | "closeDiscord"
  | "backup"
  | "syncRepo"
  | "build"
  | "inject"
  | "downloadThemes"
  | "reopenDiscord";

export type DevModuleResult =
  | { kind: "closeDiscord"; closedClients: string[]; closingSkipped: boolean }
  | { kind: "backup"; result: BackupResult }
  | { kind: "syncRepo"; path: string }
  | { kind: "build"; message?: string; path?: string }
  | { kind: "inject"; message?: string; path?: string }
  | { kind: "downloadThemes"; message?: string }
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

export async function listBackups(): Promise<BackupInfo[]> {
  return await invoke<BackupInfo[]>("list_backups");
}

export async function deleteBackups(names: string[]): Promise<void> {
  await invoke("delete_backups", { names });
}

export async function backupVencordInstall(sourcePath: string): Promise<BackupResult> {
  return await invoke<BackupResult>("backup_vencord_install", { sourcePath });
}

export async function runPatchFlow(): Promise<PatchFlowResult> {
  return await invoke<PatchFlowResult>("run_patch_flow");
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

export async function listDependencies(): Promise<DependencyStatus[]> {
  return await invoke<DependencyStatus[]>("list_dependencies");
}

export async function installDependency(id: string): Promise<DependencyStatus> {
  const result = await invoke<DependencyStatus>("install_dependency", { id });
  return result;
}