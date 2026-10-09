/**
 * Grade 1 spelling - audio finder (Google Apps Script)
 * Dictionaries: Longman (US + UK), Oxford Learner's (US + UK), Merriam-Webster (US)
 *
 * Works standalone (script.google.com) or from a Sheet (Extensions > Apps Script).
 * Standalone: it creates a NEW sheet "Grade 1 spelling audio URLs" and prints its link in the
 * Execution log ("SHEET LINK: ...").
 *
 * Columns: A word | B Longman US | C Longman UK | D Oxford US | E Oxford UK |
 *          F Webster US | G status | H first week
 *
 * 363 unique words. Repeats inside the grade are listed once, under the first week.
 * Audio URLs are READ from each dictionary page's HTML. Nothing is guessed.
 * It stops itself before Google's 6-minute limit: press Run again until the log
 * says "ALL DONE". Rows that already have a status are skipped.
 */

// [word, first week]. Spaces are allowed ("ice cream"); each site gets the right form.
const WORDS = [
  ["cat", 1],
  ["fan", 1],
  ["map", 1],
  ["dad", 1],
  ["bag", 1],
  ["cab", 1],
  ["man", 1],
  ["sad", 1],
  ["nap", 1],
  ["can", 1],
  ["hat", 1],
  ["rag", 1],
  ["hen", 2],
  ["jet", 2],
  ["net", 2],
  ["bed", 2],
  ["web", 2],
  ["ten", 2],
  ["red", 2],
  ["pet", 2],
  ["vet", 2],
  ["peg", 2],
  ["leg", 2],
  ["fed", 2],
  ["pig", 3],
  ["sit", 3],
  ["win", 3],
  ["lip", 3],
  ["fin", 3],
  ["dip", 3],
  ["pin", 3],
  ["big", 3],
  ["wig", 3],
  ["him", 3],
  ["rib", 3],
  ["kit", 3],
  ["dog", 4],
  ["hot", 4],
  ["log", 4],
  ["mop", 4],
  ["top", 4],
  ["fox", 4],
  ["pot", 4],
  ["dot", 4],
  ["box", 4],
  ["mom", 4],
  ["pop", 4],
  ["cot", 4],
  ["sun", 5],
  ["run", 5],
  ["cup", 5],
  ["bug", 5],
  ["nut", 5],
  ["mug", 5],
  ["hut", 5],
  ["tub", 5],
  ["gum", 5],
  ["bus", 5],
  ["cut", 5],
  ["fun", 5],
  ["the", 6],
  ["a", 6],
  ["i", 6],
  ["is", 6],
  ["in", 6],
  ["and", 6],
  ["my", 6],
  ["me", 6],
  ["see", 6],
  ["like", 6],
  ["am", 6],
  ["we", 6],
  ["clap", 7],
  ["flip", 7],
  ["slip", 7],
  ["flat", 7],
  ["glass", 7],
  ["play", 7],
  ["blue", 7],
  ["black", 7],
  ["flame", 7],
  ["plate", 7],
  ["glove", 7],
  ["slug", 7],
  ["frog", 8],
  ["crab", 8],
  ["trap", 8],
  ["drum", 8],
  ["trip", 8],
  ["train", 8],
  ["brick", 8],
  ["grab", 8],
  ["print", 8],
  ["drink", 8],
  ["crawfish", 8],
  ["truck", 8],
  ["ship", 9],
  ["shop", 9],
  ["shell", 9],
  ["she", 9],
  ["dish", 9],
  ["fish", 9],
  ["cash", 9],
  ["wish", 9],
  ["shine", 9],
  ["shark", 9],
  ["sharp", 9],
  ["trash", 9],
  ["chip", 10],
  ["chop", 10],
  ["chin", 10],
  ["much", 10],
  ["rich", 10],
  ["check", 10],
  ["lunch", 10],
  ["chair", 10],
  ["chew", 10],
  ["chat", 10],
  ["chick", 10],
  ["cheese", 10],
  ["that", 11],
  ["this", 11],
  ["then", 11],
  ["them", 11],
  ["with", 11],
  ["bath", 11],
  ["math", 11],
  ["path", 11],
  ["three", 11],
  ["thick", 11],
  ["think", 11],
  ["go", 12],
  ["to", 12],
  ["no", 12],
  ["so", 12],
  ["of", 12],
  ["on", 12],
  ["for", 12],
  ["he", 12],
  ["was", 12],
  ["were", 12],
  ["by", 12],
  ["cake", 13],
  ["game", 13],
  ["make", 13],
  ["name", 13],
  ["take", 13],
  ["came", 13],
  ["late", 13],
  ["rake", 13],
  ["wave", 13],
  ["safe", 13],
  ["cape", 13],
  ["face", 13],
  ["bike", 14],
  ["five", 14],
  ["time", 14],
  ["line", 14],
  ["hide", 14],
  ["nine", 14],
  ["ride", 14],
  ["pine", 14],
  ["white", 14],
  ["kite", 14],
  ["home", 15],
  ["bone", 15],
  ["hole", 15],
  ["nose", 15],
  ["note", 15],
  ["hope", 15],
  ["rope", 15],
  ["vote", 15],
  ["stone", 15],
  ["joke", 15],
  ["rode", 15],
  ["globe", 15],
  ["cute", 16],
  ["flute", 16],
  ["mule", 16],
  ["rule", 16],
  ["tube", 16],
  ["use", 16],
  ["huge", 16],
  ["fuse", 16],
  ["june", 16],
  ["cube", 16],
  ["prune", 16],
  ["dune", 16],
  ["rain", 17],
  ["mail", 17],
  ["nail", 17],
  ["wait", 17],
  ["say", 17],
  ["day", 17],
  ["way", 17],
  ["may", 17],
  ["tray", 17],
  ["bay", 17],
  ["pay", 17],
  ["feet", 18],
  ["meet", 18],
  ["green", 18],
  ["eat", 18],
  ["sea", 18],
  ["read", 18],
  ["tea", 18],
  ["team", 18],
  ["dream", 18],
  ["sleep", 18],
  ["clean", 18],
  ["light", 19],
  ["right", 19],
  ["night", 19],
  ["high", 19],
  ["might", 19],
  ["fight", 19],
  ["sigh", 19],
  ["bright", 19],
  ["tight", 19],
  ["thigh", 19],
  ["slight", 19],
  ["fright", 19],
  ["boat", 20],
  ["road", 20],
  ["soap", 20],
  ["toad", 20],
  ["coat", 20],
  ["show", 20],
  ["snow", 20],
  ["row", 20],
  ["low", 20],
  ["grow", 20],
  ["float", 20],
  ["glow", 20],
  ["car", 22],
  ["star", 22],
  ["far", 22],
  ["jar", 22],
  ["park", 22],
  ["farm", 22],
  ["art", 22],
  ["card", 22],
  ["march", 22],
  ["dark", 22],
  ["yarn", 22],
  ["part", 22],
  ["or", 23],
  ["fork", 23],
  ["corn", 23],
  ["horn", 23],
  ["short", 23],
  ["sport", 23],
  ["north", 23],
  ["storm", 23],
  ["born", 23],
  ["horse", 23],
  ["cord", 23],
  ["you", 24],
  ["your", 24],
  ["they", 24],
  ["are", 24],
  ["from", 24],
  ["come", 24],
  ["said", 24],
  ["what", 24],
  ["where", 24],
  ["when", 24],
  ["who", 24],
  ["snack", 25],
  ["snap", 25],
  ["snail", 25],
  ["snore", 25],
  ["swim", 25],
  ["sweep", 25],
  ["sweet", 25],
  ["swamp", 25],
  ["swing", 25],
  ["swan", 25],
  ["swab", 25],
  ["sandbox", 26],
  ["sunlight", 26],
  ["cupcake", 26],
  ["notebook", 26],
  ["backpack", 26],
  ["snowman", 26],
  ["inside", 26],
  ["outside", 26],
  ["rainbow", 26],
  ["fishbowl", 26],
  ["baseball", 26],
  ["weekend", 26],
  ["down", 27],
  ["up", 27],
  ["about", 27],
  ["into", 27],
  ["look", 27],
  ["two", 27],
  ["four", 27],
  ["duck", 28],
  ["sock", 28],
  ["lock", 28],
  ["sick", 28],
  ["block", 28],
  ["clock", 28],
  ["back", 28],
  ["pick", 28],
  ["kick", 28],
  ["rock", 28],
  ["hand", 29],
  ["sand", 29],
  ["band", 29],
  ["went", 29],
  ["sent", 29],
  ["dent", 29],
  ["tank", 29],
  ["bank", 29],
  ["pink", 29],
  ["junk", 29],
  ["stop", 30],
  ["step", 30],
  ["stick", 30],
  ["spin", 30],
  ["spot", 30],
  ["spoon", 30],
  ["speak", 30],
  ["spill", 30],
  ["stand", 30],
  ["state", 30],
  ["great", 31],
  ["eight", 31],
  ["weigh", 31],
  ["grey", 31],
  ["stay", 31],
  ["away", 31],
  ["maybe", 31],
  ["slow", 32],
  ["know", 32],
  ["toe", 32],
  ["hoe", 32],
  ["yellow", 32],
  ["pillow", 32],
  ["tie", 33],
  ["pie", 33],
  ["lie", 33],
  ["fly", 33],
  ["try", 33],
  ["why", 33],
  ["tree", 34],
  ["bee", 34],
  ["keep", 34],
  ["deep", 34],
  ["street", 34],
  ["puppy", 35],
  ["sunny", 35],
  ["funny", 35],
  ["rabbit", 35],
  ["butter", 35],
  ["kitten", 35],
  ["happy", 35],
  ["messy", 35],
  ["little", 35],
  ["bubble", 35],
  ["apple", 35]
];

const SHEET_KEY = "G1_SHEET_ID";
const SHEET_TITLE = "Grade 1 spelling audio URLs";
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
