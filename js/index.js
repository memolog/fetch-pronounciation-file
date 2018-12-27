import * as puppeteer from 'puppeteer';
async () => {
    const browser = await puppeteer.launch();
    await browser.close();
};
