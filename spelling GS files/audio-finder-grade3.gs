/**
 * Grade 3 spelling - audio finder (Google Apps Script)
 * Dictionaries: Longman (US + UK), Oxford Learner's (US + UK), Merriam-Webster (US)
 *
 * Works standalone (script.google.com) or from a Sheet (Extensions > Apps Script).
 * Standalone: it creates a NEW sheet "Grade 3 spelling audio URLs" and prints its link in the
 * Execution log ("SHEET LINK: ...").
 *
 * Columns: A word | B Longman US | C Longman UK | D Oxford US | E Oxford UK |
 *          F Webster US | G status | H first week
 *
 * 374 unique words. Words that already appeared in earlier grades (Grades 1-2) are left out, and repeats inside the grade are listed once.
 * Audio URLs are READ from each dictionary page's HTML. Nothing is guessed.
 * It stops itself before Google's 6-minute limit: press Run again until the log
 * says "ALL DONE". Rows that already have a status are skipped.
 */

// [word, first week]. Spaces are allowed ("ice cream"); each site gets the right form.
const WORDS = [
  ["near", 1],
  ["hard", 1],
  ["else", 1],
  ["save", 1],
  ["tied", 1],
  ["base", 1],
  ["classroom", 2],
  ["welcome", 2],
  ["hallway", 2],
  ["knowledge", 2],
  ["grade", 2],
  ["school", 2],
  ["marker", 2],
  ["taught", 2],
  ["pencil", 2],
  ["action", 3],
  ["quotation", 3],
  ["author", 3],
  ["theme", 3],
  ["story", 3],
  ["verb", 3],
  ["paragraph", 3],
  ["question", 3],
  ["fiction", 3],
  ["noun", 3],
  ["smarter", 3],
  ["wrist", 4],
  ["blood", 4],
  ["wrinkle", 4],
  ["cheek", 4],
  ["shoulder", 4],
  ["mouth", 4],
  ["hair", 4],
  ["tooth", 4],
  ["teeth", 4],
  ["head", 4],
  ["bountiful", 5],
  ["migrate", 5],
  ["football", 5],
  ["collect", 5],
  ["dried", 5],
  ["autumn", 5],
  ["harvest", 5],
  ["leaves", 5],
  ["together", 5],
  ["warm", 5],
  ["cooking", 5],
  ["soup", 5],
  ["joyful", 6],
  ["elated", 6],
  ["annoyed", 6],
  ["worried", 6],
  ["frightened", 6],
  ["surprised", 6],
  ["ecstatic", 6],
  ["disappointed", 6],
  ["embarrassed", 6],
  ["shocked", 6],
  ["bored", 6],
  ["delighted", 6],
  ["shadow", 7],
  ["scared", 7],
  ["shook", 7],
  ["strangest", 7],
  ["shock", 7],
  ["crash", 7],
  ["disappear", 7],
  ["creaky", 7],
  ["spooky", 7],
  ["ancient", 7],
  ["cobweb", 7],
  ["gloomy", 7],
  ["lunar", 8],
  ["cycle", 8],
  ["quarter", 8],
  ["phase", 8],
  ["telescope", 8],
  ["planets", 8],
  ["orbit", 8],
  ["position", 8],
  ["solar", 8],
  ["elliptical", 8],
  ["gravity", 8],
  ["stars", 8],
  ["data", 9],
  ["measurement", 9],
  ["science", 9],
  ["conduct", 9],
  ["lightning", 9],
  ["volts", 9],
  ["current", 9],
  ["electric", 9],
  ["thermometer", 9],
  ["idea", 9],
  ["climate", 9],
  ["particle", 9],
  ["bought", 10],
  ["service", 10],
  ["buying", 10],
  ["price", 10],
  ["list", 10],
  ["choose", 10],
  ["picked", 10],
  ["account", 10],
  ["value", 10],
  ["buy", 10],
  ["consumer", 10],
  ["customer", 10],
  ["milk", 11],
  ["tomato", 11],
  ["potato", 11],
  ["citrus", 11],
  ["nutrients", 11],
  ["vitamins", 11],
  ["vegetable", 11],
  ["ginger", 11],
  ["apron", 11],
  ["sugar", 11],
  ["flour", 11],
  ["poured", 11],
  ["magnify", 12],
  ["jumped", 12],
  ["burned", 12],
  ["began", 12],
  ["showed", 12],
  ["review", 12],
  ["thump", 12],
  ["knotted", 12],
  ["belong", 13],
  ["family", 13],
  ["sibling", 13],
  ["parent", 13],
  ["raise", 13],
  ["children", 13],
  ["spouse", 13],
  ["grandparent", 13],
  ["relative", 13],
  ["child", 13],
  ["cousin", 13],
  ["mountains", 14],
  ["geography", 14],
  ["forest", 14],
  ["earth", 14],
  ["east", 14],
  ["navigate", 14],
  ["desert", 14],
  ["between", 14],
  ["highest", 14],
  ["south", 14],
  ["quiet", 15],
  ["winter", 15],
  ["arctic", 15],
  ["tundra", 15],
  ["skating", 15],
  ["snowball", 15],
  ["freeze", 15],
  ["bare", 15],
  ["boots", 15],
  ["until", 16],
  ["second", 16],
  ["morning", 16],
  ["sometimes", 16],
  ["season", 16],
  ["dawn", 16],
  ["next", 16],
  ["future", 16],
  ["suddenly", 16],
  ["beautiful", 17],
  ["vision", 17],
  ["reflect", 17],
  ["photograph", 17],
  ["portrait", 17],
  ["traditional", 17],
  ["contrast", 17],
  ["real", 17],
  ["person", 17],
  ["object", 17],
  ["national", 18],
  ["independence", 18],
  ["document", 18],
  ["majority", 18],
  ["country", 18],
  ["nation", 18],
  ["military", 18],
  ["establish", 18],
  ["speech", 18],
  ["war", 18],
  ["clerk", 18],
  ["history", 18],
  ["compare", 19],
  ["wider", 19],
  ["easy", 19],
  ["complex", 19],
  ["different", 19],
  ["thicker", 19],
  ["bigger", 19],
  ["better", 19],
  ["tallest", 19],
  ["richest", 19],
  ["poorer", 19],
  ["least", 19],
  ["cheerful", 20],
  ["icing", 20],
  ["party", 20],
  ["balloon", 20],
  ["best", 20],
  ["laughed", 20],
  ["hugged", 20],
  ["prepare", 20],
  ["candle", 20],
  ["present", 20],
  ["calculate", 21],
  ["product", 21],
  ["quotient", 21],
  ["multiplication", 21],
  ["division", 21],
  ["zero", 21],
  ["simplify", 21],
  ["decimal", 21],
  ["fraction", 21],
  ["numerator", 21],
  ["denominator", 21],
  ["graph", 21],
  ["stream", 22],
  ["delta", 22],
  ["bayou", 22],
  ["river", 22],
  ["diving", 22],
  ["ocean", 22],
  ["rainfall", 22],
  ["pond", 22],
  ["drought", 22],
  ["fountain", 22],
  ["wilt", 23],
  ["shovel", 23],
  ["worm", 23],
  ["weeds", 23],
  ["bushes", 23],
  ["stem", 23],
  ["bloom", 23],
  ["root", 23],
  ["dirt", 23],
  ["butterfly", 24],
  ["nectar", 24],
  ["garden", 24],
  ["market", 24],
  ["basket", 24],
  ["smell", 24],
  ["ground", 24],
  ["cloud", 24],
  ["plant", 24],
  ["burst", 24],
  ["airy", 24],
  ["climb", 25],
  ["bridge", 25],
  ["edge", 25],
  ["knit", 25],
  ["knob", 25],
  ["inches", 26],
  ["area", 26],
  ["formula", 26],
  ["width", 26],
  ["change", 26],
  ["repair", 26],
  ["custom", 26],
  ["iron", 26],
  ["broke", 26],
  ["pulled", 26],
  ["loose", 26],
  ["steel", 26],
  ["west", 27],
  ["cowboy", 27],
  ["lasso", 27],
  ["barter", 27],
  ["wagon", 27],
  ["buffalo", 27],
  ["plains", 27],
  ["badge", 27],
  ["trade", 27],
  ["settlers", 27],
  ["folklore", 27],
  ["formally", 28],
  ["rapidly", 28],
  ["dangerously", 28],
  ["tenderly", 28],
  ["lovely", 28],
  ["nicely", 28],
  ["joyfully", 28],
  ["thankfully", 28],
  ["helpfully", 28],
  ["painfully", 28],
  ["carefully", 28],
  ["personally", 28],
  ["balcony", 29],
  ["curtain", 29],
  ["audience", 29],
  ["orchestra", 29],
  ["singing", 29],
  ["appearance", 29],
  ["stage", 29],
  ["culture", 29],
  ["source", 29],
  ["material", 29],
  ["ruler", 30],
  ["upon", 30],
  ["fairy", 30],
  ["mirror", 30],
  ["crown", 30],
  ["happiest", 30],
  ["prettier", 30],
  ["dress", 30],
  ["castle", 30],
  ["shoes", 30],
  ["giraffe", 31],
  ["growl", 31],
  ["birds", 31],
  ["moose", 31],
  ["bear", 31],
  ["hare", 31],
  ["elephant", 31],
  ["habitat", 31],
  ["lion", 31],
  ["endangered", 31],
  ["laundry", 32],
  ["organize", 32],
  ["bookcase", 32],
  ["carpet", 32],
  ["floor", 32],
  ["table", 32],
  ["cellar", 32],
  ["stairs", 32],
  ["complete", 32],
  ["carry", 32],
  ["highway", 33],
  ["distance", 33],
  ["direction", 33],
  ["axle", 33],
  ["momentum", 33],
  ["wheel", 33],
  ["engine", 33],
  ["sign", 33],
  ["express", 33],
  ["sir", 34],
  ["miss", 34],
  ["stamp", 34],
  ["envelope", 34],
  ["address", 34],
  ["important", 34],
  ["copy", 34],
  ["seal", 34],
  ["deliver", 34],
  ["postage", 34],
  ["carrier", 34],
  ["swimming", 35],
  ["relaxation", 35],
  ["sunshine", 35],
  ["temperature", 35],
  ["outdoors", 35],
  ["hike", 35],
  ["hotter", 35],
  ["camp", 35],
  ["beach", 35],
  ["travel", 36],
  ["airplane", 36],
  ["motel", 36],
  ["cabin", 36],
  ["leave", 36],
  ["visit", 36],
  ["passport", 36],
  ["suitcase", 36],
  ["airport", 36],
  ["flight", 36],
  ["window", 36],
  ["relax", 36]
];

