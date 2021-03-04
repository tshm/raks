//@ts-check
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const storageStatePath = "./.storageState.json";

const pageurl = process.env.PAGEURL;
console.info({ pageurl });
const user = {
  id: process.env.USERID,
  passwd: process.env.PASSWD,
};
const initialSearchWords = process.env.SEARCH_WORDS.split(" ");
const [loginSelecter, loggedInSelecter] = process.env.LOGIN_SELECTER.split(",");
console.info({ loginSelecter, loggedInSelecter });

/** global delay */
const delay = 222;
const timeout = 15000;

/**
 * @param {import("playwright").Page} page
 * @param {{ id: any; passwd: any; }} userinfo
 */
async function login(page, userinfo) {
  await Promise.race([
    page.waitForSelector(loginSelecter, { timeout }),
    page.waitForSelector(loggedInSelecter, { timeout }),
  ]).catch((r) => console.error(r));
  const requireLoggingin = await page.$(loginSelecter);
  console.log({ requireLoggingin });
  if (!requireLoggingin) return false;
  console.info("logging in");
  await requireLoggingin.click();
  await page.type('input[name="u"]', userinfo.id, { delay });
  await page.type('input[name="p"]', userinfo.passwd, { delay });
  await page.click('input[name="submit"]');
  console.info("logged in");
  return true;
}

function getStorageState() {
  try {
    const buf = fs.readFileSync(path.join(__dirname, storageStatePath));
    const storageState = JSON.parse(buf.toString());
    return storageState;
  } catch (e) {
    return undefined;
  }
}

/**
 * @param {string} str
 * @param {import("playwright").Page} page
 */
async function searchWord(str, page) {
  console.info(`run search: word="${str}"`);
  const searchSelector = ':is(input[type="search"],input#srchformtxt_qt)';
  const input = await page.$(searchSelector);
  if (!input) {
    console.warn("no search input found");
    return;
  }
  await input.click({ delay });
  await input.click({ clickCount: 3 });
  await input.focus();
  await page.keyboard.press("Backspace");
  await input.fill(str);
  await page.click('button[type="submit"]', { delay });
  console.info("search done.");
}

/**
 * @param {import("playwright").Page} page
 */
async function getTrendWords(page) {
  await page.waitForSelector("input.trend-word", { timeout });
  const trendWords = await page.$$eval(
    "input",
    (elems) =>
      elems
        .map((e) => e.classList.contains("trend-word") && e.value)
        .filter((b) => b),
    { delay }
  );
  console.info({ trendWords });
  return trendWords;
}

/** main */
(async () => {
  const browser = await chromium.launch({
    headless: false,
    devtools: false,
    slowMo: 300,
  });
  const storageState = getStorageState();
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto(pageurl);
  await searchWord("today", page);

  (await login(page, user)) && (await page.goto(pageurl));

  await runSearches(page, initialSearchWords, searchWord);

  await context.storageState({ path: storageStatePath });
  console.info("closing browser");
  await page.close();
  await context.close();
  await browser.close();
})();

/**
 * @param {import("playwright").Page} page
 * @param {string[]} initialSearchWords
 * @param {{(str: string, page: import("playwright").Page): Promise<void>;(arg0: string, arg1: any): any;}} searchWord
 */
async function runSearches(page, initialSearchWords, searchWord) {
  let searchWords = [...initialSearchWords];
  let oldWords = [""];
  do {
    const trendWords = await getTrendWords(page);
    searchWords = [...new Set([...searchWords, ...trendWords])].filter(
      (word) => word && !oldWords.includes(word)
    );
    const word = searchWords.pop();
    if (!word) {
      console.warn("word is empty. breaking out");
      break;
    }
    await searchWord(word, page);
    oldWords.push(word);
    console.info({ oldWords, searchWords });
  } while (oldWords.length < 10);
  console.info("consumed search words");
}
