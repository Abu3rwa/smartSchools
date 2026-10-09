/**
 * KG spelling - audio finder (Google Apps Script)
 * Dictionaries: Longman (US + UK), Oxford Learner's (US + UK), Merriam-Webster (US)
 *
 * Works standalone (script.google.com) or from a Sheet (Extensions > Apps Script).
 * Standalone: it creates a NEW sheet "KG spelling audio URLs" and prints its link in the
 * Execution log ("SHEET LINK: ...").
 *
 * Columns: A word | B Longman US | C Longman UK | D Oxford US | E Oxford UK |
 *          F Webster US | G status | H first week
 *
 * 328 unique words. (400 word slots; repeated words are listed once, under the first week.)
 * Audio URLs are READ from each dictionary page's HTML. Nothing is guessed.
 * It stops itself before Google's 6-minute limit: press Run again until the log
 * says "ALL DONE". Rows that already have a status are skipped.
 */

// [word, first week]. Spaces are allowed ("ice cream"); each site gets the right form.
const WORDS = [
  ["cow", 1],
  ["pig", 1],
  ["sheep", 1],
  ["horse", 1],
  ["duck", 1],
  ["goat", 1],
  ["hen", 1],
  ["dog", 1],
  ["cat", 1],
  ["barn", 1],
  ["lion", 2],
  ["tiger", 2],
  ["bear", 2],
  ["monkey", 2],
  ["zebra", 2],
  ["panda", 2],
  ["giraffe", 2],
  ["snake", 2],
  ["bird", 2],
  ["cage", 2],
  ["deer", 3],
  ["fox", 3],
  ["wolf", 3],
  ["owl", 3],
  ["squirrel", 3],
  ["rabbit", 3],
  ["badger", 3],
  ["beaver", 3],
  ["mouse", 3],
  ["tree", 3],
  ["ant", 4],
  ["bee", 4],
  ["fly", 4],
  ["bug", 4],
  ["worm", 4],
  ["spider", 4],
  ["moth", 4],
  ["ladybug", 4],
  ["grass", 4],
  ["wing", 4],
  ["fish", 5],
  ["ham", 5],
  ["pet", 5],
  ["food", 5],
  ["leash", 5],
  ["bowl", 5],
  ["bark", 5],
  ["ball", 6],
  ["run", 6],
  ["kick", 6],
  ["throw", 6],
  ["hit", 6],
  ["jump", 6],
  ["game", 6],
  ["team", 6],
  ["play", 6],
  ["sport", 6],
  ["sing", 7],
  ["music", 7],
  ["song", 7],
  ["drum", 7],
  ["tune", 7],
  ["note", 7],
  ["loud", 7],
  ["soft", 7],
  ["fun", 7],
  ["dinosaur", 8],
  ["egg", 8],
  ["rex", 8],
  ["big", 8],
  ["long", 8],
  ["teeth", 8],
  ["roar", 8],
  ["land", 8],
  ["stomp", 8],
  ["bone", 8],
  ["pencil", 9],
  ["cup", 9],
  ["house", 9],
  ["car", 9],
  ["book", 9],
  ["chair", 9],
  ["table", 9],
  ["door", 9],
  ["window", 9],
  ["read", 10],
  ["swim", 10],
  ["hop", 10],
  ["skip", 10],
  ["dance", 10],
  ["walk", 10],
  ["sit", 10],
  ["stand", 10],
  ["in", 11],
  ["out", 11],
  ["on", 11],
  ["off", 11],
  ["up", 11],
  ["down", 11],
  ["over", 11],
  ["under", 11],
  ["near", 11],
  ["far", 11],
  ["a", 12],
  ["an", 12],
  ["the", 12],
  ["and", 12],
  ["but", 12],
  ["or", 12],
  ["so", 12],
  ["yet", 12],
  ["if", 12],
  ["when", 12],
  ["apple", 13],
  ["banana", 13],
  ["grape", 13],
  ["orange", 13],
  ["berry", 13],
  ["pear", 13],
  ["plum", 13],
  ["kiwi", 13],
  ["sweet", 13],
  ["juicy", 13],
  ["carrot", 14],
  ["corn", 14],
  ["pea", 14],
  ["bean", 14],
  ["potato", 14],
  ["tomato", 14],
  ["green", 14],
  ["grow", 14],
  ["eat", 14],
  ["farm", 14],
  ["water", 15],
  ["milk", 15],
  ["glass", 15],
  ["tea", 15],
  ["cold", 15],
  ["thirst", 15],
  ["drink", 15],
  ["pour", 15],
  ["sip", 15],
  ["meat", 16],
  ["rice", 16],
  ["pot", 16],
  ["spoon", 16],
  ["dish", 16],
  ["warm", 16],
  ["home", 16],
  ["good", 16],
  ["fork", 16],
  ["listen", 17],
  ["share", 17],
  ["help", 17],
  ["kind", 17],
  ["nice", 17],
  ["quiet", 17],
  ["raise", 17],
  ["hand", 17],
  ["wait", 17],
  ["one", 18],
  ["two", 18],
  ["three", 18],
  ["four", 18],
  ["five", 18],
  ["six", 18],
  ["seven", 18],
  ["eight", 18],
  ["nine", 18],
  ["ten", 18],
  ["circle", 19],
  ["square", 19],
  ["triangle", 19],
  ["star", 19],
  ["heart", 19],
  ["oval", 19],
  ["rectangle", 19],
  ["cone", 19],
  ["cube", 19],
  ["shape", 19],
  ["write", 20],
  ["count", 20],
  ["draw", 20],
  ["learn", 20],
  ["ask", 20],
  ["think", 20],
  ["smart", 20],
  ["mom", 21],
  ["dad", 21],
  ["sister", 21],
  ["brother", 21],
  ["grandma", 21],
  ["grandpa", 21],
  ["aunt", 21],
  ["uncle", 21],
  ["baby", 21],
  ["cousin", 21],
  ["bed", 22],
  ["lamp", 22],
  ["rug", 22],
  ["tv", 22],
  ["sofa", 22],
  ["clock", 22],
  ["shelf", 22],
  ["toy", 22],
  ["head", 23],
  ["arm", 23],
  ["leg", 23],
  ["foot", 23],
  ["eye", 23],
  ["ear", 23],
  ["nose", 23],
  ["mouth", 23],
  ["hair", 23],
  ["bedroom", 24],
  ["room", 24],
  ["bath", 24],
  ["kitchen", 24],
  ["living room", 24],
  ["hall", 24],
  ["wall", 24],
  ["happy", 25],
  ["sad", 25],
  ["mad", 25],
  ["glad", 25],
  ["scared", 25],
  ["love", 25],
  ["calm", 25],
  ["shy", 25],
  ["brave", 25],
  ["tired", 25],
  ["shirt", 26],
  ["pants", 26],
  ["socks", 26],
  ["shoes", 26],
  ["hat", 26],
  ["coat", 26],
  ["dress", 26],
  ["shorts", 26],
  ["gloves", 26],
  ["wear", 26],
  ["clean", 27],
  ["sweep", 27],
  ["dust", 27],
  ["tidy", 27],
  ["make", 27],
  ["wash", 27],
  ["put", 27],
  ["doll", 28],
  ["block", 28],
  ["train", 28],
  ["teddy", 28],
  ["plant", 29],
  ["flower", 29],
  ["leaf", 29],
  ["root", 29],
  ["stem", 29],
  ["soil", 29],
  ["tall", 29],
  ["seed", 29],
  ["beach", 30],
  ["sand", 30],
  ["sun", 30],
  ["wave", 30],
  ["shell", 30],
  ["boat", 30],
  ["hot", 30],
  ["store", 31],
  ["school", 31],
  ["park", 31],
  ["road", 31],
  ["hospital", 31],
  ["bank", 31],
  ["library", 31],
  ["market", 31],
  ["town", 31],
  ["win", 32],
  ["lose", 32],
  ["turn", 32],
  ["rule", 32],
  ["board", 32],
  ["card", 32],
  ["dice", 32],
  ["spring", 33],
  ["rain", 33],
  ["bud", 33],
  ["new", 33],
  ["bloom", 33],
  ["summer", 34],
  ["ice cream", 34],
  ["ocean", 34],
  ["fall", 35],
  ["red", 35],
  ["brown", 35],
  ["pump", 35],
  ["acorn", 35],
  ["wind", 35],
  ["cool", 35],
  ["snow", 36],
  ["sled", 36],
  ["boots", 36],
  ["ice", 36],
  ["bus", 37],
  ["bike", 37],
  ["wheel", 37],
  ["fast", 37],
  ["slow", 37],
  ["cloud", 38],
  ["storm", 38],
  ["wet", 38],
  ["paper", 39],
  ["glue", 39],
  ["pen", 39],
  ["crayon", 39],
  ["ruler", 39],
  ["eraser", 39],
  ["bag", 39],
  ["box", 39],
  ["doctor", 40],
  ["firefighter", 40],
  ["florist", 40],
  ["vet", 40],
  ["nurse", 40],
  ["chef", 40],
  ["teacher", 40],
  ["baker", 40],
  ["waitress", 40],
  ["waiter", 40]
];

const SHEET_KEY = "KG_SHEET_ID";
const SHEET_TITLE = "KG spelling audio URLs";
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
