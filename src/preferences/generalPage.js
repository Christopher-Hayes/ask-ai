const {
    Adw, Gtk, GObject
} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var GeneralPage = GObject.registerClass(
class AskAI_GeneralPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: _("Settings"),
            icon_name: 'preferences-system-symbolic',
            name: 'GeneralPage'
        });
        this._settings = settings;

        // General Settings
        let generalGroup = new Adw.PreferencesGroup({
            title: _("General")
        });

        // OpenAPI key
        let openAIApiKeyEntry = new Gtk.Entry({
            width_chars: 20,
            vexpand: false,
            sensitive: true,
            valign: Gtk.Align.CENTER
        });
        let openAIKey= this._settings.get_string('openai-key');
        if (openAIKey != '') {
            openAIApiKeyEntry.set_text(openAIKey);
        }

        let openAIApiKeyRow = new Adw.ActionRow({
            title: _("Personal API Key"),
            subtitle: _("Personal API key for OpenAI"),
            activatable_widget: openAIApiKeyEntry
        });

        openAIApiKeyRow.add_suffix(openAIApiKeyEntry);

        openAIApiKeyEntry.connect("notify::text", (widget) => {
            if (widget.text.length > 0) {
                this._settings.set_string('openai-key', widget.text);
                openAIApiKeyEntry.set_icon_from_icon_name(Gtk.PositionType.LEFT, '');
            }
            else {
                openAIApiKeyEntry.set_icon_from_icon_name(Gtk.PositionType.LEFT, 'dialog-warning');
                if (widget.text.length == 0) {
                    this._settings.set_string('openai-key', '');
                }
            }
        });

        // Startup delay
        let startupDelaySpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 30,
                step_increment: 1,
                page_increment: 10,
                value: this._settings.get_int('delay-ext-init')
            }),
            climb_rate: 1,
            numeric: true,
            update_policy: 'if-valid',
            valign: Gtk.Align.CENTER
        });
        let startupDelayRow = new Adw.ActionRow({
            title: _("First Boot Delay"),
            subtitle: _("Seconds to delay popup initialization and data fetching"),
            tooltip_text: _("This setting only applies to the first time the extension is loaded. (first log in / restarting gnome shell)"),
            activatable_widget: startupDelaySpinButton
        });
        startupDelayRow.add_suffix(startupDelaySpinButton);

        generalGroup.add(openAIApiKeyRow);
        generalGroup.add(startupDelayRow);
        this.add(generalGroup);


        startupDelaySpinButton.connect('value-changed', (widget) => {
            this._settings.set_int('delay-ext-init', widget.get_value());
        });
    }
});