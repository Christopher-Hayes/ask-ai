const {
    Adw, Gtk, GdkPixbuf, GObject
} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var AboutPage = GObject.registerClass(
class AskAI_AboutPage extends Adw.PreferencesPage {
    _init() {
        super._init({
            title: _("About"),
            icon_name: 'help-about-symbolic',
            name: 'AboutPage',
            margin_start: 10,
            margin_end: 10
        });

        // Extension logo and description
        let aboutGroup = new Adw.PreferencesGroup();
        let aboutBox = new Gtk.Box( {
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: false,
            vexpand: false
        });
        let askAIImage = new Gtk.Image({
            icon_name: 'askai-icon',
            margin_bottom: 5,
            pixel_size: 100
        });
        let askAILabel = new Gtk.Label({
            label: '<span size="larger"><b>AskAI</b></span>',
            use_markup: true,
            margin_bottom: 15,
            vexpand: true,
            valign: Gtk.Align.FILL
        });
        let aboutDescription = new Gtk.Label({
            label: _("Ask AI any question from right in the GNOME Shell"),
            margin_bottom: 3,
            hexpand: false,
            vexpand: false
        });

        aboutBox.append(askAIImage);
        aboutBox.append(askAILabel);
        aboutBox.append(aboutDescription);
        aboutGroup.add(aboutBox);
        this.add(aboutGroup);

        // Info group
        let infoGroup = new Adw.PreferencesGroup();
        let releaseVersion = (Me.metadata.version) ? Me.metadata.version : _("unknown");
        let gitVersion = (Me.metadata['git-version']) ? Me.metadata['git-version'] : null;
        let windowingLabel = (Me.metadata.isWayland) ? "Wayland" : "X11";

        // Extension version
        let askAIVersionRow = new Adw.ActionRow({
            title: _("AskAI Version")
        });
        askAIVersionRow.add_suffix(new Gtk.Label({
            label: releaseVersion + ''
        }));
        // Git version for self builds
        let gitVersionRow = null;
        if (gitVersion) {
            gitVersionRow = new Adw.ActionRow({
                title: _("Git Version")
            });
            gitVersionRow.add_suffix(new Gtk.Label({
                label: gitVersion + ''
            }));
        }
        // shell version
        let gnomeVersionRow = new Adw.ActionRow({
            title: _("GNOME Version")
        });
        gnomeVersionRow.add_suffix(new Gtk.Label({
            label: imports.misc.config.PACKAGE_VERSION + '',
        }));
        // session type
        let sessionTypeRow = new Adw.ActionRow({
            title: _("Session Type"),
        });
        sessionTypeRow.add_suffix(new Gtk.Label({
            label: windowingLabel
        }));

        infoGroup.add(askAIVersionRow);
        gitVersion && infoGroup.add(gitVersionRow);
        infoGroup.add(gnomeVersionRow);
        infoGroup.add(sessionTypeRow);
        this.add(infoGroup);

        // Maintainer
        let maintainerGroup = new Adw.PreferencesGroup();
        let imageLinksGroup = new Adw.PreferencesGroup();

        let maintainerBox = new Gtk.Box( {
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: false,
            vexpand: false
        });
        let maintainerAbout = new Gtk.Label({
            label: _("Maintained by: %s").format("Chris Hayes"),
            hexpand: false,
            vexpand: false
        });

        maintainerBox.append(maintainerAbout);
        maintainerGroup.add(maintainerBox);
        this.add(maintainerGroup);
        this.add(imageLinksGroup);

        // Provider
        let providerGroup = new Adw.PreferencesGroup();
        let providerBox = new Gtk.Box( {
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 15,
            hexpand: false,
            vexpand: false
        });
        let providerAbout = new Gtk.Label({
            label: _("AI API provided by: %s").format('<a href="https://openai.com">OpenAI</a>'),
            use_markup: true,
            hexpand: false,
            vexpand: false
        });
        providerBox.append(providerAbout);
        providerGroup.add(providerBox);
        this.add(providerGroup);

        // License
        let gnuLicense = '<span size="small">' +
            _("This program comes with ABSOLUTELY NO WARRANTY.") + '\n' +
            _("See the") + ' <a href="https://gnu.org/licenses/old-licenses/gpl-2.0.html">' +
            _("GNU General Public License, version 2 or later") + '</a> ' + _("for details.") +
            '</span>';
        let gplGroup = new Adw.PreferencesGroup();
        let gplLabel = new Gtk.Label({
            label: gnuLicense,
            use_markup: true,
            justify: Gtk.Justification.CENTER
        });
        let gplLabelBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.END,
            vexpand: true,
        });
        gplLabelBox.append(gplLabel);
        gplGroup.add(gplLabelBox);
        this.add(gplGroup);
    }
});