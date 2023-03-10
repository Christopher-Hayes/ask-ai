# Ask AI

Get AI-powered explanations instantly in GNOME.

AskAI uses OpenAI's GPT-3 API to generate responses. Specifically, this extension uses GPT-3 Davinci v3, OpenAI's most powerful model (and the same one behind "ChatGPT"). This GNOME extension is set up with a `CTRL + SHIFT + Y` shortcut to open the AskAI window.

**Current Project State:** Functioning Prototype - Requires building the extension from source. All "modes" work. "edit" and "write" need additional GUI options to be more useful.

![Shows a question that was asked](./media/screenshot-1.png)

![Shows the response from GPT-3](./media/screenshot-2.png)

![Show GPT-3 summarizing a passage](./media/screenshot-3.png)

## Prerequisite: OpenAI API Key

AskAI needs an OpenAI API key to work. Anyone can create an OpenAI account and get an API key: [https://openai.com](https://openai.com/).

While new accounts get $20 in credits, OpenAI will eventually start charging for usage. For personal usage GPT-3 should be cheap, usually fractions of a penny per a prompt. More information about pricing here: [https://openai.com/api/pricing/](https://openai.com/api/pricing/).

Tokens/Usage Pricing - Note that asking a question will only use a couple hundred tokens, costing fractions of a penny. But, using "Summarize" or "Edit" on large passages can use thousands of tokens, costing 1-10 cents.

![Shows the extension preferences, with the api key input field](./media/screenshot-pref.png)

## Installation

After completing one of the installation methods below, restart GNOME Shell (*X11: `Alt`+`F2`, `r`, `Enter` - Wayland: `log out` or `reboot`*) and enable the extension through the *gnome-extensions* app.

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

## Usage

1. Once `make install` runs successfully, GNOME Shell needs to be restarted. (*X11: `Alt`+`F2`, `r`, `Enter` - Wayland: `log out` or `reboot`*)
2. Enable the extension through the *gnome-extensions* app.
3. Open the extension preferences via the same *gnome-extensions* app and enter your OpenAI API key.
4. The icon in the top bar can either be clicked or the `CTRL + SHIFT + Y` shortcut can be used to open the AskAI window.
5. After typing a prompt, either "Ask" can be pressed or just hitting `Enter` will send the prompt to GPT-3.

## TODO

- [x] Allow the response to be copied to the clipboard.
- [ ] Estimate how many tokens a prompt will use and warn before using a large number of tokens.
- [ ] Allow web search engine to be changed in preferences.
- [ ] Add button to open settings from this extension.
- [x] Support different "modes" for different types of usage. (ie summaries, text editing, etc)
- [ ] Add a "history" of prompts/responses.
- [ ] Switch to Typescript with intermediate build step.
- [ ] Internationalization. (Translations, currencies, RTL)

## Development

Here's the general dev flow:

1. Leave `journalctl -f -o cat /usr/bin/gnome-shell` running in a terminal to see any errors/logs. This command does not need to be restarted when the extension is reloaded.
2. Make changes to the code.
3. Run `make install` - It builds the extension and puts it in `~/.local/share/gnome-shell/extensions` (So do not clone this repo into that directory!).
4. Restart GNOME Shell (*X11: `Alt`+`F2`, `r`, `Enter` - Wayland: `log out` or `reboot`*). Unfortunately, Wayland doesn't seem to have a better way than to log out. (But, locking/unlocking might work - I haven't tested).
5. The extension should now be running if you've previously enabled it. If not, enable it through the *gnome-extensions* app. If you're testing the preferences UI, *gnome-extensions* will need to be re-opened.

## Docs for Development

- [Quick overview of GNOME Shell Extension development](https://gjs.guide/extensions/development/creating.html)
- [Official GNOME Shell Extension API docs](https://gjs-docs.gnome.org/) (Individual libraries from these docs are linked in the "Libraries" section)

### The Linux GUI in a nutshell

**To state how everything fits together** because I had a lot trouble trying to userstand how Linux GUIs work:

- Your Linux system has a [**display server**](https://www.wikiwand.com/en/Display_server), it manages GUI - windows, menus, pointer, etc. It's called a "server" because decades ago *running* an application on one computer and *showing* the GUI on another computer was a common use-case.
- The display server uses a **protocol** to communicate with its clients (ie desktop applications).
  - Your system probably uses either the [**X11**](https://www.wikiwand.com/en/X_Window_System) or [**Wayland**](https://www.wikiwand.com/en/Wayland_compositor) protocol. X11 has been around ~30 years (older than Linux itself!), Wayland is younger at ~15 years.
  - On Ubuntu, opening the "About" app will tell you which you have under "Windowing System". This can be a little confusing because "System" makes it sound like X11 or Wayland runs code. But X11 and Wayland only refer to the "protocol".
- A protocol is just that, a protocol, to actually run the display server, you need an implementation of the protocol. A display server implementation is also called a [**Window Manager**](https://www.wikiwand.com/en/Window_manager).
  - Wayland has a name for a display server that implements the Wayland protocol, a **Wayland Compositor**.
    - One such example of a Wayland Compositor is [**Mutter**](https://gitlab.gnome.org/GNOME/mutter).
  - X11 works slightly different in that the "compositor" is a second, separate program called the "compositing window manager" used *in addition* to the display server implementation.
    - An example of a display server implementation of the X11 protocol is "X.Org Server".
    - As mentioned, this implementation needs a second program to do the compositing.
      - One example is **Mutter**, which acts as an X11 window manager and compositor.
    - A word on naming - X/X11/Xorg can be used interchangeably, but it might be useful to know the nuances - the protocol is called the "X Window System" or "X" for short. X11 is the "current" release of this protocol, released in 1987. X.Org/Xorg is used to refer to the project and team as a whole.
- There's other window managers, but Mutter is specifically mentioned because [**GNOME Shell**](https://www.wikiwand.com/en/GNOME_Shell) runs on Mutter. And since Mutter works with both X11 and Wayland, GNOME Shell also works on both.
  - Specifically, GNOME Shell is implemented as a plugin in Mutter.
- GNOME Shell is the "shell" of the **GNOME desktop environment**. It was introduced to improve the stock GNOME environment. GNOME Shell being a Mutter plugin does however mean that the GNOME user experience is tighly coupled with Mutter, you can't swap out Mutter for another window manager without breaking GNOME.
- And finally, this project! ..is an extension for the GNOME Shell.... which is a plugin for Mutter.. which is a window manager for X11 and Wayland.. which are display server protocols.

### GNOME Shell UI Tech

- GNOME Shell uses **Clutter** and **St** to build out the UI, this due to GNOME Shell being built on Mutter.
- Something to note about Clutter is that [it is no longer part of the GNOME SDK](https://blogs.gnome.org/clutter/2022/02/16/retiring-clutter/). So for applications in the GNOME desktop environment, GTK should be used instead.
- However, GNOME Shell can ONLY use Clutter and St. Gtk is only mentioned below because a couple utility functions are used. Gtk UIs cannot be built for GNOME Shell extensions.
- This begs the question if Mutter is the reason GNOME Shell cannot use Gtk, how are GNOME desktop applications able to use Gtk? And the confusing answer is the GNOME desktop environment does not soley rely on Mutter. GNOME Shell uses Mutter; however, the rest of GNOME uses gdm3 (GNOME Display Manager 3), and gdm3 supports Gtk. Additionally, Gtk expects to be used with a display server, meanwhile Mutter is just used as a compositor in GNOME Shell. So, even though Clutter and Gtk can *technically* be used together, in GNOME Shell it's not possible.
- Having gnome shell launch a separate Gtk application seems to be an option though. So, might be worth looking into. In the meantime, this project sticks to Clutter and St.

### Libraries

- `Clutter`: 2D graphics library that is used by GNOME Shell to draw the UI. [Official Clutter Docs](https://gnome.pages.gitlab.gnome.org/mutter/clutter/)
  - Note that while GNOME Shell extension development can keep using Clutter without issue, .
- `St`: Creating graphical user interfaces. [Official St docs](https://gjs-docs.gnome.org/st10/)
- `Gio`: Input/output and networking. It is used by GNOME Shell to read and write files, and to communicate with the network. [Offical Gio docs](https://gjs-docs.gnome.org/gio20~2.0/)
- `GLib`: Common tasks such as data structures, file manipulation, and string manipulation. [Official GLib docs](https://gjs-docs.gnome.org/glib20~2.0/)
- `GObject`: Object-oriented programming. [Official GObject docs](https://gjs-docs.gnome.org/gobject20~2.0/)
- `Meta`: Window manager. [Official Meta docs](https://gjs-docs.gnome.org/meta11~11/)
- `Pango`: Text layout and rendering. [Official Pango docs](https://gjs-docs.gnome.org/pango10~1.0/)
- `Shell`: GNOME Shell. [Official Shell docs](https://gjs-docs.gnome.org/shell01~0.1/)
- `libsoup3`: HTTP requests. [Official libsoup3 docs](https://gjs-docs.gnome.org/libsoup3~3.0/)
- `Gtk`: Note - GNOME Shell only uses Gtk utility functions. The UI cannot be built with Gtk. [Official Gtk docs](https://gjs-docs.gnome.org/gtk30~3.0/)

## Credits

The maintainers of the GNOME extension, [OpenWeather](https://gitlab.com/skrewball/openweather). I came into this project as a web dev knowing nothing about GNOME development, and their extension was a great starting point to learn from.

Robot icon by [Mariella Steeb](https://openmoji.org/library/#author=Mariella%20Steeb) via OpenEmoji.
