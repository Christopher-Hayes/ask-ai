const { Soup, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

// Make AI request to OpenAI's GPT-3 API
async function makeAIRequest(prompt, key) {
    const openaiUrl = 'https://api.openai.com/v1/completions';
    // POST payload
    let params = {
        model: 'text-davinci-003',
        prompt: prompt,
        temperature: 0.7,
        max_tokens: 366,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
    };
    // Request headers
    const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
    };

    try {
        const json = await this.loadJsonAsyncHeaders(openaiUrl, params, headers)
        // log('json response: ' + JSON.stringify(json));

        let text = json.choices[0].text
        // If text starts with newlines, remove them
        text = text.replace(/^(\n)+/, '');

        return text;
    }
    catch (e) {
        logError(e);
    }
}

// Make a POST request to the given URL with the given parameters and headers
function loadJsonAsyncHeaders(url, jsonData, headers) {
    return new Promise((resolve, reject) => {

        // Create user-agent string from uuid and (if present) the version
        let _userAgent = Me.metadata.uuid;
        if (Me.metadata.version !== undefined && Me.metadata.version.toString().trim() !== '') {
            _userAgent += '/';
            _userAgent += Me.metadata.version.toString();
        }

        let _httpSession = new Soup.Session();
        let _message = Soup.Message.new('POST', url);
        _message.request_headers.append('Content-Type', 'application/json');
        _message.request_body.append(JSON.stringify(jsonData));
        // add trailing space, so libsoup adds its own user-agent
        _httpSession.user_agent = _userAgent + ' ';

        // Headers
        for (let key in headers) {
            _message.request_headers.append(key, headers[key]);
        }

        _httpSession.send_and_read_async(_message, GLib.PRIORITY_DEFAULT, null, (_httpSession, _message) => {

            let _jsonString = _httpSession.send_and_read_finish(_message).get_data();
            if (_jsonString instanceof Uint8Array) {
                _jsonString = ByteArray.toString(_jsonString);
            }
            try {
                if (!_jsonString) {
                    throw new Error("No data in response body");
                }
                resolve(JSON.parse(_jsonString));
            }
            catch (e) {
                _httpSession.abort();
                reject(e);
            }
        });
    });
}
