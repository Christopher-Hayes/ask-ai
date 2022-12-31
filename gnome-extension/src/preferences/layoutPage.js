const {
    Adw, Gtk, GObject
} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var LayoutPage = GObject.registerClass(
class AskAI_LayoutPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: _("Layout"),
            icon_name: 'preferences-other-symbolic',
            name: 'LayoutPage'
        });
        this._settings = settings;

        // Panel Options
        let panelGroup = new Adw.PreferencesGroup({
            title: _("Panel")
        });

        // Position in panel
        let panelPositions = new Gtk.StringList();
        panelPositions.append(_("Center"));
        panelPositions.append(_("Right"));
        panelPositions.append(_("Left"));
        let panelPositionRow = new Adw.ComboRow({
            title: _("Position In Panel"),
            model: panelPositions,
            selected: this._settings.get_enum('position-in-panel')
        });

        // Position offset
        let positionOffsetSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 15,
                step_increment: 1,
                page_increment: 1,
                page_size: 0,
                value: this._settings.get_int('position-index')
            }),
            climb_rate: 1,
            digits: 0,
            numeric: true,
            valign: Gtk.Align.CENTER
        });
        let positionOffsetRow = new Adw.ActionRow({
            title: _("Position Offset"),
            subtitle: _("The position relative to other items in the box"),
            activatable_widget: positionOffsetSpinButton
        });
        positionOffsetRow.add_suffix(positionOffsetSpinButton);

        panelGroup.add(panelPositionRow);
        panelGroup.add(positionOffsetRow);
        this.add(panelGroup);

        // Popup Options
        let popupGroup = new Adw.PreferencesGroup({
            title: _("Popup")
        });

        // Popup position
        let askAIPopupPositionScale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 0.1,
                page_increment: 2,
                value: this._settings.get_double('menu-alignment')
            }),
            width_request: 200,
            show_fill_level: 1,
            restrict_to_fill_level: 0,
            fill_level: 100
        });
        let askAIPopupPositionRow = new Adw.ActionRow({
            title: _("Popup Position"),
            subtitle: _("Alignment of the popup from left to right"),
            activatable_widget: askAIPopupPositionScale
        });
        askAIPopupPositionRow.add_suffix(askAIPopupPositionScale);

        popupGroup.add(askAIPopupPositionRow);
        this.add(popupGroup);

        // Bind signals
        panelPositionRow.connect("notify::selected", (widget) => {
            this._settings.set_enum('position-in-panel', widget.selected);
        });
        positionOffsetSpinButton.connect('value-changed', (widget) => {
            this._settings.set_int('position-index', widget.get_value());
        });
        askAIPopupPositionScale.connect('value-changed', (widget) => {
            this._settings.set_double('menu-alignment', widget.get_value());
        });
    }
});