const SHEET_KEY = "G3_SHEET_ID";
const SHEET_TITLE = "Grade 3 spelling audio URLs";
const LONGMAN_BASE = "https://www.ldoceonline.com";
const OXFORD_BASE = "https://www.oxfordlearnersdictionaries.com";
const WEBSTER_BASE = "https://www.merriam-webster.com";
const WEBSTER_AUDIO = "https://media.merriam-webster.com/audio/prons/en/us/mp3/";
const MAX_RUN_MS = 5 * 60 * 1000;

function getSheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active.getSheets()[0];

  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(SHEET_KEY);
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId).getSheets()[0];
    } catch (e) { /* deleted: make a new one */ }
  }
  const ss = SpreadsheetApp.create(SHEET_TITLE);
  props.setProperty(SHEET_KEY, ss.getId());
  const sheet = ss.getSheets()[0];
  sheet.getRange(1, 1, 1, 8).setValues([[
    "word", "Longman US", "Longman UK", "Oxford US", "Oxford UK",
    "Webster US", "status", "first week",
  ]]);
  sheet.getRange(2, 1, WORDS.length, 1).setValues(WORDS.map((w) => [w[0]]));
  sheet.getRange(2, 8, WORDS.length, 1).setValues(WORDS.map((w) => [w[1]]));
  console.log("SHEET LINK: " + ss.getUrl());
  return sheet;
}

