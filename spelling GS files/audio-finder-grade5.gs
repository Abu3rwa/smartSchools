/**
 * Grade 5 spelling - audio finder (Google Apps Script)
 * Dictionaries: Longman (US + UK), Oxford Learner's (US + UK), Merriam-Webster (US)
 *
 * Works standalone (script.google.com) or from a Sheet (Extensions > Apps Script).
 * Standalone: it creates a NEW sheet "Grade 5 spelling audio URLs" and prints its link in the
 * Execution log ("SHEET LINK: ...").
 *
 * Columns: A word | B Longman US | C Longman UK | D Oxford US | E Oxford UK |
 *          F Webster US | G status | H first week
 *
 * 303 unique words. Words that already appeared in earlier grades (Grades 1-4) are left out, and repeats inside the grade are listed once.
 * Audio URLs are READ from each dictionary page's HTML. Nothing is guessed.
 * It stops itself before Google's 6-minute limit: press Run again until the log
 * says "ALL DONE". Rows that already have a status are skipped.
 */

// [word, first week]. Spaces are allowed ("ice cream"); each site gets the right form.
const WORDS = [
  ["telephone", 1],
  ["teleport", 1],
  ["photosynthesis", 1],
  ["autograph", 1],
  ["telegraph", 1],
  ["graphics", 1],
  ["telepathy", 1],
  ["telethon", 1],
  ["micrograph", 1],
  ["unlikely", 2],
  ["unravel", 2],
  ["reconsider", 2],
  ["prehistoric", 2],
  ["prepay", 2],
  ["misspell", 2],
  ["mistake", 2],
  ["recharge", 2],
  ["precaution", 2],
  ["misunderstanding", 2],
  ["comfortable", 3],
  ["visible", 3],
  ["edible", 3],
  ["washable", 3],
  ["solution", 3],
  ["protection", 3],
  ["mission", 3],
  ["responsible", 3],
  ["flexible", 3],
  ["creation", 3],
  ["addition", 3],
  ["portable", 3],
  ["transport", 4],
  ["export", 4],
  ["dictate", 4],
  ["predict", 4],
  ["contradict", 4],
  ["auditorium", 4],
  ["audible", 4],
  ["reporter", 4],
  ["import", 4],
  ["dictator", 4],
  ["design", 5],
  ["column", 5],
  ["foreign", 5],
  ["listen", 5],
  ["subtle", 5],
  ["doubt", 5],
  ["scenery", 5],
  ["analyze", 6],
  ["sequence", 6],
  ["summarize", 6],
  ["evidence", 6],
  ["evaluate", 6],
  ["describe", 6],
  ["explain", 6],
  ["persuade", 6],
  ["allowed", 7],
  ["aloud", 7],
  ["altar", 7],
  ["alter", 7],
  ["council", 7],
  ["counsel", 7],
  ["dessert", 7],
  ["principal", 7],
  ["principle", 7],
  ["stationery", 7],
  ["stationary", 7],
  ["weather", 7],
  ["whether", 7],
  ["patience", 7],
  ["patients", 7],
  ["construct", 8],
  ["instruction", 8],
  ["structure", 8],
  ["televise", 8],
  ["inject", 8],
  ["reject", 8],
  ["projector", 8],
  ["supervise", 8],
  ["rejection", 8],
  ["reign", 9],
  ["freight", 9],
  ["vein", 9],
  ["gauge", 9],
  ["survey", 9],
  ["convey", 9],
  ["obey", 9],
  ["grief", 10],
  ["thief", 10],
  ["ceiling", 10],
  ["deceive", 10],
  ["achieve", 10],
  ["brief", 10],
  ["shield", 10],
  ["location", 11],
  ["imagination", 11],
  ["celebration", 11],
  ["information", 11],
  ["education", 11],
  ["operation", 11],
  ["collection", 11],
  ["attraction", 11],
  ["completion", 11],
  ["courage", 12],
  ["honesty", 12],
  ["kindness", 12],
  ["freedom", 12],
  ["justice", 12],
  ["happiness", 12],
  ["sadness", 12],
  ["bravery", 12],
  ["intelligence", 12],
  ["curiosity", 12],
  ["determination", 12],
  ["biology", 13],
  ["autobiography", 13],
  ["geology", 13],
  ["geometry", 13],
  ["diameter", 13],
  ["perimeter", 13],
  ["kilometer", 13],
  ["barometer", 13],
  ["centimeter", 13],
  ["government", 14],
  ["development", 14],
  ["movement", 14],
  ["entertainment", 14],
  ["excitement", 14],
  ["interpret", 15],
  ["demonstrate", 15],
  ["identify", 15],
  ["infer", 15],
  ["paraphrase", 15],
  ["affect", 16],
  ["effect", 16],
  ["accept", 16],
  ["except", 16],
  ["lose", 16],
  ["than", 16],
  ["its", 16],
  ["scribble", 17],
  ["scripture", 17],
  ["inspect", 17],
  ["spectator", 17],
  ["spectacle", 17],
  ["prospect", 17],
  ["transcribe", 17],
  ["subscribe", 17],
  ["delicious", 18],
  ["curious", 18],
  ["enormous", 18],
  ["furious", 18],
  ["mysterious", 18],
  ["gorgeous", 18],
  ["tremendous", 18],
  ["courageous", 18],
  ["glamorous", 18],
  ["spacious", 18],
  ["ambitious", 18],
  ["victorious", 18],
  ["practice", 19],
  ["office", 19],
  ["damage", 19],
  ["village", 19],
  ["release", 19],
  ["promise", 19],
  ["response", 19],
  ["license", 19],
  ["outrageous", 20],
  ["boundary", 20],
  ["doubtful", 20],
  ["coward", 20],
  ["allowance", 20],
  ["power", 20],
  ["frown", 20],
  ["however", 20],
  ["pout", 20],
  ["chronology", 21],
  ["chronic", 21],
  ["synchronize", 21],
  ["logic", 21],
  ["apology", 21],
  ["dialogue", 21],
  ["monarch", 21],
  ["archaeology", 21],
  ["anarchy", 21],
  ["logarithm", 21],
  ["chronicle", 21],
  ["archives", 21],
  ["impossible", 22],
  ["impatient", 22],
  ["incorrect", 22],
  ["inactive", 22],
  ["illegal", 22],
  ["illegible", 22],
  ["irregular", 22],
  ["irresponsible", 22],
  ["immature", 22],
  ["innocent", 22],
  ["illiterate", 22],
  ["irresistible", 22],
  ["famous", 23],
  ["poisonous", 23],
  ["dangerous", 23],
  ["mountainous", 23],
  ["glorious", 23],
  ["humorous", 23],
  ["fabulous", 23],
  ["creativity", 24],
  ["ambition", 24],
  ["enthusiasm", 24],
  ["satisfaction", 24],
  ["concentration", 24],
  ["frustration", 24],
  ["characterize", 25],
  ["formulate", 25],
  ["illustrate", 25],
  ["investigate", 25],
  ["justify", 25],
  ["thorough", 26],
  ["rough", 26],
  ["tough", 26],
  ["enough", 26],
  ["dough", 26],
  ["brought", 26],
  ["thought", 26],
  ["sought", 26],
  ["cough", 26],
  ["minuscule", 27],
  ["minute", 27],
  ["minimal", 27],
  ["finish", 27],
  ["final", 27],
  ["define", 27],
  ["manual", 27],
  ["manuscript", 27],
  ["manufacture", 27],
  ["manage", 27],
  ["feminine", 27],
  ["dominate", 27],
  ["conscience", 28],
  ["conscious", 28],
  ["complement", 28],
  ["compliment", 28],
  ["discreet", 28],
  ["discrete", 28],
  ["elicit", 28],
  ["illicit", 28],
  ["eminent", 28],
  ["imminent", 28],
  ["hydroplane", 29],
  ["hydrant", 29],
  ["hydrophobia", 29],
  ["phonics", 29],
  ["symphony", 29],
  ["thermal", 29],
  ["thermos", 29],
  ["microphone", 29],
  ["megaphone", 29],
  ["hydroponics", 29],
  ["molecule", 30],
  ["organism", 30],
  ["atmosphere", 30],
  ["ecosystem", 30],
  ["submerge", 31],
  ["subtraction", 31],
  ["transfer", 31],
  ["translate", 31],
  ["cooperate", 31],
  ["coauthor", 31],
  ["coexist", 31],
  ["subway", 31],
  ["transform", 31],
  ["co-pilot", 31],
  ["necessary", 32],
  ["accommodate", 32],
  ["aggressive", 32],
  ["anniversary", 32],
  ["embarrass", 32],
  ["possess", 32],
  ["successful", 32],
  ["committee", 32],
  ["opportunity", 32],
  ["especially", 32],
  ["occasionally", 32],
  ["electricity", 33],
  ["publicity", 33],
  ["activity", 33],
  ["variety", 33],
  ["safety", 33],
  ["anxiety", 33],
  ["heroic", 33],
  ["artistic", 33],
  ["historic", 33],
  ["scientific", 33],
  ["community", 33],
  ["responsibility", 33],
  ["invisible", 34],
  ["democracy", 34],
  ["separate", 36],
  ["schedule", 36],
  ["exercise", 36],
  ["business", 36]
];

const SHEET_KEY = "G5_SHEET_ID";
const SHEET_TITLE = "Grade 5 spelling audio URLs";
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
