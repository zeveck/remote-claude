# Design Document

## Overview

The Conversation Beautifier is a client-side web application built with vanilla JavaScript, HTML, and CSS. It processes Remote Claude conversation JSON files and generates beautiful, readable HTML reports. The application emphasizes simplicity, performance, and portability with no backend dependencies.

## Architecture

### Client-Side Architecture
- **Single Page Application (SPA)**: All functionality runs in the browser
- **No Backend Required**: Pure client-side processing using File API and Blob API
- **Progressive Enhancement**: Core functionality works without JavaScript, enhanced with JS
- **Responsive Design**: Mobile-first approach with desktop enhancements

### Core Components
1. **File Handler**: Manages file upload, validation, and parsing
2. **Conversation Parser**: Processes JSON structure and extracts conversation data
3. **Renderer**: Generates HTML representation of conversations
4. **Theme Manager**: Handles styling and theme switching
5. **Export Manager**: Creates downloadable HTML files
6. **Search Engine**: Provides filtering and search functionality

## Components and Interfaces

### File Handler Component
```javascript
class FileHandler {
    validateFile(file)           // Validates JSON structure
    parseConversation(jsonData)  // Extracts conversation data
    handleMultipleFiles(files)   // Batch processing support
}
```

**Responsibilities:**
- File upload handling via drag-and-drop and file input
- JSON validation against Remote Claude conversation schema
- Error handling for malformed or incompatible files
- Progress tracking for batch operations

### Conversation Parser Component
```javascript
class ConversationParser {
    parseMetadata(data)          // Extracts session info
    parseMessages(conversation)  // Processes message array
    formatTimestamps(timestamp)  // Converts ISO dates to readable format
    categorizeMessages(messages) // Groups by role/type
}
```

**Responsibilities:**
- Parsing conversation metadata (session time, directory, version)
- Processing message arrays with role identification
- Timestamp formatting and timezone handling
- Message categorization and sorting

### Renderer Component
```javascript
class ConversationRenderer {
    renderMetadata(metadata)     // Creates header section
    renderMessage(message)       // Formats individual messages
    renderConversation(data)     // Assembles complete conversation
    applyTheme(themeName)        // Applies styling theme
}
```

**Responsibilities:**
- HTML generation for conversation display
- Message formatting with role-specific styling
- Markdown parsing for Claude responses
- Theme application and CSS management

### Theme Manager Component
```javascript
class ThemeManager {
    loadTheme(name)              // Loads theme configuration
    applyTheme(theme)            // Updates CSS variables
    savePreference(themeName)    // Persists user choice
    getAvailableThemes()         // Returns theme list
}
```

**Available Themes:**
- **Light Theme**: Clean white background with dark text
- **Dark Theme**: Dark background matching Remote Claude interface
- **Minimal Theme**: High contrast, minimal styling for printing

### Export Manager Component
```javascript
class ExportManager {
    generateHTML(conversation)   // Creates standalone HTML
    inlineCSS(html, theme)      // Embeds CSS for portability
    createDownload(content)     // Triggers file download
    batchExport(conversations)  // Creates ZIP archive
}
```

**Responsibilities:**
- Standalone HTML generation with inline CSS
- File naming with descriptive patterns
- ZIP creation for batch exports
- Download triggering and progress feedback

### Search Engine Component
```javascript
class SearchEngine {
    searchMessages(query)        // Text-based message search
    filterByRole(roles)         // Filter by user/claude/system
    filterByDateRange(start, end) // Date range filtering
    highlightMatches(text, query) // Search result highlighting
}
```

**Responsibilities:**
- Real-time search with highlighting
- Multi-criteria filtering (role, date, content)
- Search result navigation
- Filter state management

## Data Models

### Conversation Data Structure
```javascript
{
    metadata: {
        sessionStartTime: "2025-08-16T15:30:00.000Z",
        exportTime: "2025-08-16T15:45:30.000Z",
        directory: "myproject",
        totalMessages: 12,
        version: "v0.1.1"
    },
    conversation: [
        {
            role: "user|claude|system",
            content: "message content",
            timestamp: "2025-08-16T15:31:00.000Z",
            directory: "myproject"
        }
    ]
}
```

