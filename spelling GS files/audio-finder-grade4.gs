/**
 * Grade 4 spelling - audio finder (Google Apps Script)
 * Dictionaries: Longman (US + UK), Oxford Learner's (US + UK), Merriam-Webster (US)
 *
 * Works standalone (script.google.com) or from a Sheet (Extensions > Apps Script).
 * Standalone: it creates a NEW sheet "Grade 4 spelling audio URLs" and prints its link in the
 * Execution log ("SHEET LINK: ...").
 *
 * Columns: A word | B Longman US | C Longman UK | D Oxford US | E Oxford UK |
 *          F Webster US | G status | H first week
 *
 * 339 unique words. Words that already appeared in earlier grades (Grades 1-3) are left out, and repeats inside the grade are listed once.
 * Audio URLs are READ from each dictionary page's HTML. Nothing is guessed.
 * It stops itself before Google's 6-minute limit: press Run again until the log
 * says "ALL DONE". Rows that already have a status are skipped.
 */

// [word, first week]. Spaces are allowed ("ice cream"); each site gets the right form.
const WORDS = [
  ["dolphin", 1],
  ["penguin", 1],
  ["kangaroo", 1],
  ["cheetah", 1],
  ["octopus", 1],
  ["crocodile", 1],
  ["ostrich", 1],
  ["chimpanzee", 1],
  ["koala", 1],
  ["strawberry", 2],
  ["watermelon", 2],
  ["blueberry", 2],
  ["pineapple", 2],
  ["raspberry", 2],
  ["grapefruit", 2],
  ["blackberry", 2],
  ["peach", 2],
  ["mango", 2],
  ["kiwi", 2],
  ["raincoat", 3],
  ["thunder", 3],
  ["blizzard", 3],
  ["umbrella", 3],
  ["tornado", 3],
  ["forecast", 3],
  ["hailstone", 3],
  ["drizzle", 3],
  ["cyclone", 3],
  ["snowflake", 3],
  ["homework", 4],
  ["teacher", 4],
  ["eraser", 4],
  ["chalkboard", 4],
  ["library", 4],
  ["student", 4],
  ["alphabet", 4],
  ["brother", 5],
  ["sister", 5],
  ["mother", 5],
  ["father", 5],
  ["aunt", 5],
  ["uncle", 5],
  ["niece", 5],
  ["nephew", 5],
  ["bicycle", 6],
  ["helicopter", 6],
  ["submarine", 6],
  ["skateboard", 6],
  ["ambulance", 6],
  ["motorcycle", 6],
  ["sailboat", 6],
  ["yacht", 6],
  ["scooter", 6],
  ["tractor", 6],
  ["purple", 7],
  ["gray", 7],
  ["indigo", 7],
  ["halloween", 8],
  ["thanksgiving", 8],
  ["valentine", 8],
  ["christmas", 8],
  ["easter", 8],
  ["new year", 8],
  ["labor day", 8],
  ["hanukkah", 8],
  ["cinco de mayo", 8],
  ["diwali", 8],
  ["veterans day", 8],
  ["pancake", 9],
  ["spaghetti", 9],
  ["broccoli", 9],
  ["sandwich", 9],
  ["pizza", 9],
  ["popcorn", 9],
  ["cucumber", 9],
  ["burrito", 9],
  ["avocado", 9],
  ["chocolate", 9],
  ["asparagus", 9],
  ["soccer", 10],
  ["basketball", 10],
  ["tennis", 10],
  ["volleyball", 10],
  ["gymnastics", 10],
  ["karate", 10],
  ["running", 10],
  ["cycling", 10],
  ["wrestling", 10],
  ["angry", 11],
  ["excited", 11],
  ["nervous", 11],
  ["proud", 11],
  ["content", 11],
  ["frustrated", 11],
  ["grateful", 11],
  ["jealous", 11],
  ["mountain", 12],
  ["waterfall", 12],
  ["meadow", 12],
  ["volcano", 12],
  ["seashell", 12],
  ["wilderness", 12],
  ["jeans", 13],
  ["sweater", 13],
  ["sneakers", 13],
  ["jacket", 13],
  ["socks", 13],
  ["shorts", 13],
  ["skirt", 13],
  ["sandals", 13],
  ["gloves", 13],
  ["ladybug", 14],
  ["ant", 14],
  ["grasshopper", 14],
  ["dragonfly", 14],
  ["beetle", 14],
  ["mosquito", 14],
  ["firefly", 14],
  ["caterpillar", 14],
  ["cricket", 14],
  ["moth", 14],
  ["triangle", 15],
  ["square", 15],
  ["rectangle", 15],
  ["pentagon", 15],
  ["hexagon", 15],
  ["octagon", 15],
  ["diamond", 15],
  ["oval", 15],
  ["heart", 15],
  ["crescent", 15],
  ["melody", 16],
  ["guitar", 16],
  ["piano", 16],
  ["song", 16],
  ["violin", 16],
  ["trumpet", 16],
  ["rhythm", 16],
  ["saxophone", 16],
  ["harmonica", 16],
  ["terminal", 17],
  ["ticket", 17],
  ["holiday", 17],
  ["hotel", 17],
  ["vacation", 17],
  ["refrigerator", 18],
  ["microwave", 18],
  ["vacuum", 18],
  ["dishwasher", 18],
  ["blender", 18],
  ["toaster", 18],
  ["coffee maker", 18],
  ["washer", 18],
  ["dryer", 18],
  ["mixer", 18],
  ["oven", 18],
  ["painting", 19],
  ["gardening", 19],
  ["fishing", 19],
  ["knitting", 19],
  ["photography", 19],
  ["origami", 19],
  ["chess", 19],
  ["drawing", 19],
  ["dancing", 19],
  ["fingers", 20],
  ["toes", 20],
  ["shoulders", 20],
  ["elbows", 20],
  ["knees", 20],
  ["ankles", 20],
  ["forehead", 20],
  ["cheeks", 20],
  ["eyebrows", 20],
  ["hips", 20],
  ["couch", 21],
  ["lamp", 21],
  ["rug", 21],
  ["curtains", 21],
  ["shelves", 21],
  ["vase", 21],
  ["towel", 21],
  ["firefighter", 22],
  ["chef", 22],
  ["engineer", 22],
  ["scientist", 22],
  ["artist", 22],
  ["librarian", 22],
  ["mechanic", 22],
  ["police", 22],
  ["dentist", 22],
  ["france", 23],
  ["japan", 23],
  ["brazil", 23],
  ["australia", 23],
  ["india", 23],
  ["canada", 23],
  ["spain", 23],
  ["mexico", 23],
  ["italy", 23],
  ["china", 23],
  ["germany", 23],
  ["russia", 23],
  ["astronaut", 24],
  ["rocket", 24],
  ["spacesuit", 24],
  ["comet", 24],
  ["starship", 24],
  ["moon", 24],
  ["meteorite", 24],
  ["satellite", 24],
  ["aliens", 24],
  ["thunderstorm", 25],
  ["snowy", 25],
  ["raindrop", 25],
  ["windy", 25],
  ["hurricane", 25],
  ["sprinkle", 25],
  ["foggy", 25],
  ["flood", 25],
  ["ice", 25],
  ["cloudy", 25],
  ["downpour", 25],
  ["polar bear", 26],
  ["eagle", 26],
  ["turtle", 26],
  ["alligator", 26],
  ["snake", 26],
  ["jaguar", 26],
  ["flamingo", 26],
  ["seahorse", 26],
  ["sloth", 26],
  ["monkey", 26],
  ["january", 27],
  ["thursday", 27],
  ["midnight", 27],
  ["century", 27],
  ["calendar", 27],
  ["decade", 27],
  ["november", 27],
  ["hourglass", 27],
  ["february", 27],
  ["yesterday", 27],
  ["soccer ball", 28],
  ["tennis racket", 28],
  ["hockey stick", 28],
  ["golf club", 28],
  ["baseball bat", 28],
  ["bowling pin", 28],
  ["swimming cap", 28],
  ["jump rope", 28],
  ["badminton racket", 28],
  ["chapter", 29],
  ["adventure", 29],
  ["poetry", 29],
  ["nonfiction", 29],
  ["novelist", 29],
  ["fantasy", 29],
  ["mystery", 29],
  ["biography", 29],
  ["bestseller", 29],
  ["crime", 29],
  ["utensils", 30],
  ["cutting board", 30],
  ["pantry", 30],
  ["saucepan", 30],
  ["measuring cup", 30],
  ["cookie sheet", 30],
  ["spatula", 30],
  ["whisk", 30],
  ["peeler", 30],
  ["stove", 30],
  ["mixing bowl", 30],
  ["computer", 31],
  ["smartphone", 31],
  ["internet", 31],
  ["keyboard", 31],
  ["tablet", 31],
  ["battery", 31],
  ["software", 31],
  ["camera", 31],
  ["monitor", 31],
  ["router", 31],
  ["password", 31],
  ["laptop", 31],
  ["respiratory", 32],
  ["digestive", 32],
  ["skeletal", 32],
  ["circulatory", 32],
  ["muscular", 32],
  ["immune", 32],
  ["cardiovascular", 32],
  ["endocrine", 32],
  ["lymphatic", 32],
  ["sensory", 32],
  ["urinary", 32],
  ["i'll", 33],
  ["you'll", 33],
  ["he'll", 33],
  ["she'll", 33],
  ["we'll", 33],
  ["they'll", 33],
  ["i'd", 33],
  ["she'd", 33],
  ["we'd", 33],
  ["you've", 33],
  ["they've", 33],
  ["mercury", 34],
  ["venus", 34],
  ["mars", 34],
  ["jupiter", 34],
  ["saturn", 34],
  ["uranus", 34],
  ["neptune", 34],
  ["pluto", 34],
  ["asteroid", 34],
  ["nebula", 34],
  ["meteor", 34],
  ["cleaning", 35],
  ["dusting", 35],
  ["sweeping", 35],
  ["mopping", 35],
  ["vacuuming", 35],
  ["washing", 35],
  ["ironing", 35],
  ["organizing", 35],
  ["repairing", 35],
  ["shopping", 35],
  ["hypothesis", 36],
  ["observation", 36],
  ["chemical", 36],
  ["experiment", 36],
  ["laboratory", 36],
  ["reaction", 36],
  ["microscope", 36],
  ["control", 36],
  ["variable", 36],
  ["conclusion", 36],
  ["test tube", 36]
];

const SHEET_KEY = "G4_SHEET_ID";
const SHEET_TITLE = "Grade 4 spelling audio URLs";
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
