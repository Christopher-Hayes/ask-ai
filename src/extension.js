const {
  Clutter, // Docs - https://gjs-docs.gnome.org/clutter10
  St, // Docs - https://gjs-docs.gnome.org/st10
  Gio, // Docs - https://gjs-docs.gnome.org/gio20
  Gtk, // Docs - https://gjs-docs.gnome.org/gtk40
  GLib, // Docs - https://gjs-docs.gnome.org/glib20
  GObject, // Docs - https://gjs-docs.gnome.org/gobject20
  Meta, // Docs - https://gjs-docs.gnome.org/meta10
  Pango, // Docs - https://gjs-docs.gnome.org/pango10
  Shell, // Docs - https://gjs-docs.gnome.org/shell01
  // Docs tip: You can search across multiple libraries if you go to https://gjs-docs.gnome.org,
  // and click "Enable" on each library you want to search across.
} = imports.gi;

// GNOME Shell extension utilities
const Main = imports.ui.main; // src - https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/main.js
const PanelMenu = imports.ui.panelMenu; // src - https://gitlab.gnome.org/GNOME/gnome-shell/blob/main/js/ui/panelMenu.js
const PopupMenu = imports.ui.popupMenu; // src - https://gitlab.gnome.org/GNOME/gnome-shell/blob/main/js/ui/popupMenu.js
const GnomeSession = imports.misc.gnomeSession; // src - https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/misc/gnomeSession.js
const ExtensionUtils = imports.misc.extensionUtils; // src - https://gitlab.gnome.org/GNOME/gnome-shell/blob/main/js/misc/extensionUtils.js
const Util = imports.misc.util; // src - https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/misc/util.js
const Me = ExtensionUtils.getCurrentExtension();

// Translations (not really used right now)
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const _ = Gettext.gettext;

// Local scripts
const AskAI = Me.imports.askai;
const Helpers = Me.imports.helpers;

let _firstBoot = 1;

const WIDGET_POSITION = {
  CENTER: 0,
  RIGHT: 1,
  LEFT: 2,
};

// Yaru theme colors
// const YaruColors = {
//   bark: {
//     primary: "#5b5b43",
//     'primary-light': "#787859",
//   },
//   'bark-dark': {
//     primary: "#aaaa8d",
//     'primary-light': "#c0c0aa",
//   },




//hack (for Wayland?) via https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/1997
Gtk.IconTheme.get_default = function () {
  let theme = new Gtk.IconTheme();
  theme.set_custom_theme(St.Settings.get().gtk_icon_theme);
  return theme;
};

