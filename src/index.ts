import * as downloader from 'image-downloader';
import * as jetpack from 'fs-jetpack';
import * as minimist from 'minimist';
import { Builder, By, Locator, WebDriver, WebElement } from 'selenium-webdriver';
import { FSJetpack } from 'fs-jetpack/types';
import { Options } from 'selenium-webdriver/chrome';
import { PDFDocument } from 'pdf-lib';

const MAX_SIZE = 10_000;
const DEFAULT_TIMEOUT = 30_000;

const findImageIndex = async (driver: WebDriver, index: number, timeout: number) => {
  console.log('Find image', index);
  let images = await findElementsWait(driver, By.css('img'), timeout);
  while (!images[index]) {
    await driver.sleep(5000);
    console.log('trying again', images, index, images[index]);
    images = await findElementsWait(driver, By.css('img'), timeout);
  }
  return images[index];
};

const findImageSrc = async (image: WebElement) => {
  return await image.getAttribute('src');
};

const findElementsWait = async (driver: WebDriver, locator: Locator, timeout: number) => {
  await driver.wait(async () => {
    try {
      await driver.sleep(1000);
      const elements = await driver.findElements(locator);
      return elements.length > 0;
    } catch (e) {
      return false;
    }
  }, timeout);
  return driver.findElements(locator);
};

const waitDifferentImage = async (driver: WebDriver, prevSrc: string, timeout: number) => {
  const images = await findElementsWait(driver, By.css('img'), timeout);
  for (let i = 0; i < images.length; i++) {
    const src = await findImageSrc(images[i]);
    if (src !== prevSrc) {
      return src;
    }
    console.log('Images are the same, trying ', i + 1, 'of 5 times');
    await driver.sleep(1000);
  }
  console.log('Saving same image');
  return prevSrc;
};

const clickButton = async (driver: WebDriver, index: number, timeout: number) => {
  await driver.sleep(1000);
  const buttons = await findElementsWait(driver, By.css('button'), timeout);
  await buttons[index].click();
  const prevDisabled = await buttons[0].getAttribute('disabled');
  const nextDisabled = await buttons[1].getAttribute('disabled');

  console.log('disabled prev', prevDisabled, 'next', nextDisabled, !!nextDisabled);

  return !!nextDisabled;
};

const saveImage = async (tempDir: FSJetpack, url: string, index: number) => {
  const dest = tempDir.path(`${index}.jpg`);

  console.log('Saving image', url, 'to ', dest);

  await downloader.image({ url, dest });
};

const downloadImages = async (pitchUrl: string, tempDir: FSJetpack, skip = false) => {
  if (skip) return;
  const options = new Options().headless();
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  try {
    console.log('Driver download url', pitchUrl);
    await driver.get(pitchUrl);

    let index = 1;
    let isLast = false;

    const image = await findImageIndex(driver, 1, DEFAULT_TIMEOUT);
    let imgSrc = await findImageSrc(image);
    await saveImage(tempDir, imgSrc, index);

    while (!isLast && index < MAX_SIZE) {
      index++;
      isLast = await clickButton(driver, 1, DEFAULT_TIMEOUT);
      await driver.sleep(2000);
      imgSrc = await waitDifferentImage(driver, imgSrc, DEFAULT_TIMEOUT);
      await saveImage(tempDir, imgSrc, index);
    }
  } finally {
    await driver.quit();
  }
};

const createPDF = async (tmpDir: FSJetpack, pdfname: string) => {
  const files = await tmpDir.listAsync();
  if (!files) {
    console.log('Empty directory or not exists', tmpDir.path(), files);
    return;
  }

  // sort string as int by page name to have 10.jpg after 2.jpg
  files.sort((a, b) => {
    const x = parseInt(a.split('.')[0]);
    const y = parseInt(b.split('.')[0]);
    if (x > y) return 1;
    if (y > x) return -1;
    return 0;
  });

  const pdfDoc = await PDFDocument.create();
  for (const fname of files) {
    const fpath = tmpDir.path(fname);
    const img = await jetpack.readAsync(fpath, 'buffer');
    if (!img) {
      console.log('Unable to read image from path', fpath);
      return;
    }
    const pdfImage = await pdfDoc.embedJpg(img);
    const page = pdfDoc.addPage();
    page.setSize(pdfImage.width, pdfImage.height);
    page.drawImage(pdfImage, {
      x: 0,
      y: 0,
      width: pdfImage.width,
      height: pdfImage.height
    });
  }

  const data = await pdfDoc.save();
  console.log('!!! Saving pdf file', pdfname);
  await jetpack.writeAsync(pdfname, Buffer.from(data));
};

const pdfName = (pitchUrl: string) => {
  const url = new URL(pitchUrl);
  const pdfName = url.pathname.split('/');
  return `${pdfName[pdfName.length - 1]}.pdf`;
};

/* eslint-disable-next-line @typescript-eslint/no-floating-promises */
(async function () {
  const pitchUrl = minimist(process.argv.slice(2))._[0];
  console.log('!!! Creating pdf from', pitchUrl);
  const fname = pdfName(pitchUrl);

  const tempDir = await jetpack.tmpDirAsync();

  try {
    await downloadImages(pitchUrl, tempDir);

    await createPDF(tempDir, fname);
    console.log('DONE !!!');
  } finally {
    tempDir.remove();
  }
})();
