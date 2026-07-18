const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

/**
 * Extracts raw plain text from files based on their extension.
 * @param {string} filePath - Absolute path to the file on disk.
 * @param {string} mimeType - File MIME type.
 * @param {string} fileName - Original filename.
 * @returns {Promise<string>} The parsed plain text content of the document.
 */
async function extractTextFromFile(filePath, mimeType, fileName) {
  const ext = path.extname(fileName).toLowerCase();

  // 1. Plain text / structured formats
  if (['.txt', '.csv', '.md', '.json', '.xml', '.html'].includes(ext)) {
    return fs.readFileSync(filePath, 'utf8');
  }

  // 2. PDF parsing
  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(dataBuffer);
      return data.text || '';
    } else if (pdfParse && typeof pdfParse.PDFParse === 'function') {
      const parser = new pdfParse.PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      return data.text || '';
    } else {
      throw new Error('No valid PDF parsing signature found in pdf-parse dependency');
    }
  }

  // 3. Word docx parsing
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || '';
  }

  // 4. Excel spreadsheet parsing
  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.readFile(filePath);
    let parsedContent = '';
    
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      // Convert worksheet to CSV string format
      const csvData = XLSX.utils.sheet_to_csv(worksheet);
      parsedContent += `\n--- Sheet: ${sheetName} ---\n${csvData}\n`;
    });
    
    return parsedContent;
  }

  // 5. Fallback: try to read as UTF-8 text, return if not containing null characters
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('\u0000')) {
      throw new Error('Detected binary signature in unsupported file format');
    }
    return content;
  } catch (err) {
    throw new Error(`Unsupported file type: ${ext || mimeType || 'unknown'}. Supported formats are PDF, DOCX, XLSX, XLS, TXT, CSV, MD, JSON.`);
  }
}

module.exports = {
  extractTextFromFile
};
