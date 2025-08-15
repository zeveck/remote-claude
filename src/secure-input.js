const readline = require('readline');

/**
 * Secure password input that hides characters as they're typed
 */
function secureInput(prompt) {
  return new Promise((resolve) => {
    // Write prompt
    process.stdout.write(prompt);
    
    // Set raw mode to capture individual keystrokes
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    let password = '';
    
    const onData = (buffer) => {
      const char = buffer.toString('utf8');
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl+D
          // Enter pressed - finish input
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          break;
          
        case '\u0003': // Ctrl+C
          // Cancel
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          process.exit(1);
          break;
          
        case '\u007f': // Backspace (DEL)
        case '\b':     // Backspace (BS)
          if (password.length > 0) {
            password = password.slice(0, -1);
            // Move cursor back, write space to clear character, move back again
            process.stdout.write('\b \b');
          }
          break;
          
        default:
          // Regular printable character
          if (char >= ' ' && char <= '~') {
            password += char;
            process.stdout.write('*');
          }
          // Ignore non-printable characters (no output)
          break;
      }
    };
    
    process.stdin.on('data', onData);
  });
}

/**
 * Regular input for non-sensitive data
 */
function regularInput(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

module.exports = { secureInput, regularInput };