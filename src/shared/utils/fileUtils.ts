/**
 * File utility functions
 */

import { FileType } from '../types/entities.js';

/**
 * File extension mappings for auto-detection
 */
const FILE_TYPE_EXTENSIONS = {
  main: ['exe', 'msi', 'app', 'dmg', 'deb', 'rpm', 'appimage'],
  dependency: ['dll', 'so', 'dylib', 'lib', 'jar', 'a'],
  configuration: ['json', 'xml', 'yaml', 'yml', 'conf', 'config', 'ini', 'env'],
  documentation: ['txt', 'md', 'pdf', 'doc', 'docx', 'html', 'htm', 'rtf'],
} as const;

/**
 * Detect file type based on file extension
 * @param fileName - The name of the file including extension
 * @returns The detected FileType (defaults to MAIN for unknown extensions)
 */
export function detectFileType(fileName: string): FileType {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (FILE_TYPE_EXTENSIONS.main.includes(ext as typeof FILE_TYPE_EXTENSIONS.main[number])) {
    return FileType.MAIN;
  }
  if (FILE_TYPE_EXTENSIONS.dependency.includes(ext as typeof FILE_TYPE_EXTENSIONS.dependency[number])) {
    return FileType.DEPENDENCY;
  }
  if (FILE_TYPE_EXTENSIONS.configuration.includes(ext as typeof FILE_TYPE_EXTENSIONS.configuration[number])) {
    return FileType.CONFIGURATION;
  }
  if (FILE_TYPE_EXTENSIONS.documentation.includes(ext as typeof FILE_TYPE_EXTENSIONS.documentation[number])) {
    return FileType.DOCUMENTATION;
  }

  // Default to MAIN for unknown types
  return FileType.MAIN;
}
