const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('csv-parser');
const cliProgress = require('cli-progress');

// Configuration object
const config = {
  headless: false, // Set to false to observe the browser in action
  csvFilePath: './checked_gtins.csv', // Path to your updated input CSV file
  websiteUrl: 'https://www.ecoinform.de/', // Website URL to scrape
  selectors: {
    searchBox: '#suche',
    resultContainer: '.produkt',
    noResultsMessage: 'div.message',
  },
  noResultsText: 'leider konnten wir zu Ihrer Suchanfrage', // Partial text for "no results"
  logFile: './log.txt', // Path to the log file
  delayTime: 5000, // Time to wait for the page to load (in ms)
  outputCsvPath: './output.csv', // Path to save the output CSV
};

// Utility function to delay execution
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));

// Initialize the log file
function initializeLogFile() {
  fs.writeFileSync(config.logFile, ''); // Clear the file at the start
}

// Log messages to file and console
function logMessage(message) {
  console.log(message);
  fs.appendFileSync(config.logFile, message + '\n');
}

// Read GTINs from the input CSV file
function readGTINsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const gtins = [];
    fs.createReadStream(filePath)
      .pipe(csv({ separator: ',' })) // Adjust separator if necessary
      .on('data', (row) => {
        if (row.GTIN && row.Quelle === 'ecoinform') {
          gtins.push(row.GTIN.trim());
        }
      })
      .on('end', () => resolve(gtins))
      .on('error', (err) => reject(err));
  });
}

// Write GTIN and PDF URL to the output CSV only if PDF_URL is not empty
function writeToCSV(gtin, pdfUrl, sicherheitsdatenblattUrl) {
  if (!pdfUrl) {
    return; // Skip writing to CSV if PDF_URL is empty
  }

  const csvRow = `${gtin},${pdfUrl},${sicherheitsdatenblattUrl}\n`;

  // Write header if file doesn't exist
  if (!fs.existsSync(config.outputCsvPath)) {
    fs.writeFileSync(config.outputCsvPath, 'GTIN,PDF_URL,Sicherheitsdatenblatt\n');
  }

  fs.appendFileSync(config.outputCsvPath, csvRow);
}

// Scrape EcoInform for a single GTIN
async function scrapeEcoInform(gtin) {
  const browser = await puppeteer.launch({ headless: config.headless });
  const page = await browser.newPage();

  try {
    await page.goto(config.websiteUrl, { waitUntil: 'networkidle2' });
    logMessage(`Navigated to ${config.websiteUrl}`);

    // Wait for the search box and enter the GTIN
    await page.waitForSelector(config.selectors.searchBox, { timeout: 60000 });
    await page.type(config.selectors.searchBox, gtin);
    await page.keyboard.press('Enter');
    logMessage(`Entered GTIN: ${gtin}`);

    // Wait for the result or no result message
    await page.waitForSelector(`${config.selectors.resultContainer}, ${config.selectors.noResultsMessage}`, { timeout: 60000 });
    await delay(config.delayTime);

    // Check for the "no results" message
    const noResults = await page.$(config.selectors.noResultsMessage);
    if (noResults) {
      const messageContent = await page.$eval(config.selectors.noResultsMessage, (el) => el.innerText.trim());
      if (messageContent.includes(config.noResultsText)) {
        logMessage(`GTIN: ${gtin} - No product found.`);
        writeToCSV(gtin, '', ''); // Add blank entries for missing data
        return;
      }
    }

    logMessage(`GTIN: ${gtin} - Product found.`);

    // Locate the specific parent div
    const parentDivSelector = 'div.content.detail.inner_wrap.view_1';
    const parentDiv = await page.$(parentDivSelector);

    if (!parentDiv) {
      logMessage(`GTIN: ${gtin} - Parent <div> not found.`);
      writeToCSV(gtin, '', ''); // Add blank entries for missing data
      return;
    }

    // Extract PDF URL
    let pdfUrl = '';
    const pdfLink = await parentDiv.$$eval(
      'a.link.active[target="_blank"]',
      links => links.find(link => link.innerText.includes('pdf-Datenblatt'))?.href
    ).catch(() => '');

    if (pdfLink) {
      pdfUrl = pdfLink;
      logMessage(`GTIN: ${gtin} - pdf link found: ${pdfUrl}`);
    } else {
      logMessage(`GTIN: ${gtin} - pdf link not found.`);
    }

    // Extract Sicherheitsdatenblatt URL if the text matches 'pdf-Datenblatt'
    let sicherheitsdatenblattUrl = '';
    const sicherheitsdatenblattLink = await parentDiv.$$eval(
      'a[target="_blank"]',
      links => links.find(link => link.innerText.includes('Sicherheitsdatenblatt'))?.href
    ).catch(() => '');

    if (sicherheitsdatenblattLink) {
      sicherheitsdatenblattUrl = sicherheitsdatenblattLink;
      logMessage(`GTIN: ${gtin} - Sicherheitsdatenblatt link found: ${sicherheitsdatenblattUrl}`);
    } else {
      logMessage(`GTIN: ${gtin} - Sicherheitsdatenblatt link not found.`);
    }

    // Write data to CSV
    writeToCSV(gtin, pdfUrl, sicherheitsdatenblattUrl);
  } catch (error) {
    logMessage(`Error processing GTIN ${gtin}: ${error.message}`);
    writeToCSV(gtin, '', ''); // Add blank entries for errors
  } finally {
    await browser.close();
  }
}

// Main function to process all GTINs
async function processGTINs() {
  try {
    // Remove the output CSV if it exists
    if (fs.existsSync(config.outputCsvPath)) {
      fs.unlinkSync(config.outputCsvPath);
    }

    // Read GTINs from the input CSV
    const gtins = await readGTINsFromCSV(config.csvFilePath);

    // Initialize a progress bar
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(gtins.length, 0);

    for (let i = 0; i < gtins.length; i++) {
      const gtin = gtins[i];
      logMessage(`Processing GTIN: ${gtin}`);
      await scrapeEcoInform(gtin);

      // Update the progress bar
      progressBar.update(i + 1);
    }

    progressBar.stop();
    logMessage('All GTINs processed successfully.');
  } catch (error) {
    logMessage(`Error: ${error.message}`);
  }
}

// Start the script
initializeLogFile();
processGTINs();