### Theme Configuration
```javascript
{
    name: "dark",
    displayName: "Dark Theme",
    colors: {
        background: "#1a1a1a",
        text: "#e0e0e0",
        userMessage: "#2d4a87",
        claudeMessage: "#1e5631",
        systemMessage: "#4a4a4a",
        accent: "#00d4aa"
    },
    fonts: {
        primary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        monospace: "'Courier New', 'Monaco', monospace"
    }
}
```

## Error Handling

### File Validation Errors
- **Invalid JSON**: Clear message with JSON syntax error location
- **Missing Required Fields**: Specific field validation with helpful suggestions
- **Unsupported Version**: Version compatibility warnings with upgrade suggestions
- **Empty Conversations**: Graceful handling with informative messages

### Processing Errors
- **Memory Limitations**: Progress indicators and chunked processing for large files
- **Browser Compatibility**: Feature detection with fallback options
- **Export Failures**: Retry mechanisms and alternative export formats

### User Experience Errors
- **Network Issues**: Offline-first design with local processing
- **Storage Limitations**: LocalStorage quota management
- **Performance Issues**: Lazy loading and virtualization for large conversations

## Testing Strategy

### Unit Testing
- **File Handler**: JSON validation, parsing accuracy, error handling
- **Conversation Parser**: Data extraction, timestamp formatting, message categorization
- **Renderer**: HTML generation, theme application, markdown parsing
- **Search Engine**: Query processing, filtering accuracy, highlighting

### Integration Testing
- **End-to-End Workflow**: File upload → processing → display → export
- **Theme Switching**: Consistent styling across all themes
- **Batch Processing**: Multiple file handling and ZIP generation
- **Cross-Browser**: Chrome, Firefox, Safari, Edge compatibility

### Performance Testing
- **Large File Handling**: Conversations with 1000+ messages
- **Memory Usage**: Monitoring for memory leaks during processing
- **Export Speed**: HTML generation and download performance
- **Search Performance**: Real-time search with large datasets

### Accessibility Testing
- **Keyboard Navigation**: Full functionality without mouse
- **Screen Reader**: Proper ARIA labels and semantic HTML
- **Color Contrast**: WCAG 2.1 AA compliance across all themes
- **Focus Management**: Clear focus indicators and logical tab order

## Security Considerations

### Client-Side Security
- **XSS Prevention**: HTML escaping for all user-generated content
- **File Validation**: Strict JSON schema validation
- **Memory Safety**: Bounds checking for large file processing
- **Local Storage**: No sensitive data persistence

### Privacy Protection
- **No Data Transmission**: All processing happens locally
- **No Analytics**: No tracking or data collection
- **Temporary Processing**: Files processed in memory only
- **User Control**: Complete control over data and exports

## Performance Optimization

### Loading Performance
- **Minimal Dependencies**: Vanilla JavaScript with no external libraries
- **Code Splitting**: Lazy loading of non-essential features
- **Asset Optimization**: Minified CSS and JavaScript
- **Caching Strategy**: Service worker for offline functionality

### Runtime Performance
- **Virtual Scrolling**: Efficient rendering of large conversations
- **Debounced Search**: Optimized real-time search performance
- **Memory Management**: Cleanup of processed data and DOM elements
- **Progressive Enhancement**: Core features work on low-end devices

## Deployment Strategy

### Static Hosting
- **GitHub Pages**: Simple deployment with version control
- **Netlify/Vercel**: Automatic deployments with branch previews
- **CDN Distribution**: Global availability with edge caching
- **Offline Support**: Service worker for offline functionality

### Distribution Options
- **Web Application**: Hosted version for immediate use
- **Downloadable Package**: Standalone HTML file for offline use
- **Browser Extension**: Chrome/Firefox extension for integrated workflow
- **Desktop App**: Electron wrapper for native experience