#!/usr/bin/env python3
import json
import re
import shlex
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
ENV_FILE = SCRIPTS_DIR / ".env"

PACKAGE_JSON = REPO_ROOT / "package.json"
PACKAGE_LOCK = REPO_ROOT / "package-lock.json"
TAURI_CONF = REPO_ROOT / "src-tauri" / "tauri.conf.json"
CARGO_TOML = REPO_ROOT / "src-tauri" / "Cargo.toml"
RELEASE_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "release.yml"

def get_current_version() -> str:
    data = json.loads(PACKAGE_JSON.read_text())
    version = data.get("version")
    if not isinstance(version, str) or not version.strip():
        raise SystemExit(f"Could not determine current version from {PACKAGE_JSON}")
    return version

def prompt(message: str) -> str:
    value = input(message).strip()
    if not value:
        raise SystemExit("Input cannot be empty.")
    return value

def update_json_version(path: Path, version: str) -> None:
    data = json.loads(path.read_text())
    data["version"] = version

    packages = data.get("packages")
    if isinstance(packages, dict) and "" in packages:
        root_package = packages[""]
        if isinstance(root_package, dict):
            root_package["version"] = version

    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Updated {path.relative_to(REPO_ROOT)} version to {version}")

def update_tauri_conf(path: Path, version: str) -> None:
    data = json.loads(path.read_text())
    data["version"] = version
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Updated {path.relative_to(REPO_ROOT)} version to {version}")

def update_cargo_version(path: Path, version: str) -> None:
    original = path.read_text().splitlines()
    version_pattern = re.compile(r'^version\s*=\s*"[^"]*"\s*$')
    replaced = False
    new_lines = []

    for line in original:
        if version_pattern.match(line):
            line = f'version = "{version}"'
            replaced = True
        new_lines.append(line)

    if not replaced:
        raise SystemExit(f"No version field found in {path}")

    path.write_text("\n".join(new_lines) + "\n")
    print(f"Updated {path.relative_to(REPO_ROOT)} version to {version}")

def load_env() -> dict:
    if not ENV_FILE.exists():
        return {}
    result = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip()
    return result

def save_env(data: dict) -> None:
    ENV_FILE.write_text(
        "\n".join(f"{k}={v}" for k, v in data.items()) + "\n"
    )

def parse_notes_file(path: Path) -> tuple[str, str]:
    content = path.read_text(encoding="utf-8").strip()
    lines = content.splitlines()
    first_line = lines[0] if lines else ""
    match = re.match(r"^#\s+v(\d+\.\d+\.\d+)", first_line)
    if not match:
        raise SystemExit(
            f"Could not parse version from {path}.\n"
            "The file must start with a heading like: # v1.2.3"
        )
    body = "\n".join(lines[1:]).strip()
    return match.group(1), body

def escape_for_yaml(value: str) -> str:
    return json.dumps(value)

def update_release_body(path: Path, body: str) -> None:
    escaped_body = escape_for_yaml(body)
    new_lines = []
    replaced = False

    with path.open() as f:
        for line in f:
            if line.lstrip().startswith("releaseBody:"):
                indent = " " * (len(line) - len(line.lstrip()))
                new_lines.append(f"{indent}releaseBody: {escaped_body}\n")
                replaced = True
            else:
                new_lines.append(line)

    if not replaced:
        raise SystemExit(f"Could not find releaseBody in {path}")

    path.write_text("".join(new_lines))
    print(f"Updated releaseBody in {path.relative_to(REPO_ROOT)}")


def main() -> None:
    print("Local version bump utility\n")

    env = load_env()
    notes_path_str = env.get("NOTES_PATH", "")

    if not notes_path_str:
        notes_path_str = prompt(
            "Enter the path to your release notes Markdown file\n"
            "(this will be saved to scripts/.env for future runs): "
        )
        env["NOTES_PATH"] = notes_path_str
        save_env(env)
        print(f"Saved notes path to {ENV_FILE.relative_to(REPO_ROOT)}")

    try:
        parts = shlex.split(notes_path_str)
        notes_path_str = parts[0] if parts else notes_path_str
    except ValueError:
        pass
    notes_path = Path(notes_path_str).expanduser()
    if not notes_path.exists():
        raise SystemExit(f"Release notes file not found: {notes_path}")

    version, release_body = parse_notes_file(notes_path)
    print(f"Read version {version} and release notes from {notes_path}")

    update_json_version(PACKAGE_JSON, version)
    update_json_version(PACKAGE_LOCK, version)
    update_tauri_conf(TAURI_CONF, version)
    update_cargo_version(CARGO_TOML, version)
    update_release_body(RELEASE_WORKFLOW, release_body)

    print("\nAll files updated. Don't forget to review and commit your changes if desired.")


if __name__ == "__main__":
    main()