const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('csv-parser');
const cliProgress = require('cli-progress');

// Configuration object
const config = {
  headless: false, // Set to true for headless mode
  csvFilePath: './ALL_JTL_SINGLE.csv', // Path to your CSV file
  websiteUrl: 'https://www.ecoinform.de/', // URL to scrape
  selectors: {
    searchBox: '#suche',
    resultContainer: '.produkt',
    noResultsMessage: 'div.message',
  },
  noResultsText: 'leider konnten wir zu Ihrer Suchanfrage', // Partial text to check in the no-results message
  logFile: './log.txt', // Log file path
  delayTime: 5000,
  outputCsvPath: './output.csv' // Path to the output CSV file
};
// Utility function to delay execution
const delay = (time) => new Promise(resolve => setTimeout(resolve, time));
// Function to initialize the log file
function initializeLogFile() {
  fs.writeFileSync(config.logFile, ''); // Clear the file
}

// Function to write to the log file and console
function logMessage(message) {
  console.log(message);
  fs.appendFileSync(config.logFile, message + '\n');
}

// Function to read GTINs from the CSV file
function readGTINsFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const gtins = [];
    fs.createReadStream(filePath)
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => {
        if (row.GTIN) {
          gtins.push(row.GTIN.trim());
        }
      })
      .on('end', () => resolve(gtins))
      .on('error', (err) => reject(err));
  });
}

// Function to scrape EcoInform for a single GTIN
async function scrapeEcoInform(gtin) {
  const browser = await puppeteer.launch({ headless: config.headless });
  const page = await browser.newPage();

  try {
    await page.goto(config.websiteUrl, { waitUntil: 'networkidle2' });

    // Wait for the search box to load
    await page.waitForSelector(config.selectors.searchBox, { timeout: 60000 });

    // Type the search query and submit the form
    await page.type(config.selectors.searchBox, gtin);
    await page.keyboard.press('Enter');

    // Wait for the search results or "no results" message
    await page.waitForSelector(`${config.selectors.resultContainer}, ${config.selectors.noResultsMessage}`, { timeout: 60000 });
    await delay(config.delayTime);

    // Check for the "no results" message and verify its content
    const noResults = await page.$(config.selectors.noResultsMessage);
    if (noResults) {
      const messageContent = await page.$eval(config.selectors.noResultsMessage, (el) => el.innerText.trim());
      if (messageContent.includes(config.noResultsText)) {
        logMessage(`GTIN: ${gtin} - No product found on EcoInform.`);
        return; // Skip further processing for this GTIN
      }
    }

    logMessage(`GTIN: ${gtin} - Product found on EcoInform.`);

    // Scroll to the "pdf-Datenblatt" link element
    const pdfLinkSelector = 'a.link[href*="pdf-Datenblatt"]';
    let pdfLink = await page.$(pdfLinkSelector);

    if (pdfLink) {
      await pdfLink.scrollIntoView({ behavior: 'smooth' });
      logMessage(`GTIN: ${gtin} - Scrolled to PDF download link.`);
      
      const pdfUrl = await page.$eval(pdfLinkSelector, (link) => link.href);
      logMessage(`GTIN: ${gtin} - PDF download link found: ${pdfUrl}`);
      
      // Write PDF URL to CSV
      writeToCSV(gtin, pdfUrl);
    } else {
      logMessage(`GTIN: ${gtin} - PDF download link not found.`);
    }

  } catch (err) {
    logMessage(`Error processing GTIN ${gtin}: ${err}`);
  } finally {
    await browser.close();
  }
}

// Function to write to CSV
function writeToCSV(gtin, pdfUrl) {
  const csvRow = `${gtin},${metaTitle},${inverkehrbringer},${pdfUrl}\n`;
  fs.appendFileSync(config.outputCsvPath, csvRow);
}

// Main function to process all GTINs
async function processGTINs() {
  try {
    // Delete existing output.csv file before starting
    if (fs.existsSync(config.outputCsvPath)) {
      fs.unlinkSync(config.outputCsvPath);
    }

    const gtins = await readGTINsFromCSV(config.csvFilePath);

    // Initialize progress bar
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(gtins.length, 0);

    for (let i = 0; i < gtins.length; i++) {
      const gtin = gtins[i];
      logMessage(`\nProcessing GTIN: ${gtin}`);
      await scrapeEcoInform(gtin);
    
      // Update progress bar
      progressBar.update(i + 1);
    }

    progressBar.stop();
    logMessage('Processing complete.');
  } catch (err) {
    logMessage(`Error: ${err}`);
  }
}

// Initialize log file and run the script
initializeLogFile();
processGTINs();
