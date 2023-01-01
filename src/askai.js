const { Soup, GLib } = imports.gi;
const ByteArray = imports.byteArray;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const _ = Gettext.gettext;
const Main = imports.ui.main;

function formatPrompt(prompt) {
  prompt = prompt.trim();

  // look at the first word and see if it's a question
  let firstWord = prompt.split(" ")[0].toLowerCase();

  if (
    firstWord.includes("who") ||
    firstWord.includes("what") ||
    firstWord.includes("when") ||
    firstWord.includes("where") ||
    firstWord.includes("why") ||
    firstWord.includes("how")
  ) {
    // if it doesn't end with a question mark, add one
    if (!prompt.endsWith("?")) {
      prompt = prompt + "?";
    }
  } else {
    // if it doesn't end with a period, add one
    if (!prompt.endsWith(".")) {
      prompt = prompt + ".";
    }
  }

  // Capitalize first letter
  prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);

  return prompt;
}

// Replace markdown with Pango markup
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

// Make AI request to OpenAI's GPT-3 API
async function makeAIRequest(prompt, key) {
  const openaiUrl = "https://api.openai.com/v1/completions";

  // POST payload
  let params = {
    model: "text-davinci-003",
    prompt: prompt,
    temperature: 0.7,
    max_tokens: 366,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };
  // Request headers
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + key,
  };

  try {
    let start = new Date().getTime();
    const json = await this.loadJsonAsyncHeaders(openaiUrl, params, headers);
    let end = new Date().getTime();
    let time = end - start;

    let text = json.choices[0].text;
    // If text starts with newlines, remove them
    text = text.replace(/^(\n)+/, "");

    return {
      text, // String
      msElapsed: time, // Number
      model: json.model, // String
      usage: {
        prompt_tokens: json.usage.prompt_tokens, // Number
        completion_tokens: json.usage.completion_tokens, // Number
        total_tokens: json.usage.total_tokens, // Number
      },
    };
  } catch (e) {
    logError(e);
    Main.notifyError(
      _("Error"),
      e.message || _("An error occurred while making the request.")
    );
  }
}

// Make a request to the given URL with the given parameters and headers
function loadJsonAsyncHeaders(url, jsonData, headers, method = "POST") {
  return new Promise((resolve, reject) => {
    // Create user-agent string from uuid and (if present) the version
    let _userAgent = Me.metadata.uuid;
    if (
      Me.metadata.version !== undefined &&
      Me.metadata.version.toString().trim() !== ""
    ) {
      _userAgent += "/";
      _userAgent += Me.metadata.version.toString();
    }

    let _httpSession = new Soup.Session();
    let _message = Soup.Message.new(method, url);
    _message.request_headers.append("Content-Type", "application/json");
    if (method === "POST") {
      _message.request_body.append(JSON.stringify(jsonData));
    }
    // add trailing space, so libsoup adds its own user-agent
    _httpSession.user_agent = _userAgent + " ";

    // Headers
    for (let key in headers) {
      _message.request_headers.append(key, headers[key]);
    }

    try {
      _httpSession.send_and_read_async(
        _message,
        GLib.PRIORITY_DEFAULT,
        null,
        (_httpSession, _message) => {
          try {
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

// Request today's token usage from the OpenAI API
// Make a GET request to https://api.openai.com/v1/usage?date=2022-12-31 where date is the current date
// Parse the response data to get the total number of tokens used for today. Only use ones that have "snapshot_id": "text-davinci:003"
async function getTodaysUsage(key) {
  try {
    const today = new Date();
    const date = `${today.getFullYear()}-${
      today.getMonth() + 1
    }-${today.getDate()}`;
    const url = `https://api.openai.com/v1/usage?date=${date}`;

    // Request headers
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    };

    const json = await loadJsonAsyncHeaders(url, null, headers, "GET");
    const data = json.data;

    let total = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i].snapshot_id === "text-davinci:003") {
        total += data[i].n_generated_tokens_total;
      }
    }

    return total;
  } catch (e) {
    logError(e);
    return 0;
  }
}
