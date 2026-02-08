<!-- markdownlint-disable MD033 -->
<h1 align="center">Vencord Installer Gui</h1>

<p align="center">
  <img alt="Github top language" src="https://img.shields.io/github/languages/top/EvilNick2/vencord-installer-gui?color=56BEB8">
  <img alt="Github language count" src="https://img.shields.io/github/languages/count/EvilNick2/vencord-installer-gui?color=56BEB8">
  <img alt="Repository size" src="https://img.shields.io/github/repo-size/EvilNick2/vencord-installer-gui?color=56BEB8">
  <img alt="License" src="https://img.shields.io/github/license/EvilNick2/vencord-installer-gui?color=56BEB8">
</p>

<p align="center">
  <a href="#rocket-usage">Usage</a> &#xa0; | &#xa0;
  <a href="#dart-about">About</a> &#xa0; | &#xa0;
  <a href="#sparkles-features">Features</a> &#xa0; | &#xa0;
  <a href="#computer-development">Development</a> &#xa0; | &#xa0;
  <a href="#rocket-technologies">Technologies</a> &#xa0; | &#xa0;
  <a href="#memo-license">License</a> &#xa0; | &#xa0;
  <a href="https://github.com/EvilNick2" target="_blank">Author</a>
</p>

<br>
<!-- markdownlint-enable MD033 -->

## :rocket: Usage ##

This section is for **end users** who just want ot install or update Vencord using the GUI.
You **do not** need Node.js, Rust, or any developer tools to run the application.

---

### 1. Download the Application ###

- Go to the **[Releases](https://github.com/EvilNick2/vencord-installer-gui/releases)** page
- Download the installer for your operating system:
  - **Windows**: `.msi`
  - **Linux**: `.AppImage`, `.deb`, or `.rpm`
  - **macOS**: `.dmg`

> :warning: **Windows Antivirus Notice**  
> Because this is a custom-built Tauri application, some antivirus software may incorrectly flag the binary.  
> If this occurs, add an exception.

## :dart: About ##

A cross-platform GUI for installing and managing Vencord. It detects Discord installations, applies patches, updates existing Vencord setups, and provides optional backup and restore flows, whilst allowing the use of custom user plugins. The tool wraps the normal Vencord installation process in an accessible graphical interface built with Tauri.

## :sparkles: Features ##

:heavy_check_mark: Detect Discord Stable, PTB, and Canary\
:heavy_check_mark: Install or update Vencord\
:heavy_check_mark: Optional backup of existing Vencord installs\
:heavy_check_mark: Separate flows for install, uninstall, backup, and repo sync\
:heavy_check_mark: Support for custom vencord user plugins\
:heavy_check_mark: Cross-platform via Tauri

---

## :computer: Development ##

The sections below are **only** required if you are developing or modifying the application.
If you just want to use the app, you can ignore everything past this point.

### :white_check_mark: Requirements ###

Before starting, you need:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en)
- [Rust Language Toolchain](https://www.rust-lang.org/tools/install)
- Tauri Prerequisites (See the [Tauri Guide](https://tauri.app/start/prerequisites/))

### :checkered_flag: Starting ###

**Setup:**

1. **Clone the repository:**

    ```bash
    git clone https://github.com/EvilNick2/vencord-installer-gui
    cd vencord-installer-gui
    ```

2. **Install frontend dependencies:**

    ```bash
    npm install
    ```

3. **Run in development mode:**

    ```bash
    npm run start
    ```

    This will start the Vite frontend dev server and the Tauri backend.

**Build:**

```bash
npm run build
```

## :rocket: Technologies ##

The following tools were used in this project:

- [Tauri](https://v2.tauri.app/)
- [Rust](https://rust-lang.org/)
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/en)
- [Vite](https://vite.dev/)

## :memo: License ##

This project is under the MIT license. See the LICENSE file.

Made by [EvilNick2](https://github.com/EvilNick2)

[Back to top](#top)
