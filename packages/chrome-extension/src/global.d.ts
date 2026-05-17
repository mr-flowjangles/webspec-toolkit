/**
 * File System Access API ambient declarations.
 *
 * TypeScript's built-in `lib.dom.d.ts` doesn't yet include `showDirectoryPicker`
 * or the `queryPermission` / `requestPermission` methods on `FileSystemHandle`.
 * Both are stable in Chrome (the only browser we target) and used by the
 * General settings panel to pick + remember the Test repo folder.
 */

interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

type FileSystemPermissionState = 'granted' | 'prompt' | 'denied';

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<FileSystemPermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<FileSystemPermissionState>;
}

interface DirectoryPickerOptions {
  id?: string;
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
  mode?: 'read' | 'readwrite';
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
