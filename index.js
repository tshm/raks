//@ts-check
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const storageStatePath = process.env.STORAGESTATEPATH ?? "./.storageState.json";
const headless = process.env.HEADLESS === "true";
const pageurl = process.env.PAGEURL;
const user = {
  id: process.env.USERID ?? "user",
  passwd: process.env.PASSWD ?? "password",
};
const initialSearchWords = process.env.SEARCH_WORDS.split(" ");
const [loginSelecter, loggedInSelecter] = process.env.LOGIN_SELECTER.split(",");

/** global delay */
const delay = +process.env.DELAY || 222;
const timeout = +process.env.TIMEOUT || 15000;
console.info({ storageStatePath, pageurl, headless, delay, timeout });

/**
 * @param {import("playwright").Page} page
 * @param {{ id: string; passwd: string; }} userinfo
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
  await page.goto(pageurl + str);
}

/**
 * @param {import("playwright").Page} page
 */
async function getTrendWords(page) {
  try {
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
  } catch {
    return [];
  }
}

/** main */
(async () => {
  const browser = await chromium.launch({
    headless,
    // devtools: false,
    slowMo: 300,
  });
  const storageState = getStorageState();
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
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
