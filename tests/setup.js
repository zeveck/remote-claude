// Test setup file
const fs = require('fs');
const path = require('path');

// Create test directories if they don't exist
const testDirs = [
  'tests/fixtures',
  'tests/temp',
  'config/test'
];

testDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Clean up test files after each test
afterEach(() => {
  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir, { recursive: true });
    } catch (err) {
      // If we can't remove the directory, at least try to clean its contents
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        try {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            const filePath = path.join(tempDir, file);
            try {
              fs.unlinkSync(filePath);
            } catch (e) {
              // Ignore individual file errors
            }
          }
        } catch (e) {
          // Ignore if we can't even read the directory
        }
      }
    }
  }
});

// Global test timeout
jest.setTimeout(10000);