function pageUrls_(word) {
  const dash = word.replace(/\s+/g, "-");
  return {
    longman: LONGMAN_BASE + "/dictionary/" + encodeURIComponent(dash),
    oxford: OXFORD_BASE + "/definition/english/" + encodeURIComponent(dash) +
            "?q=" + encodeURIComponent(dash),
    webster: WEBSTER_BASE + "/dictionary/" + encodeURIComponent(word),
  };
}

function absolute_(url, base) {
  if (url.indexOf("//") === 0) return "https:" + url;
  return url.indexOf("/") === 0 ? base + url : url;
}

// Longman: class "amefile" = US, "brefile" = UK. First of each = the headword.
function longmanAudio_(html) {
  const tags = html.match(/<[a-z]+[^>]*data-src-mp3="[^"]+"[^>]*>/g) || [];
  let us = "", uk = "";
  for (const tag of tags) {
    const url = absolute_(tag.match(/data-src-mp3="([^"]+)"/)[1], LONGMAN_BASE);
    if (!us && /\bamefile\b/.test(tag)) us = url;
    if (!uk && /\bbrefile\b/.test(tag)) uk = url;
    if (us && uk) break;
  }
  return { us: us, uk: uk };
}

// Oxford: class "pron-us" = US, "pron-uk" = UK. First of each = the headword.
function oxfordAudio_(html) {
  const tags = html.match(/<[a-z]+[^>]*data-src-mp3="[^"]+"[^>]*>/g) || [];
  let us = "", uk = "";
  for (const tag of tags) {
    const url = absolute_(tag.match(/data-src-mp3="([^"]+)"/)[1], OXFORD_BASE);
    if (!us && /pron-us/.test(tag)) us = url;
    if (!uk && /pron-uk/.test(tag)) uk = url;
    if (us && uk) break;
  }
  return { us: us, uk: uk };
}

