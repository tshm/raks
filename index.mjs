//@ts-check
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config();

const storageStatePath = process.env.STORAGESTATEPATH ?? "./.storageState.json";
const headless = process.env.HEADLESS !== "false";
const pageurl = process.env.PAGEURL;
const [userid, userpasswd] = process.env.USERINFO.split(":");
const user = { id: userid, passwd: userpasswd };
const initialSearchWords = process.env.SEARCH_WORDS?.split(" ") ?? ["test"];
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
  ]).catch((error) => console.error("login elements not found:", { error }));
  const requireLoggingin = await page.$(loginSelecter);
  console.log({ requireLoggingin: await requireLoggingin?.textContent() });
  if (!requireLoggingin) return false;
  console.info("logging in");
  await requireLoggingin.click({ delay });
  await page.type('input[name="u"]', userinfo.id, { delay });
  await page.type('input[name="p"]', userinfo.passwd, { delay });
  await page.click('input[name="submit"]');
  console.info("logged in");
  return true;
}

/**
 * @param {string} storageStatePath
 */
function getStorageState(storageStatePath) {
  try {
    const buf = readFileSync(join(__dirname, storageStatePath));
    /** @type {import("playwright").BrowserContextOptions} */
    const context = { storageState: JSON.parse(buf.toString()) };
    return context;
  } catch (e) {
    return {};
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
          .filter(Boolean),
      { delay }
    );
    console.info({ trendWords });
    return trendWords;
  } catch {
    console.warn("no words found");
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
  const context = await browser.newContext(getStorageState(storageStatePath));
  const page = await context.newPage();
  try {
    await searchWord("today", page);

    (await login(page, user)) && (await page.goto(pageurl));

    await runSearches(page, initialSearchWords, searchWord);

    await context.storageState({ path: storageStatePath });
    console.info("closing browser");
    await page.close();
    await context.close();
    await browser.close();
  } catch (error) {
    await page.screenshot({ path: "./out/error.png" });
    console.error("caught global exception", { error });
    await browser.close();
  }
})();

/**
 * @param {import("playwright").Page} page
 * @param {string[]} initialSearchWords
 * @param {{(str: string, page: import("playwright").Page): Promise<void>;(arg0: string, arg1: any): any;}} searchWord
 */
async function runSearches(page, initialSearchWords, searchWord) {
  let searchWords = [...initialSearchWords];
  const oldWords = new Set();
  do {
    const trendWords = await getTrendWords(page);
    searchWords = [...new Set([...searchWords, ...trendWords])].filter(
      (word) => !!word && !oldWords.has(word)
    );
    const word = searchWords.pop();
    if (!word) {
      console.warn("word is empty. breaking out");
      break;
    }
    await searchWord(word, page);
    oldWords.add(word);
    console.info({ oldWords, searchWords });
  } while (oldWords.size < 10);
  console.info("consumed search words: ", oldWords.size);
}
