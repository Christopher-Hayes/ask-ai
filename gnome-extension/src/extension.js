const {
    Clutter, Gio, Gtk, GLib, GObject, Meta, Pango, Shell, St
} = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const GnomeSession = imports.misc.gnomeSession;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const AskAI = Me.imports.askai;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

let _firstBoot = 1;

const WidgetPosition = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2
};

//hack (for Wayland?) via https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/1997
Gtk.IconTheme.get_default = function() {
    let theme = new Gtk.IconTheme();
    theme.set_custom_theme(St.Settings.get().gtk_icon_theme);
    return theme;
};

let AskAIMenuButton = GObject.registerClass(
class AskAIMenuButton extends PanelMenu.Button {

    _init() {
        super._init(0, 'AskAIMenuButton', false);

        // Putting the panel item together
        this._askAIIcon = new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'system-status-icon askai-icon'
        });
        this._askAIIcon.set_gicon(Gio.icon_new_for_string(Me.path + "/media/ask-ai-icon.svg"));
        let topBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
        });
        topBox.add_child(this._askAIIcon);
        this.add_child(topBox);

        if (Main.panel._menus === undefined)
            Main.panel.menuManager.addMenu(this.menu);
        else
            Main.panel._menus.addMenu(this.menu);

        // Load settings
        this.loadConfig();

        // Setup keybinding
        this._keybinding = Main.wm.addKeybinding(
            'ask-ai-shortcut',
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
                        this._askAIInput.clutter_text.set_selection(0, -1);
                    }
                }
            }
        );

        // Setup network things
        this._waitingForResponse = false;

        // Bind signals
        this.menu.connect('open-state-changed', this.recalcLayout.bind(this));

        // Menu UI
        this.checkPositionInPanel();
        this._askAI = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });


        let _firstBootWait = this._startupDelay;
        if (_firstBoot && _firstBootWait != 0) {
            // Delay popup initialization and data fetch on the first
            // extension load, ie: first log in / restart gnome shell
            this._timeoutFirstBoot = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, _firstBootWait, () => {
                this.rebuildAskAIUi();
                _firstBoot = 0;
                this._timeoutFirstBoot = null;
                return false; // run timer once then destroy
            });
        }
        else {
            this.rebuildAskAIUi();
        }

        this.menu.addMenuItem(this._askAI);
        this.checkAlignment();
    }

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

    loadConfig() {
        this._settings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);

        // Bind to settings changed signal
        this._settingsC = this._settings.connect("changed", () => {

                if (this.menuAlignmentChanged()) {
                    if (this._timeoutMenuAlignent)
                        GLib.source_remove(this._timeoutMenuAlignent);
                    // Use 1 second timeout to avoid crashes and spamming
                    // the logs while changing the slider position in prefs
                    this._timeoutMenuAlignent = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                        this.checkAlignment();
                        this._currentAlignment = this._menu_alignment;
                        this._timeoutMenuAlignent = null;
                        return false; // run once then destroy
                    });
                    return;
                }

                this.checkAlignment();
                this.checkPositionInPanel();
                this.rebuildAskAIUi();
        });
    }

    loadConfigInterface() {
        this._settingsInterface = ExtensionUtils.getSettings('org.gnome.desktop.interface');
        this._settingsInterfaceC = this._settingsInterface.connect("changed", () => {
            this.rebuildAskAIUi();
        });
    }

    menuAlignmentChanged() {
        if (this._currentAlignment != this._menu_alignment) {
            return true;
        }
        return false;
    }

    get _startupDelay() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_int('delay-ext-init');
    }

    get _text_in_panel() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_boolean('show-text-in-panel');
    }

    get _position_in_panel() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_enum('position-in-panel');
    }

    get _position_index() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_int('position-index');
    }

    get _menu_alignment() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_double('menu-alignment');
    }

    get _comment_in_panel() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_boolean('show-comment-in-panel');
    }

    get _refresh_interval_current() {
        if (!this._settings)
            this.loadConfig();
        let v = this._settings.get_int('refresh-interval-current');
        return ((v >= 600) ? v : 600);
    }

    get _decimal_places() {
        if (!this._settings)
            this.loadConfig();
        return this._settings.get_int('decimal-places');
    }

    createButton(iconName, accessibleName) {
        let button;

        button = new St.Button({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessibleName,
            style_class: 'message-list-clear-button button askai-button-action'
        });

        button.child = new St.Icon({
            icon_name: iconName
        });

        return button;
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

    recalcLayout() {
        if (!this.menu.isOpen)
            return;

        if (this._buttonBox1 !== undefined) {
            this._buttonBox1.set_width(this._askAI.get_width() - this._buttonBox2.get_width());
        }
    }

    checkAlignment() {
        let menuAlignment = 1.0 - (this._menu_alignment / 100);
        if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
            menuAlignment = 1.0 - menuAlignment;
        this.menu._arrowAlignment=menuAlignment;
    }

    checkPositionInPanel() {
        if (
            this._old_position_in_panel == undefined
            || this._old_position_in_panel != this._position_in_panel
            || this._first_run || this._old_position_index != this._position_index
        ) {
            this.get_parent().remove_actor(this);

            let children = null;
            switch (this._position_in_panel) {
                case WidgetPosition.LEFT:
                    children = Main.panel._leftBox.get_children();
                    Main.panel._leftBox.insert_child_at_index(this, this._position_index);
                    break;
                case WidgetPosition.CENTER:
                    children = Main.panel._centerBox.get_children();
                    Main.panel._centerBox.insert_child_at_index(this, this._position_index);
                    break;
                case WidgetPosition.RIGHT:
                    children = Main.panel._rightBox.get_children();
                    Main.panel._rightBox.insert_child_at_index(this, this._position_index);
                    break;
            }
            this._old_position_in_panel = this._position_in_panel;
            this._old_position_index = this._position_index;
            this._first_run = 1;
        }

    }

    async makeAIRequest() {
        try {
            // Check if we are already waiting for a response
            if (this._waitingForResponse) {
                return;
            }

            // Slowly animate the submit button background color to a shade of green
            // * Right now this is not working. Color is not changing
            this._askAISubmit.ease({
                background_color: new Clutter.Color({ red: 0x00, green: 0xff, blue: 0x78, alpha: 0xff }),
                duration: 5000,
                mode: Clutter.AnimationMode.LINEAR,
            });

            this._waitingForResponse = true;
            this._askAISubmitText.text = ('Thinking');
            const queryText = this._askAIInput.text;
            const key = this._settings.get_string('openai-key');
            // log('query: ' + queryText);
            const result = await AskAI.makeAIRequest(queryText, key);
            this._askAISubmitText.text = ('Ask');
            // log('result: ' + result);
            this._askAIResult.text = result;
            // Show the result element
            this._askAIResult.visible = true;
            this._waitingForResponse = false;

            // Set submit background back to #4d4dff
            this._askAISubmit.ease({
                background_color: new Clutter.Color({ red: 0x4d, green: 0x4d, blue: 0xff, alpha: 0xff }),
                duration: 1000,
                mode: Clutter.AnimationMode.LINEAR,
            });
        } catch (e) {
            logError(e);

            // Set submit background a muted shade of red
            this._askAISubmit.ease({
                background_color: new Clutter.Color({ red: 0xff, green: 0x4d, blue: 0x4d, alpha: 0xff }),
                duration: 500,
                mode: Clutter.AnimationMode.LINEAR,
            });
            // Show error
            this._askAIResult.text = 'Error: ' + e.message;
            this._askAIResult.visible = true;
            this._waitingForResponse = false;
            this._askAISubmitText.text = ('Error');
        }
    }

    rebuildAskAIUi() {
        // Destroy all children
        this._askAI.actor.destroy_all_children();

        // Get UI via a Glade file in ui/main.glade
        let builder = new Gtk.Builder();
        builder.add_from_file(Me.path + '/ui/main.glade');

        // Get the main container
        let mainContainer = builder.get_object('main-content');

        // Add the main container to the ask AI container
        this._askAI.actor.add_child(mainContainer);

        /*
        // Create the main container
        const mainContainer = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            style_class: 'askai-main-container'
        });

        // Create a box layout to for a label and an input field for the user to enter a question to ask AI
        let content = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            style_class: 'system-menu-action askai-content'
        });

        // Create a label for the ask AI input field
        let askAILabel = new St.Label({
            text: _('Ask AI'),
            style_class: 'askai-label'
        });

        const inputContainer = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            y_expand: true,
            style_class: 'system-menu-action askai-input-container'
        });

        // Create a input field for the user to enter a question to ask AI
        this._askAIInput = new St.Entry({
            style_class: 'askai-input',
            can_focus: true,
            x_expand: true,
            y_expand: true,
            hint_text: _('Ask AI a question'),
            track_hover: true,
            width: 300,
        });

        // Create a button to submit the question to ask AI
        this._askAISubmit = new St.Button({
            style_class: 'askai-submit',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            track_hover: true,
            width: 100,
        });

        inputContainer.add_actor(this._askAIInput);
        inputContainer.add_actor(this._askAISubmit);

        // set text on button
        this._askAISubmitText = new St.Label({
            text: _('Ask'),
            style_class: 'askai-submit-text',
            x_align: Clutter.ActorAlign.CENTER
        });


        this._askAISubmit.set_child(this._askAISubmitText);

        // multiline wrapping response text from ask AI
        this._askAIResult = new St.Label({
            text: _(''),
            style_class: 'askai-result',
            x_expand: true,
            y_expand: true,
            width: 500,
        });
        this._askAIResult.clutter_text.line_wrap = true;
        this._askAIResult.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._askAIResult.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._askAIResult.clutter_text.selectable = true;

        // Hide the result until we get a response from ask AI
        this._askAIResult.visible = false;

        // If submit button is clicked
        this._askAISubmit.connect('clicked', async () => {
            await this.makeAIRequest();
        });

        // Or if enter is pressed inside the input field
        this._askAIInput.clutter_text.connect('activate', async () => {
            await this.makeAIRequest();
        });

        content.add_actor(askAILabel);
        content.add_actor(inputContainer);
        content.add_actor(this._askAIResult);

        mainContainer.add_actor(content);
        this._askAI.actor.add_child(mainContainer);
        */
    }
});

let askAIMenu;

function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
}

function enable() {
    askAIMenu = new AskAIMenuButton();
    // Main.panel.addToStatusArea('askAIMenu', askAIMenu);
    Main.panel._rightBox.insert_child_at_index(askAIMenu, 0);
}

function disable() {
    Main.wm.removeKeybinding('ask-ai-shortcut');
    askAIMenu.stop();
    askAIMenu.destroy();
    askAIMenu = null;
}
