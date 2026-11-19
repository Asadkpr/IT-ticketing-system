const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Safe replacements to not duplicate dark classes
const replacements = {
  'bg-white': 'bg-white dark:bg-slate-800',
  'bg-slate-50': 'bg-slate-50 dark:bg-slate-900',
  'text-slate-900': 'text-slate-900 dark:text-white',
  'text-slate-800': 'text-slate-800 dark:text-slate-100',
  'text-slate-700': 'text-slate-700 dark:text-slate-200',
  'text-slate-600': 'text-slate-600 dark:text-slate-300',
  'text-slate-500': 'text-slate-500 dark:text-slate-400',
  'border-slate-100': 'border-slate-100 dark:border-slate-700',
  'border-slate-200': 'border-slate-200 dark:border-slate-600',
  'border-slate-300': 'border-slate-300 dark:border-slate-500',
};

for (const [key, value] of Object.entries(replacements)) {
  // Match key only if it's not already followed by its dark variant
  const regex = new RegExp(`\\b${key}\\b(?!\\s+dark:)`, 'g');
  content = content.replace(regex, value);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Added dark mode classes to App.tsx');
