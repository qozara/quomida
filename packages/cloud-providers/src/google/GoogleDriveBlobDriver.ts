import {
  GoogleDriveBlobDriver as BaseGoogleDriveBlobDriver,
  type GoogleDriveBlobDriverOptions,
  type GoogleDriverOptions,
} from '@qozara/cloud-sync-google';

export type { GoogleDriveBlobDriverOptions };

export class GoogleDriveBlobDriver extends BaseGoogleDriveBlobDriver {
  constructor(options: GoogleDriverOptions & Partial<GoogleDriveBlobDriverOptions>) {
    super({
      ...options,
      enableLegacyRootMigration: options.enableLegacyRootMigration ?? false,
      multipartBoundary: options.multipartBoundary ?? '-------quomida_blob_boundary',
    });
  }
}
