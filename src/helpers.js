//* Static utility functions
// Named "helpers.js" to avoid confusion with the "Util" GNOME Shell module
// formatPrompt(): Add punctuation to avoid AI trying to complete the question.
// formatMarkdownToMarkup(): Replace AI repsonse markdown with Pango markup
// http(): Make http request
const { Soup, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function formatPrompt(prompt) {
  prompt = prompt.trim();

  // look at the first word and see if it's a question
  const questionWords = ['who', 'what', 'when', 'where', 'why', 'how', 'which', 'is', 'are', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should'];
  let firstWord = prompt.split(" ")[0].toLowerCase();

  if (questionWords.includes(firstWord)) {
    // if it doesn't end with a question mark, add one
    if (!prompt.endsWith("?") && !prompt.endsWith(".")) {
      prompt = prompt + "?";
    }
  } else {
    // if it doesn't end with a period, add one
    if (!prompt.endsWith(".") && !prompt.endsWith("?")) {
      prompt = prompt + ".";
    }
  }

  // Capitalize first letter
  prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);

  // Add newline to end of prompt to avoid AI trying to complete the question.
  prompt = prompt + "\n";

  return prompt;
}

// Replace markdown with Pango markup
// TODO: This needs improvement. Either Pango not working or needs styling added to CSS stylesheet.
function formatMarkdownToMarkup(text) {
  // Bold
  text = text.replace(/(\*\*|__)(.*?)\1/g, "<b>$2</b>");
  // Italic
  text = text.replace(/(\*|_)(.*?)\1/g, "<i>$2</i>");
  // Strikethrough
  text = text.replace(/~~(.*?)~~/g, "<s>$1</s>");
  // Inline code
  text = text.replace(/`([^`]+)`/g, "<tt>$1</tt>");
  // Code block
  text = text.replace(/```(.*?)```/gs, "<tt>$1</tt>");
  // Blockquote
  text = text.replace(/^> (.*)$/gm, "<i>$1</i>");
  // Link
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  // Newline (?)
  text = text.replace(/\n/g, "\n");

  // Remove any remaining markdown
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");

  return text;
}

/*
* async HTTP(S) request (using libsoup3)
Make a request to the given URL with the given parameters and headers
- If no content-type header is given, the default is application/json

Usage:                http(<URL: String>, <headers: Object = {}>, <method: String = 'GET'>, <data: Object = null>)
GET example:          http("https://example.com", {}, "GET")
POST example:         http("https://example.com", {}, "POST", { foo: "bar" })
Bearer token example: http("https://example.com", { "Authorization": "Bearer <token>" }, "POST", { foo: "bar" })

Returns:
Promise<Response Payload: Object>
*/
function http(url,
  headers = {
    "Content-Type": "application/json",
  },
  method = "GET",
  jsonData = null)
{
  return new Promise((resolve, reject) => {
    let _httpSession = new Soup.Session();
    let _message = Soup.Message.new(method, url);

    // Usage-agent - Create user-agent string from uuid and (if present) the version
    let _userAgent = Me.metadata.uuid;
    if (
      Me.metadata.version !== undefined &&
      Me.metadata.version.toString().trim() !== ""
    ) {
      _userAgent += "/";
      _userAgent += Me.metadata.version.toString();
    }

    // If POST, add data to request body
    if (method === "POST") {
      _message.set_request_body_from_bytes('application/json', ByteArray.fromString(JSON.stringify(jsonData)));
    }

    // Headers
    // add trailing space, so libsoup adds its own user-agent
    _httpSession.user_agent = _userAgent + " ";
    for (let key in headers) {
      _message.request_headers.replace(key, headers[key]);
    }

    // If content-type is not set, set it to application/json
    if (!_message.request_headers.get_content_type()) {
      _message.request_headers.set_content_type("application/json");
    }

    try {
      _httpSession.send_and_read_async(
        _message,
        GLib.PRIORITY_DEFAULT,
        null,
        (_httpSession, _message) => {
          try {
            // TODO: This function is meant to be flexible with its return type; however, the code below expects a JSON string.
            let _jsonString = _httpSession
              .send_and_read_finish(_message)
              .get_data();
            if (_jsonString instanceof Uint8Array) {
              _jsonString = ByteArray.toString(_jsonString);
            }
            if (!_jsonString) {
              throw new Error("No data in response body");
            }
            resolve(JSON.parse(_jsonString));
          } catch (e) {
            // TODO: Generalize this error message
            reject(new Error("Request failed. Double-check your API key."));
          }
        }
      );
    } catch (e) {
      _httpSession.abort();
      reject(e);
    }
  });
}

//* Token estimation
// Credit @Schroeder - https://stackoverflow.com/a/74875104/2096769
const promptLenToTokens = (promptLen) => {
  // returns an estimate of #tokens corresponding to #characters nchars
  return Math.max(0, Math.floor((promptLen - init_offset) * Math.exp(-1)));
};

const tokensToPromptLen = (tokenCount) => {
  // returns an estimate of #characters corresponding to #tokens ntokens
  return Math.max(0, Math.floor(tokenCount * Math.exp(1)) + 2);
};

const maxTokensToLen = (maxTokens) => {
  // returns a number of characters very likely to correspond <= maxTokens
  const sqrtMargin = 0.5;
  const linMargin = 1.010175047; // = e - 1.001 - sqrt(1 - sqrt_margin) // ensures return 1 when maxTokens=1

  return Math.max(
    0,
    Math.floor(maxTokens * Math.exp(1) - linMargin - Math.sqrt(Math.max(0, maxTokens - sqrtMargin)))
  );
};

const truncateTextToMaxTokens = (text, maxTokens) => {
  // returns a truncation of text to make it (likely) fit within a token limit
  // So the output string is very likely to have <= maxTokens, no guarantees though.
  const charIndex = Math.min(text.length, nchars_leq_ntokens_approx(maxTokens));

  return text.slice(0, charIndex);
};

// Lodash debounce
const debounce = (func, delay, { leading } = {}) => {
  let timerId

  return (...args) => {
    if (!timerId && leading) {
      func(...args)
    }
    clearTimeout(timerId)

    timerId = setTimeout(() => func(...args), delay)
  }
}
