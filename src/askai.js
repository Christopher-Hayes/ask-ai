const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Helpers = Me.imports.helpers;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const _ = Gettext.gettext;
const Main = imports.ui.main;

// Using var here because MODES is used in other files
// > Any symbols to be exported from a module must be defined with 'var'.
var MODES = {
  ASK: 0,
  SUMMARIZE: 1,
  EDIT: 2,
  WRITE: 3,
};

// Make AI request to OpenAI's GPT-3 API
async function makeAIRequest(prompt, key, mode) {
  const openaiUrl = "https://api.openai.com/v1/completions";

  switch (mode) {
    case MODES.SUMMARIZE:
      prompt = `Briefly summararize in a helpful way the following text:\n${prompt}`;
      break;
    case MODES.EDIT:
      prompt = `Correct grammar and spelling, as well as reword any confusing sentences in the following:\n${prompt}`;
      break;
    case MODES.WRITE:
      prompt = `Write about the following:\n${prompt}`;
      break;
  }

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
    const json = await Helpers.http(openaiUrl, headers, "POST", params);
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

    const json = await Helpers.http(url, {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      "GET");
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