// Merriam-Webster (US only). The page stores the audio as a folder (data-dir) and
// a file name (data-file); the full link is assembled from those two values.
// Tries three ways, all reading the page itself:
//  1) a tag with data-file + data-dir (+ data-lang en_us)
//  2) a pronunciation link with ...dir=X&file=Y in its href
//  3) a ready-made media.merriam-webster.com .../en/us/mp3/... link anywhere in the HTML
function websterAudio_(html) {
  const tags = html.match(/<[a-z]+[^>]*data-file="[^"]+"[^>]*>/g) || [];
  for (const tag of tags) {
    const file = (tag.match(/data-file="([^"]+)"/) || [])[1];
    const dir = (tag.match(/data-dir="([^"]+)"/) || [])[1];
    const lang = (tag.match(/data-lang="([^"]+)"/) || [])[1] || "en_us";
    if (file && dir && /en_us/.test(lang)) return WEBSTER_AUDIO + dir + "/" + file + ".mp3";
  }
  const href = html.match(/[?&;]dir=([^&"'\s]+)(?:&amp;|&)file=([^&"'\s]+)/) ||
               html.match(/[?&;]file=([^&"'\s]+)(?:&amp;|&)dir=([^&"'\s]+)/);
  if (href) {
    const isDirFirst = /dir=[^&]+(?:&amp;|&)file=/.test(href[0]);
    const dir = isDirFirst ? href[1] : href[2];
    const file = isDirFirst ? href[2] : href[1];
    return WEBSTER_AUDIO + dir + "/" + file + ".mp3";
  }
  const direct = html.match(/https?:\/\/media\.merriam-webster\.com\/audio\/prons\/en\/us\/mp3\/[^"'\s<>]+\.mp3/);
  return direct ? direct[0] : "";
}

function fetchAll_(urls) {
  const reqs = urls.map((u) => ({
    url: u, muteHttpExceptions: true, followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0" },
  }));
  try {
    return UrlFetchApp.fetchAll(reqs).map((r) => {
      const code = r.getResponseCode();
      return code === 200 ? { html: r.getContentText(), note: "" }
                          : { html: "", note: "page " + code };
    });
  } catch (e) {
    return urls.map(() => ({ html: "", note: "error" }));
  }
}

function findAudio() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const start = Date.now();

  for (let row = 2; row <= last; row++) {
    if (Date.now() - start > MAX_RUN_MS) {
      console.log("Time limit reached. Press Run again to continue.");
      return;
    }
    const word = String(sheet.getRange(row, 1).getValue()).trim().toLowerCase();
    const status = sheet.getRange(row, 7).getValue();
    if (!word || status) continue;

    const u = pageUrls_(word);
    const res = fetchAll_([u.longman, u.oxford, u.webster]);
    const lm = res[0], ox = res[1], wb = res[2];

    const l = lm.html ? longmanAudio_(lm.html) : { us: "", uk: "" };
    const o = ox.html ? oxfordAudio_(ox.html) : { us: "", uk: "" };
    const w = wb.html ? websterAudio_(wb.html) : "";

    const notes = [];
    if (lm.note) notes.push("Longman " + lm.note);
    else if (!l.us && !l.uk) notes.push("Longman no audio");
    if (ox.note) notes.push("Oxford " + ox.note);
    else if (!o.us && !o.uk) notes.push("Oxford no audio");
    if (wb.note) notes.push("Webster " + wb.note);
    else if (!w) notes.push("Webster no audio");

    sheet.getRange(row, 2, 1, 6).setValues([
      [l.us, l.uk, o.us, o.uk, w, notes.length ? notes.join("; ") : "ok"],
    ]);
    SpreadsheetApp.flush();
    Utilities.sleep(400);
  }
  console.log("ALL DONE. Sheet: " + sheet.getParent().getUrl());
}