let AskAIMenuButton = GObject.registerClass(
  class AskAIMenuButton extends PanelMenu.Button {
    _init() {
      super._init(0, "AskAIMenuButton", false);

      //* State
      // Is GNOME dark mode enabled?
      const interfaceSettings = ExtensionUtils.getSettings(
            'org.gnome.desktop.interface'
          )
      let theme = interfaceSettings.get_string('color-scheme');
      this._darkTheme = theme === 'prefer-dark' || theme === 'true';
      // when the interface color scheme changes, update the theme
      interfaceSettings.connect('changed::color-scheme', () => {
        theme = interfaceSettings.get_string('color-scheme');
        this._darkTheme = theme === 'prefer-dark' || theme === 'true';
        this._askAI.set_style_class_name(`main ${this._darkTheme ? 'dark' : 'light'}`);
      });
      // Get primary color from GNOME theme
      const themeName = interfaceSettings.get_string('gtk-theme');
      // If Yaru theme, parse the colors the theme name
      if (themeName.startsWith('Yaru')) {
        const colors = themeName.split('-');
        this._primaryColor = `${colors[1]}`;
      } else {
        // Otherwise, use the default color
        this._primaryColor = '#4c7899';
      }

      // Keep track of pending requests
      this._waitingForResponse = false;
      // UI mode - Ask, Summarize, Edit, Write
      this._mode = AskAI.MODES.ASK;
      // Keep track of prompt and response for each mode
      // Allows user to switch modes without losing their input/output
      this._prompt = {
        [AskAI.MODES.ASK]: "",
        [AskAI.MODES.SUMMARIZE]: "",
        [AskAI.MODES.EDIT]: "",
        [AskAI.MODES.WRITE]: "",
      };
      this._response = {
        [AskAI.MODES.ASK]: "",
        [AskAI.MODES.SUMMARIZE]: "",
        [AskAI.MODES.EDIT]: "",
        [AskAI.MODES.WRITE]: "",
      };

      // Topbar icon
      this.setupTopBarIcon();

      // Load settings
      this.loadConfig();
      this.loadConfigInterface();

      // Set keybinding
      this._keybinding = Main.wm.addKeybinding(
        "ask-ai-shortcut",
        this._settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
          if (this.menu.isOpen) {
            // v Can't get this to work v
            this.menu.close();
          } else {
            this.menu.open();
            if (this._askAIInput) {
              // Focus the input field
              this._askAIInput.grab_key_focus();
              // Select all text
              this._askAIInputText.set_selection(0, -1);
            }
          }
        }
      );

      // Bind signals
      // this.menu.connect("open-state-changed", this.recalcLayout.bind(this));

      // Main UI that shows when topbar icon is clicked
      this.checkPositionInPanel();
      this._askAI = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        style_class: `main ${this._darkTheme ? 'dark' : 'light'}`,
      });

      let _firstBootWait = this._startupDelay;
      if (_firstBoot && _firstBootWait != 0) {
        // Delay popup initialization and data fetch on the first
        // extension load, ie: first log in / restart gnome shell
        this._timeoutFirstBoot = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT,
          _firstBootWait,
          () => {
            this.buildUI();
            _firstBoot = 0;
            this._timeoutFirstBoot = null;
            return false; // run timer once then destroy
          }
        );
      } else {
        this.buildUI();
      }

      this.menu.addMenuItem(this._askAI);
      this.checkAlignment();

      // Init todays usage using OpenAI data
      const key = this._settings.get_string("openai-key");
      if (key) {
        AskAI.getTodaysUsage(key).then((usage) => {
          this._todaysTokenUsage = usage;
          if (this._askAIInfo) {
            // Calculated at $0.02 per 1000 tokens for the Davinci model - https://openai.com/api/pricing/
            const approximateTotalCost = this._todaysTokenUsage * 0.00002;
            this._askAIInfo.text = `AskAI v${
              Me.metadata.version
            } - Today's usage: ${
              this._todaysTokenUsage
            } (~$${approximateTotalCost.toFixed(4)})`;
          }
        });
      }
    }

    // The AskAI icon button in the top bar
    setupTopBarIcon() {
      this._askAIIcon = new St.Icon({
        icon_name: "view-refresh-symbolic",
        style_class: "system-status-icon icon",
      });

      this._askAIIcon.set_gicon(
        Gio.icon_new_for_string(Me.path + "/media/ask-ai-icon.svg")
      );

      const topBox = new St.BoxLayout({
        style_class: "panel-status-menu-box",
      });

      topBox.add_child(this._askAIIcon);
      this.add_child(topBox);

      if (Main.panel._menus === undefined) {
        Main.panel.menuManager.addMenu(this.menu);
      } else {
        Main.panel._menus.addMenu(this.menu);
      }
    }

    // Load settings
    loadConfig() {
      this._settings = ExtensionUtils.getSettings(
        Me.metadata["settings-schema"]
      );

      // Bind to settings changed signal
      this._settingsC = this._settings.connect("changed", () => {
        if (this.menuAlignmentChanged()) {
          if (this._timeoutMenuAlignent)
            GLib.source_remove(this._timeoutMenuAlignent);
          // Use 1 second timeout to avoid crashes and spamming
          // the logs while changing the slider position in prefs
          this._timeoutMenuAlignent = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            1000,
            () => {
              this.checkAlignment();
              this._currentAlignment = this._menu_alignment;
              this._timeoutMenuAlignent = null;
              return false; // run once then destroy
            }
          );
          return;
        }

        this.checkAlignment();
        this.checkPositionInPanel();
        this.buildUI();

        AskAI.getTodaysUsage(key).then((usage) => {
          this._todaysTokenUsage = usage;
          if (this._askAIInfo) {
            // Calculated at $0.02 per 1000 tokens for the Davinci model - https://openai.com/api/pricing/
            const approximateTotalCost = this._todaysTokenUsage * 0.00002;
            this._askAIInfo.text = `AskAI v${
              Me.metadata.version
            } - Today's usage: ${
              this._todaysTokenUsage
            } (~$${approximateTotalCost.toFixed(4)})`;
          }
        });
      });
    }

    loadConfigInterface() {
      this._settingsInterface = ExtensionUtils.getSettings(
        "org.gnome.desktop.interface"
      );
      this._settingsInterfaceC = this._settingsInterface.connect(
        "changed",
        () => {
          this.buildUI();
        }
      );
    }

    get _startupDelay() {
      if (!this._settings) this.loadConfig();
      return this._settings.get_int("delay-ext-init");
    }

    get _position_in_panel() {
      if (!this._settings) this.loadConfig();
      return this._settings.get_enum("position-in-panel");
    }

    get _position_index() {
      if (!this._settings) this.loadConfig();
      return this._settings.get_int("position-index");
    }

    get _menu_alignment() {
      if (!this._settings) this.loadConfig();
      return this._settings.get_double("menu-alignment");
    }

    // TODO: Not currently used, but should start building components like this
    createButton(iconName, accessibleName) {
      let button;

      button = new St.Button({
        reactive: true,
        can_focus: true,
        track_hover: true,
        accessible_name: accessibleName,
        style_class: "btn",
      });

      button.child = new St.Icon({
        icon_name: iconName,
      });

      return button;
    }

    // GNOME Shell extension lifecycle
    stop() {
      if (this._timeoutCurrent) {
        GLib.source_remove(this._timeoutCurrent);
        this._timeoutCurrent = null;
      }
      if (this._timeoutFirstBoot) {
        GLib.source_remove(this._timeoutFirstBoot);
        this._timeoutFirstBoot = null;
      }

      if (this._timeoutMenuAlignent) {
        GLib.source_remove(this._timeoutMenuAlignent);
        this._timeoutMenuAlignent = null;
      }

      if (this._settingsC) {
        this._settings.disconnect(this._settingsC);
        this._settingsC = undefined;
      }

      if (this._settingsInterfaceC) {
        this._settingsInterface.disconnect(this._settingsInterfaceC);
        this._settingsInterfaceC = undefined;
      }

      if (this._globalThemeChangedId) {
        let context = St.ThemeContext.get_for_stage(global.stage);
        context.disconnect(this._globalThemeChangedId);
        this._globalThemeChangedId = undefined;
      }
    }
    _onActivate() {
      // focus the input field
      this._askAIInput.grab_key_focus();
    }
    _onPreferencesActivate() {
      this.menu.close();
      ExtensionUtils.openPrefs();
      return 0;
    }

    // UI updates
    menuAlignmentChanged() {
      if (this._currentAlignment != this._menu_alignment) {
        return true;
      }
      return false;
    }
    /*
    recalcLayout() {
      if (!this.menu.isOpen) return;

      if (this._buttonBox1 !== undefined) {
        this._buttonBox1.set_width(
          this._askAI.get_width() - this._buttonBox2.get_width()
        );
      }
    }
    */
    checkAlignment() {
      return;
      /*
      let menuAlignment = 1.0 - this._menu_alignment / 100;
      if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
        menuAlignment = 1.0 - menuAlignment;
      this.menu._arrowAlignment = menuAlignment;
      */
    }

    checkPositionInPanel() {
      if (
        this._old_position_in_panel == undefined ||
        this._old_position_in_panel != this._position_in_panel ||
        this._first_run ||
        this._old_position_index != this._position_index
      ) {
        this.get_parent().remove_actor(this);

        let children = null;
        switch (this._position_in_panel) {
          case WIDGET_POSITION.LEFT:
            children = Main.panel._leftBox.get_children();
            Main.panel._leftBox.insert_child_at_index(
              this,
              this._position_index
            );
            break;
          case WIDGET_POSITION.CENTER:
            children = Main.panel._centerBox.get_children();
            Main.panel._centerBox.insert_child_at_index(
              this,
              this._position_index
            );
            break;
          case WIDGET_POSITION.RIGHT:
            children = Main.panel._rightBox.get_children();
            Main.panel._rightBox.insert_child_at_index(
              this,
              this._position_index
            );
            break;
        }
        this._old_position_in_panel = this._position_in_panel;
        this._old_position_index = this._position_index;
        this._first_run = 1;
      }
    }

    //* Actually run the AI query
    // The core http request is in askai.js
    // This func is focused on updating the UI
    async makeAIRequest() {
      try {
        // Check if we are already waiting for a response
        if (this._waitingForResponse) {
          return;
        }

        // Slowly animate the submit button background color to a shade of green
        // * Right now this is not working. Color is not changing
        this._askAISubmit.ease({
          background_color: new Clutter.Color({
            red: 0x00,
            green: 0xff,
            blue: 0x78,
            alpha: 0xff,
          }),
          duration: 10000,
          mode: Clutter.AnimationMode.LINEAR,
        });

        // Update UI - Waiting for response
        this._waitingForResponse = true;
        this._askAISubmitText.text = "Thinking";

        const key = this._settings.get_string("openai-key");
        let queryText = this._askAIInputText.get_text();
        if (
          queryText === "" &&
          (this._mode === AskAI.MODES.ASK || this._mode === AskAI.MODES.WRITE)
        ) {
          // If input is empty and in "ask" or "write" mode, use the placeholder text
          queryText = this._askAIInput.get_hint_text();
        } else if (queryText === "") {
          throw new Error("Please enter a query.");
        }

        const formattedQueryText =
          this._mode === "ask" || this._mode === "write"
            ? Helpers.formatPrompt(queryText)
            : queryText;

        if (this._mode === "ask" || this._mode === "write") {
          // Single-line input - remove newlines
          this._prompt[this._mode] = formattedQueryText.replace(/(\n|\r)/gm, "");
        } else {
          this._prompt[this._mode] = formattedQueryText
        }
        // Update input text field with formatted query
        this._askAIInputText.set_text(this._prompt[this._mode]);

        const result = await AskAI.makeAIRequest(
          formattedQueryText,
          key,
          this._mode
        );
        if (!result) {
          throw new Error("Request failed. Double-check your API key.");
        }
        this._resultText = result.text;
        this._pangoMarkup = Helpers.formatMarkdownToMarkup(this._resultText);
        this._response[this._mode] = this._pangoMarkup;

        this._todaysTokenUsage += result.usage.total_tokens;
        // Calculated at $0.02 per 1000 tokens for the Davinci model - https://openai.com/api/pricing/
        const approximateCost = result.usage.total_tokens * 0.00002;
        const approximateTotalCost = this._todaysTokenUsage * 0.00002;
        const detailedInfo = `Completed in ${result.msElapsed / 1000} seconds.
Tokens: ${result.usage.total_tokens} (~$${approximateCost.toFixed(
          4
        )}). Today's total: ${
          this._todaysTokenUsage.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") // Insert commas every 3 digits
        } (~$${approximateTotalCost.toFixed(4)})`;

        // Update UI - Response received
        this._askAISubmitText.text = "Ask";
        this._askAIResultText.set_markup(this._pangoMarkup);
        this._askAIResult.visible = true;
        // select all text in result
        this._askAIResultText.grab_key_focus();
        this._askAIResultText.set_selection(0, -1);
        this._waitingForResponse = false;
        this._askAIInfo.text = detailedInfo;

        // Set submit background back to #4d4dff
        this._askAISubmit.ease({
          background_color: new Clutter.Color({
            red: 0x4d,
            green: 0x4d,
            blue: 0xff,
            alpha: 0xff,
          }),
          duration: 1000,
          mode: Clutter.AnimationMode.LINEAR,
        });
      } catch (e) {
        logError(e);
        Main.notifyError("Error", e.message);
        this._askAIInfo.text = e.message;

        // Set submit background a muted shade of red
        this._askAISubmit.ease({
          background_color: new Clutter.Color({
            red: 0xff,
            green: 0x4d,
            blue: 0x4d,
            alpha: 0xff,
          }),
          duration: 500,
          mode: Clutter.AnimationMode.LINEAR,
        });
        // Show error
        this._askAIResult.text = "Error: " + e.message;
        this._askAIResult.visible = true;
        this._waitingForResponse = false;
        this._askAISubmitText.text = "Error";
      }
    }

    //* MAIN UI
    // Consists of 4 sections:
    // - Header: title, mode selection
    // - Input section: user input, submit button
    // - Output section: AI response text
    // - Footer: misc info text
    buildUI() {
      // Destroy all children
      this._askAI.actor.destroy_all_children();

      let content = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        style_class: "content",
      });

      // Add warning message if no OpenAI key is set. Use light red background color and dark red text color. Rounded corners. Padding.
      // TODO: Expand this to a test request to the OpenAI API to see if the key is valid
      if (this._settings.get_string("openai-key") === "") {
        showNoKeyWarning(content);
      }

      // Header
      content.add_actor(this.buildHeaderUI());

      // User input, submit button
      content.add_actor(this.buildInputUI());

      // AI response text
      content.add_actor(this.buildOutputUI());

      // Footer
      content.add_actor(this.buildFooterUI());

      this._askAI.actor.add_child(content);
    }

    // Show a warning if the user has not set the OpenAI key
    showNoKeyWarning(content) {
      const warningContainer = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
        style_class: "warning-container",
        width: 400,
      });

      const warningText = new St.Label({
        text: "No OpenAI key set. Please set one in the extension settings. When you create an OpenAI account, you can make an API key in your account settings: https://beta.openai.com/account/api-keys",
        style_class: "warning-text",
      });
      warningText.clutter_text.line_wrap = true;
      warningText.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
      warningText.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      warningText.clutter_text.reactive = true;
      warningText.clutter_text.selectable = true;
      warningText.clutter_text.set_selection_color(
        new Clutter.Color({
          red: 0xff,
          green: 0xff,
          blue: 0xff,
          alpha: 0xff,
        })
      );
      // If Ctrl + C is pressed, copy the selected text to the clipboard
      warningText.clutter_text.connect("key-press-event", (actor, event) => {
        if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
          if (event.get_key_symbol() == Clutter.KEY_c) {
            St.Clipboard.get_default().set_text(
              St.ClipboardType.CLIPBOARD,
              warningText.clutter_text.get_selection()
            );
          }
        }
      });

      warningContainer.add_child(warningText);

      const openSettingsButton = new St.Button({
        style_class: "btn warning-button",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        track_hover: true,
        width: 100,
      });

      // set text on button
      const openSettingsButtonText = new St.Label({
        text: _("Open Settings"),
        style_class: "btn__text warning-button__text",
        x_align: Clutter.ActorAlign.CENTER,
      });

      openSettingsButton.set_child(openSettingsButtonText);
      openSettingsButton.connect("clicked", () => {
        ExtensionUtils.openPrefs();
      });

      const settingsButtonContainer = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_expand: true,
        style_class: "settings-button-container",
      });

      settingsButtonContainer.add_actor(openSettingsButton);

      content.add_actor(warningContainer);
      content.add_actor(settingsButtonContainer);

      // If the key gets set, hide the warning message
      /* loadConfig() has a setting listener that should rebuild the UI? Doesn't quite seem to work though.
        this._settings.connect("changed", () => {
          if (this._settings.get_string("openai-key") !== "") {
            warningContainer.hide();
            openSettingsButton.hide();
          }
        });
        */
    }

    buildHeaderUI() {
      const headerContainer = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_expand: true,
        style_class: "header",
      });

      // Create a label for the ask AI input field
      let heading = new St.Label({
        text: _("Ask AI"),
        style_class: "heading",
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Add UI for switching between the different modes (Ask, Summarize, Edit, Write). Should be horizontal
      const modesParent = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_expand: true,
        style_class: "modes-parent",
        x_align: Clutter.ActorAlign.END,
      });
      const modes = new St.BoxLayout({
        vertical: false,
        x_expand: false,
        y_expand: true,
        style_class: "modes quick-settings",
        x_align: Clutter.ActorAlign.END,
      });
      modesParent.add(modes);

      // Create a button for switching to the Ask mode
      const askMode = new St.Button({
        style_class: "button quick-toggle",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        track_hover: true,
        width: 60,
      });

      // Set text on button
      const askModeText = new St.Label({
        text: _("Ask"),
        style_class: "quick-toggle-label",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Add text to button
      askMode.set_child(askModeText);

      // Create a button for switching to the Summarize mode
      const summarizeMode = new St.Button({
        style_class: "button quick-toggle",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        track_hover: true,
        width: 100,
      });

      // Set text on button
      const summarizeModeText = new St.Label({
        text: _("Summarize"),
        style_class: "quick-toggle-label",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Add text to button
      summarizeMode.set_child(summarizeModeText);

      // Create a button for switching to the Edit mode
      const editMode = new St.Button({
        style_class: "button quick-toggle",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        track_hover: true,
        reactive: true,
        width: 70,
      });

      // Set text on button
      const editModeText = new St.Label({
        text: _("Edit"),
        style_class: "quick-toggle-label",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Add text to button
      editMode.set_child(editModeText);

      // Create a button for switching to the Write mode
      const writeMode = new St.Button({
        style_class: "button quick-toggle",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        track_hover: true,
        width: 70,
      });

      // Set text on button
      const writeModeText = new St.Label({
        text: _("Write"),
        style_class: "quick-toggle-label",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      // Give the mode that is currently active a different style
      switch (this._mode) {
        case AskAI.MODES.ASK:
          askMode.checked = true;
          break;
        case AskAI.MODES.SUMMARIZE:
          summarizeMode.checked = true;
          break;
        case AskAI.MODES.EDIT:
          editMode.checked = true;
          break;
        case AskAI.MODES.WRITE:
          writeMode.checked = true;
          break;
      }

      // Add text to button
      writeMode.set_child(writeModeText);

      // Add buttons to the modes container
      modes.add_actor(askMode);
      modes.add_actor(summarizeMode);
      modes.add_actor(editMode);
      modes.add_actor(writeMode);

      // Add hooks to the buttons
      askMode.connect("clicked", () => {
        this._mode = AskAI.MODES.ASK;
        this.buildUI();
      });
      summarizeMode.connect("clicked", () => {
        this._mode = AskAI.MODES.SUMMARIZE;
        this.buildUI();
      });
      editMode.connect("clicked", () => {
        this._mode = AskAI.MODES.EDIT;
        this.buildUI();
      });
      writeMode.connect("clicked", () => {
        this._mode = AskAI.MODES.WRITE;
        this.buildUI();
      });

      // Add heading and modes to the header container
      headerContainer.add_actor(heading);
      headerContainer.add_actor(modesParent);
      return headerContainer;
    }

    buildInputUI() {
      const inputContainer = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_expand: true,
        style_class: "input-container",
      });

      // Create a input field for the user to enter a question to ask AI
      let hintText = "Ask AI a question";
      switch (this._mode) {
        case AskAI.MODES.ASK:
          // Supply some fun example questions to ask
          hintText = [
            "How to remove a stubborn stain from a wool suit",
            "Best beach resorts in the Maldives",
            "How to make a chocolate cake with cream cheese frosting",
            "Average cost of a family trip to Disneyland",
            "Best restaurants for Italian food in New York City",
            "How to clean a cast iron skillet",
            "What is the best time to visit Machu Picchu",
            "How to remove a stubborn stain from a wool suit",
            "What is the highest mountain in the solar system?",
            "What is the largest living organism in the world?",
            "What is the longest river in the universe?",
            "What is the oldest living animal on Earth?",
            "What is the fastest land animal in the world?",
            "What is the largest animal ever recorded?",
            "What is the deepest point in the ocean?",
            "What is the tallest building in the world?",
            "What is the largest desert in the world?",
            "What is the longest animal migration on Earth?",
            "What is the smallest mammal in the world?",
            "What is the most venomous snake in the world?",
            "What is the longest lasting insect?",
            "What is the highest waterfall in the world?",
            "What is the largest and most powerful tornado ever recorded?",
            "What is the longest flight of a chicken?",
            "What is the largest volcano in the solar system?",
            "What is the highest wind speed ever recorded?",
            "What is the largest snowflake ever recorded?",
            "What is the longest snake ever recorded?",
            "How to fix a leaky faucet?",
            "What is the best budget smartphone?",
            "How to get rid of ants in the house?",
            "What is the average salary for a software developer?",
            "How to cook the perfect steak?",
            "What are the top tourist destinations in Europe?",
            "How to train for a marathon?",
            "What are the best budget laptops?",
            "How to get more protein in your diet?",
            "What is the average cost of a wedding?",
            "How to create a budget plan?",
            "What are the best online schools for a degree in computer science?",
          ][Math.floor(Math.random() * 40)];
          break;
        case AskAI.MODES.SUMMARIZE:
          hintText = "Paste text here to get summary";
          break;
        case AskAI.MODES.EDIT:
          hintText =
            "Paste text here to get an edited version with spelling and grammar corrections as well as word choice improvements.";
          break;
        case AskAI.MODES.WRITE:
          hintText =
            [
              "Time travel to ancient civilizations.",
              "Solving a string of burglaries.",
              "Discovering a new animal species.",
              "Surviving as the last person on Earth.",
              "Haunted house ghost story.",
              "Giant insect transformation.",
              "Superhero controlling the weather.",
              "Designing a theme park.",
              "Pirate treasure hunt.",
              "Farming in a plantless world.",
              "Choose-your-own-adventure decisions.",
              "Granting three genie wishes.",
              "Mad scientist world domination.",
              "Surviving in a dystopian society.",
              "Completing a fantasy quest.",
              "Escaping a horror story monster.",
              "Romance novel love story.",
              "Solving a mystery crime.",
              "Surviving in a sci-fi world.",
              "Playing a role in historical events.",
            ][Math.floor(Math.random() * 20)] ?? hintText;
          break;
      }

      // If the mode is "EDIT" or "SUMMARIZE", set the input to multiline and make the input container vertical
      if (
        this._mode === AskAI.MODES.EDIT ||
        this._mode === AskAI.MODES.SUMMARIZE
      ) {
        const inputBorder = new St.BoxLayout({
          x_expand: true,
          y_expand: true,
          vertical: true,
          style_class: "input-container input",
        });

        // TODO: Get scroll working.
        // Tried St.ScrollView, but GNOME Shell keeps crashing
        // Clutter.ScrollActor seems like it needs additional functions
        // to actually scroll in response to user input
        this._askAIInput = new Clutter.ScrollActor({
          reactive: true,
          height: 200,
          width: 400,
          scroll_mode: Clutter.ScrollMode.VERTICALLY,
        });

        // TODO: Put a St widget in here so padding can be only applied to text (and not bottom-bar)
        this._askAIInputText = new Clutter.Text({
          text: hintText,
          width: 400,
          x_expand: true,
          y_expand: true,
          reactive: true,
          editable: true,
          selectable: true,
          line_wrap: true,
          line_wrap_mode: Pango.WrapMode.WORD_CHAR,
          ellipsize: Pango.EllipsizeMode.NONE,
          selection_color: this._darkTheme ? Clutter.Color.new(102, 255, 112, 100) : Clutter.Color.new(0, 0, 0, 100),
          color: this._darkTheme ? Clutter.Color.new(255, 255, 255, 255) : Clutter.Color.new(0, 0, 0, 255),
        });

        // When the user focuses the input, clear the placeholder text
        this._askAIInputText.connect("key-focus-in", () => {
          if (this._askAIInputText.get_text() === hintText) {
            this._askAIInputText.set_text("");
          }
        });

        // when the user clicks on the input, focus the input
        this._askAIInput.connect("button-press-event", () => {
          this._askAIInputText.grab_key_focus();
        });

        // If Ctrl + C is pressed, copy the selected text to the clipboard
        this._askAIInputText.connect("key-press-event", (actor, event) => {
          if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
            if (event.get_key_symbol() == Clutter.KEY_c) {
              St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD,
                this._askAIInputText.get_selection()
              );
            }
          }
        });
        // If Ctrl + V is pressed, paste the text from the clipboard
        this._askAIInputText.connect("key-press-event", (actor, event) => {
          if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
            if (event.get_key_symbol() == Clutter.KEY_v) {
              St.Clipboard.get_default().get_text(
                St.ClipboardType.CLIPBOARD,
                (clipboard, text) => {
                  this._askAIInputText.set_text(text);
                }
              );
            }
          }
        });

        this._askAIInput.add_actor(this._askAIInputText);
        inputBorder.add_actor(this._askAIInput);

        // Add bottom bar with horizontal box layout for buttons
        const bottomBar = new St.BoxLayout({
          vertical: false,
          x_expand: true,
          y_expand: true,
          style_class: "bottom-bar",
        });

        // Create a button for copying the result to the clipboard
        const useClipboard = new St.Button({
          style_class: "btn use-clipboard",
          can_focus: true,
          y_align: Clutter.ActorAlign.CENTER,
          track_hover: true,
        });

        // Set text on button
        const useClipboardText = new St.Label({
          text: "Use Clipboard",
          style_class: "btn__text use-clipboard__text",
          x_align: Clutter.ActorAlign.CENTER,
        });

        useClipboard.set_child(useClipboardText);

        useClipboard.connect("clicked", () => {
          St.Clipboard.get_default().get_text(
            St.ClipboardType.CLIPBOARD,
            (clipboard, text) => {
              this._askAIInputText.set_text(text);
            }
          );
        });

        bottomBar.add_actor(useClipboard);
        inputBorder.add_actor(bottomBar);

        inputContainer.add_actor(inputBorder);
        inputContainer.vertical = true;
      } else {
        this._askAIInput = new St.Entry({
          style_class: "input",
          can_focus: true,
          x_expand: true,
          y_expand: true,
          hint_text: hintText,
          track_hover: true,
          width: 350,
        });

        this._askAIInputText = this._askAIInput.clutter_text;

        // If enter is pressed inside the input field, submit.
        // - For now only enabling this on single-line input (ask, write),
        //   may lead to frustrating UX if enabled on multi-line input (edit, summarize)
        this._askAIInputText.connect("activate", async () => {
          await this.makeAIRequest();
        });

        inputContainer.add_actor(this._askAIInput);
      }

      // If previous prompt is in state, show it
      if (this._prompt[this._mode]) {
        this._askAIInputText.set_markup(this._prompt[this._mode]);
        this._askAIInput.visible = true;
      }

      // horizontal box layout for buttons
      const buttonContainer = new St.BoxLayout({
        vertical: false,
        y_expand: true,
        x_expand: true,
        style_class: "button-container",
      });

      // Create a button to submit the question to ask AI
      this._askAISubmit = new St.Button({
        style_class: "button quick-toggle submit",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.END,
        track_hover: true,
        width: 100,
      });

      // set text on button
      const text = ["Ask", "Summarize", "Edit", "Write"][this._mode] ?? "Ask";
      this._askAISubmitText = new St.Label({
        text,
        style_class: "quick-toggle-label",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });

      this._askAISubmit.set_child(this._askAISubmitText);

      // If submit button is clicked
      this._askAISubmit.connect("clicked", async () => {
        await this.makeAIRequest();
      });

      buttonContainer.add_actor(this._askAISubmit);
      inputContainer.add_actor(buttonContainer);
      return inputContainer;
    }

    buildOutputUI() {
      // Use St.Bin
      this._askAIResult = new St.BoxLayout({
        style_class: "result",
        x_expand: true,
        y_expand: true,
        vertical: true,
        width: 500,
        // Hide the result until we get a response from ask AI
        visible: false,
      });

      const textContainer = new St.Bin({
        style_class: "result__text-container",
        x_expand: true,
        y_expand: true,
        width: 500,
      });

      this._askAIResultText = new Clutter.Text({
        text: _(""),
        x_expand: true,
        y_expand: true,
        width: 500,
        line_wrap: true,
        line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        ellipsize: Pango.EllipsizeMode.NONE,
        editable: true,
        cursor_visible: true,
        selectable: true,
        // Note - Reactive is essential for allowing the text to be selectable
        reactive: true,
        selection_color: this._darkTheme ? Clutter.Color.new(102, 255, 112, 100) : Clutter.Color.new(0, 0, 0, 100),
        color: this._darkTheme ? Clutter.Color.new(255, 255, 255, 255) : Clutter.Color.new(0, 0, 0, 255),
      });

      this._askAIResult.add_actor(textContainer);
      textContainer.set_child(this._askAIResultText);

      // If previous response is in state, show it
      if (this._response[this._mode]) {
        this._askAIResultText.set_markup(this._response[this._mode]);
        this._askAIResult.visible = true;
      }

      // If Ctrl + C is pressed, copy the selected text to the clipboard
      this._askAIResultText.connect("key-press-event", (actor, event) => {
        if (event.get_state() & Clutter.ModifierType.CONTROL_MASK) {
          if (event.get_key_symbol() == Clutter.KEY_c) {
            St.Clipboard.get_default().set_text(
              St.ClipboardType.CLIPBOARD,
              this._askAIResultText.get_selection()
            );
          }
        }
      });

      // Add bottom bar with horizontal box layout for buttons
      const bottomBar = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        y_expand: true,
        style_class: "bottom-bar",
      });

      // Create a button for copying the result to the clipboard
      const copyResult = new St.Button({
        style_class: "btn copy",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        track_hover: true,
      });

      // Set text on button
      const copyText = new St.Label({
        text: "Copy All",
        style_class: "btn__text copy__text",
        x_align: Clutter.ActorAlign.CENTER,
      });

      copyResult.set_child(copyText);

      // If the button is clicked, copy the result to the clipboard
      copyResult.connect("clicked", () => {
        St.Clipboard.get_default().set_text(
          St.ClipboardType.CLIPBOARD,
          this._askAIResultText.get_text()
        );
        // Change the text on the button to "Copied!" for 2 seconds
        copyText.set_text("Copied!");
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
          copyText.set_text("Copy");
          return GLib.SOURCE_REMOVE;
        });
      });

      bottomBar.add_actor(copyResult);

      // Create 2 buttons for opening the currently selected text in a browser. One button should go to google search and the other should go to wikipedia
      const googleSearch = new St.Button({
        style_class: "btn google",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        track_hover: true,
        visible: false,
      });

      const googleText = new St.Label({
        text: "Google",
        style_class: "btn__text google__text",
        x_align: Clutter.ActorAlign.CENTER,
      });

      googleSearch.set_child(googleText);

      googleSearch.connect("clicked", () => {
        try {
          Util.trySpawnCommandLine(
            `xdg-open 'https://www.google.com/search?q=${this._askAIResultText.get_selection()}'`
          );
        } catch (e) {
          logError("Error opening google search", e);
        }
      });

      bottomBar.add_actor(googleSearch);

      const wikiSearch = new St.Button({
        style_class: "btn wiki",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        track_hover: true,
        reactive: true,
        visible: false,
      });

      const wikiText = new St.Label({
        text: "Wikipedia",
        style_class: "btn__text wiki__text",
        x_align: Clutter.ActorAlign.CENTER,
      });

      wikiSearch.set_child(wikiText);

      wikiSearch.connect("clicked", () => {
        try {
          Util.trySpawnCommandLine(
            `xdg-open 'https://en.wikipedia.org/w/index.php?search=${this._askAIResultText.get_selection()}'`
          );
        } catch (e) {
          logError("Error opening wikipedia search", e);
        }
      });

      bottomBar.add_actor(wikiSearch);

      // Add button to ask ai
      const askAIButton = new St.Button({
        style_class: "btn ask-ai",
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        track_hover: true,
        visible: false,
        reactive: true,
      });

      const askAIText = new St.Label({
        text: "Ask AI",
        style_class: "btn__text ask-ai__text",
        x_align: Clutter.ActorAlign.CENTER,
      });

      askAIButton.set_child(askAIText);

      askAIButton.connect("clicked", () => {
        this._askAIInputText.set_text(`Describe ${this._askAIResultText.get_selection()}`);
        this.makeAIRequest();
        askAIText.set_text("Thinking...");
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
          askAIText.set_text("Ask AI");
          return GLib.SOURCE_REMOVE;
        })
      });

      bottomBar.add_actor(askAIButton);

      // If the user selects text, show the google, wikipedia, and ask-ai buttons
      this._askAIResultText.connect("cursor-changed", () => {
        if (this._askAIResultText.get_selection() != "") {
          googleSearch.visible = true;
          wikiSearch.visible = true;
          askAIButton.visible = true;
        } else {
          googleSearch.visible = false;
          wikiSearch.visible = false;
          askAIButton.visible = false;
        }
      });

      // If the Clutter.Text loses focus, hide the google and wikipedia buttons
      this._askAIResultText.connect("key-focus-out", () => {
        // delay by 500ms - this is to prevent the buttons from disappearing when the user clicks on them
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          googleSearch.visible = false;
          wikiSearch.visible = false;
          askAIButton.visible = false;
        });
      });

      this._askAIResult.add_actor(bottomBar);

      return this._askAIResult;
    }

    buildFooterUI() {
      // Footer container organize items in a row (left to right), space between them
      let footerContainer = new St.BoxLayout({
        style_class: "footer",
        x_expand: true,
        y_expand: true,
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.END,
        vertical: false,
      });

      // Small fine print text with additional info about the response
      this._askAIInfo = new St.Label({
        // Show AskAI version number by default
        text: _("AskAI v" + Me.metadata.version),
        style_class: "info",
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });

      footerContainer.add(this._askAIInfo);
      return footerContainer;
    }
  }
);

let askAIMenu;

function init() {
  ExtensionUtils.initTranslations(Me.metadata["gettext-domain"]);
}

function enable() {
  askAIMenu = new AskAIMenuButton();
  // Main.panel.addToStatusArea('askAIMenu', askAIMenu);
  Main.panel._rightBox.insert_child_at_index(askAIMenu, 0);
}

function disable() {
  Main.wm.removeKeybinding("ask-ai-shortcut");
  askAIMenu.stop();
  askAIMenu.destroy();
  askAIMenu = null;
}
