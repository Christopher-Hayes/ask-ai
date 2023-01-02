# Basic Makefile

PKG_NAME = gnome-shell-extension-ask-ai
UUID = ask-ai@hayes.software
BASE_MODULES = metadata.json
SRC_MODULES = extension.js askai.js util.js prefs.js stylesheet.css
PREFS_MODULES = generalPage.js layoutPage.js aboutPage.js
EXTRA_DIRECTORIES = media
TOLOCALIZE = $(addprefix src/, extension.js askai.js util.js prefs.js) \
             $(addprefix src/preferences/, $(PREFS_MODULES)) \
             schemas/org.gnome.shell.extensions.ask-ai.gschema.xml

# Packagers: Use DESTDIR for system wide installation
ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif
# Set a git version for self builds from the latest git tag with the revision
# (a monotonically increasing number that uniquely identifies the source tree)
# and the current short commit SHA1. (Note: not set if VERSION passed)
# GIT_VER = $(shell git describe --long --tags | sed 's/^v//;s/\([^-]*-g\)/r\1/;s/-/./g')
# The command line passed variable VERSION is used to set the version integer
# in the metadata and in the generated zip file. If no VERSION is passed, we
# won't touch the metadata version and instead use that for the zip file.
ifdef VERSION
	ZIPVER = -v$(VERSION)
else
	ZIPVER = -v$(shell cat metadata.json | sed '/"version"/!d' | sed s/\"version\"://g | sed s/\ //g)
endif

.PHONY: all clean extension install install-local zip-file

all: extension

clean:
	rm -f ./schemas/gschemas.compiled

extension: ./schemas/gschemas.compiled

./schemas/gschemas.compiled: ./schemas/org.gnome.shell.extensions.ask-ai.gschema.xml
	glib-compile-schemas ./schemas/

install: install-local

install-local: _build
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -r ./_build/* $(INSTALLBASE)/$(UUID)/
ifeq ($(INSTALLTYPE),system)
	# system-wide settings
	rm -r  $(addprefix $(INSTALLBASE)/$(UUID)/, schemas)
	mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas
	cp -r ./schemas/*gschema.xml $(SHARE_PREFIX)/glib-2.0/schemas
endif
	-rm -fR _build
	echo done

zip-file: _build
	cd _build ; \
	zip -qr "$(PKG_NAME)$(ZIPVER).zip" .
	mv _build/$(PKG_NAME)$(ZIPVER).zip ./
	-rm -fR _build

_build: all
	-rm -fR ./_build
	mkdir -p _build/preferences
	cp $(BASE_MODULES) $(addprefix src/, $(SRC_MODULES)) _build
	cp $(addprefix src/preferences/, $(PREFS_MODULES)) _build/preferences
	cp -r $(EXTRA_DIRECTORIES) _build
	mkdir -p _build/schemas
	cp schemas/*.xml _build/schemas/
	cp schemas/gschemas.compiled _build/schemas/
# ifdef VERSION
# 	sed -i 's/"version": .*/"version": $(VERSION)/' _build/metadata.json;
# else ifneq ($(strip $(GIT_VER)),)
# 	sed -i '/"version": .*/i\ \ "git-version": "$(GIT_VER)",' _build/metadata.json;
# endif
