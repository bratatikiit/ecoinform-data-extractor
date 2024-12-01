const puppeteer = require('puppeteer');

async function scrapeEcoInform(searchQuery) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.ecoinform.de/', { waitUntil: 'networkidle2' });

    // Wait for the search box to load
    await page.waitForSelector('#suche', { timeout: 60000 });

    // Type the search query and submit the form
    await page.type('#suche', searchQuery);
    await page.keyboard.press('Enter');

    // Wait for the search results to load
    await page.waitForSelector('.produkt', { timeout: 60000 });

    // Extract the content of the <meta name="title"> tag
    const metaTitle = await page.$eval('meta[name="title"]', (meta) => meta.getAttribute('content'));

    // Print the extracted content
    console.log(`Meta Title Content: ${metaTitle}`);

     // Extract the content of the "Inverkehrbringer" field
     const inverkehrbringer = await page.$eval(
        'div.dval div.div_tval.mid_1188 b.tv_name', 
        (element) => element.nextElementSibling.textContent.trim()
      );
  
      // Print the extracted Inverkehrbringer content
      console.log(`Inverkehrbringer: ${inverkehrbringer}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

// Example usage:
scrapeEcoInform('3283950912914');