/**
 * Grade 2 spelling - audio finder (Google Apps Script)
 * Dictionaries: Longman (US + UK), Oxford Learner's (US + UK), Merriam-Webster (US)
 *
 * Works standalone (script.google.com) or from a Sheet (Extensions > Apps Script).
 * Standalone: it creates a NEW sheet "Grade 2 spelling audio URLs" and prints its link in the
 * Execution log ("SHEET LINK: ...").
 *
 * Columns: A word | B Longman US | C Longman UK | D Oxford US | E Oxford UK |
 *          F Webster US | G status | H first week
 *
 * 243 unique words. Words that already appeared in earlier grades (Grades 1-1) are left out, and repeats inside the grade are listed once.
 * Audio URLs are READ from each dictionary page's HTML. Nothing is guessed.
 * It stops itself before Google's 6-minute limit: press Run again until the log
 * says "ALL DONE". Rows that already have a status are skipped.
 */

// [word, first week]. Spaces are allowed ("ice cream"); each site gets the right form.
const WORDS = [
  ["tail", 1],
  ["pain", 1],
  ["paint", 1],
  ["chain", 1],
  ["brain", 1],
  ["leaf", 2],
  ["field", 2],
  ["piece", 2],
  ["chief", 2],
  ["sky", 3],
  ["cried", 3],
  ["tomorrow", 4],
  ["glue", 5],
  ["true", 5],
  ["due", 5],
  ["fruit", 5],
  ["suit", 5],
  ["juice", 5],
  ["cruise", 5],
  ["clue", 5],
  ["tuesday", 5],
  ["rescue", 5],
  ["her", 6],
  ["germ", 6],
  ["first", 6],
  ["girl", 6],
  ["shirt", 6],
  ["bird", 6],
  ["hurt", 6],
  ["burn", 6],
  ["turn", 6],
  ["nurse", 6],
  ["stir", 6],
  ["dirty", 6],
  ["yard", 7],
  ["arm", 7],
  ["bake", 8],
  ["lake", 8],
  ["which", 9],
  ["thank", 9],
  ["thing", 9],
  ["cent", 11],
  ["city", 11],
  ["race", 11],
  ["gem", 11],
  ["page", 11],
  ["giant", 11],
  ["fence", 11],
  ["orange", 11],
  ["dance", 11],
  ["circle", 11],
  ["large", 11],
  ["don't", 12],
  ["can't", 12],
  ["i'm", 12],
  ["it's", 12],
  ["we're", 12],
  ["you're", 12],
  ["he's", 12],
  ["she's", 12],
  ["they're", 12],
  ["i've", 12],
  ["won't", 12],
  ["didn't", 12],
  ["cats", 13],
  ["dogs", 13],
  ["hats", 13],
  ["boxes", 13],
  ["dresses", 13],
  ["buses", 13],
  ["wishes", 13],
  ["dishes", 13],
  ["lunches", 13],
  ["benches", 13],
  ["houses", 13],
  ["toys", 13],
  ["out", 14],
  ["loud", 14],
  ["house", 14],
  ["mouse", 14],
  ["how", 14],
  ["now", 14],
  ["cow", 14],
  ["town", 14],
  ["brown", 14],
  ["flower", 14],
  ["shout", 14],
  ["oil", 15],
  ["boil", 15],
  ["coin", 15],
  ["voice", 15],
  ["point", 15],
  ["joy", 15],
  ["toy", 15],
  ["boy", 15],
  ["enjoy", 15],
  ["royal", 15],
  ["noise", 15],
  ["moist", 15],
  ["unhappy", 16],
  ["untie", 16],
  ["unpack", 16],
  ["redo", 16],
  ["reheat", 16],
  ["return", 16],
  ["preview", 16],
  ["preheat", 16],
  ["pretest", 16],
  ["uncover", 16],
  ["rewrite", 16],
  ["unzip", 16],
  ["jumping", 17],
  ["looking", 17],
  ["playing", 17],
  ["walked", 17],
  ["talked", 17],
  ["helped", 17],
  ["calling", 17],
  ["working", 17],
  ["wanted", 17],
  ["needed", 17],
  ["staying", 17],
  ["crying", 17],
  ["because", 18],
  ["there", 18],
  ["their", 18],
  ["friend", 18],
  ["once", 18],
  ["always", 18],
  ["knee", 19],
  ["knife", 19],
  ["gnat", 19],
  ["gnaw", 19],
  ["knock", 19],
  ["comb", 19],
  ["lamb", 19],
  ["thumb", 19],
  ["write", 19],
  ["wrong", 19],
  ["wrap", 19],
  ["something", 20],
  ["helpful", 21],
  ["careful", 21],
  ["colorful", 21],
  ["hopeful", 21],
  ["fearless", 21],
  ["homeless", 21],
  ["careless", 21],
  ["painless", 21],
  ["useful", 21],
  ["thankful", 21],
  ["powerful", 21],
  ["tasteless", 21],
  ["runs", 22],
  ["jumps", 22],
  ["sings", 22],
  ["reads", 22],
  ["walks", 22],
  ["eats", 22],
  ["talks", 22],
  ["helps", 22],
  ["plays", 22],
  ["looks", 22],
  ["goes", 22],
  ["does", 22],
  ["at", 23],
  ["it", 23],
  ["ran", 23],
  ["jump", 23],
  ["wet", 23],
  ["mud", 23],
  ["six", 23],
  ["mitten", 24],
  ["sunset", 24],
  ["picnic", 24],
  ["doctor", 24],
  ["button", 24],
  ["sudden", 24],
  ["lesson", 24],
  ["paper", 25],
  ["tiger", 25],
  ["later", 25],
  ["open", 25],
  ["pilot", 25],
  ["robot", 25],
  ["lazy", 25],
  ["fever", 25],
  ["human", 25],
  ["music", 25],
  ["unit", 25],
  ["baby", 25],
  ["too", 26],
  ["hear", 26],
  ["here", 26],
  ["new", 26],
  ["knew", 26],
  ["our", 26],
  ["hour", 26],
  ["though", 27],
  ["through", 27],
  ["ghost", 27],
  ["kitchen", 27],
  ["catch", 27],
  ["match", 27],
  ["talk", 28],
  ["walk", 28],
  ["book", 28],
  ["ago", 29],
  ["around", 29],
  ["alone", 29],
  ["again", 29],
  ["banana", 29],
  ["salad", 29],
  ["sofa", 29],
  ["extra", 29],
  ["america", 29],
  ["problem", 29],
  ["few", 30],
  ["stew", 30],
  ["grew", 30],
  ["flew", 30],
  ["blew", 30],
  ["drew", 30],
  ["crew", 30],
  ["threw", 30],
  ["jewel", 30],
  ["sleigh", 31],
  ["neighbor", 31],
  ["straight", 31],
  ["believe", 32],
  ["receive", 32],
  ["replied", 33],
  ["dry", 33],
  ["below", 34],
  ["almost", 34],
  ["most", 34],
  ["parties", 35],
  ["families", 35],
  ["stories", 35],
  ["babies", 35],
  ["boys", 35],
  ["pencils", 35],
  ["books", 35]
];

const SHEET_KEY = "G2_SHEET_ID";
const SHEET_TITLE = "Grade 2 spelling audio URLs";
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
