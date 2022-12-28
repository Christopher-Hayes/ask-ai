# Ask AI

Ask AI is a GNOME Shell extension that allows you to easily ask GPT-3 questions.

## Installation

After completing one of the installation methods below, restart GNOME Shell (*Xorg: `Alt`+`F2`, `r`, `Enter` - Wayland: `log out` or `reboot`*) and enable the extension through the *gnome-extensions* app.

## Install From Source

This method installs to your `~/.local/share/gnome-shell/extensions` directory from the latest source code on the `main` branch.

First make sure you have the following dependencies installed:

| Arch Based     | Debian Based                  | Fedora                 |
| ---            | ---                           | ---                    |
| `dconf`        | `dconf-gsettings-backend`     | `dconf`                |
| `gnome-shell`  | `gnome-shell-extension-prefs` | `gnome-extensions-app` |
| `git`          | `git`                         | `git`                  |
| `base-devel`   | `build-essential`             | `glib2-devel`          |
|                | `gettext`                     | `gettext-devel`        |
|                | `libsoup3`                    |                        |

Then run the following commands:

```bash
make && make install
```
