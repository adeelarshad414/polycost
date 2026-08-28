import { defaultWorkloadForm } from '../workload';
import {
  computeStorageDefaultForTier,
  shouldApplyComputeStorageDefault,
} from './optimization-signals';

// H-F1 slice 3: these advisory helpers were pinned inside App.tsx because they
// read the static catalogs. With the catalogs in lib/app-catalogs they moved
// out, and their branch behaviour is now testable without rendering the app.

describe('optimization-signals (extracted from App.tsx)', () => {
  describe('computeStorageDefaultForTier', () => {
    it('returns a distinct default per instance tier', () => {
      const small = computeStorageDefaultForTier('small');
      const storage = computeStorageDefaultForTier('storage');

      expect(small.sizeGb).toBeTruthy();
      expect(storage.sizeGb).toBeTruthy();
      expect(storage.sizeGb).not.toBe(small.sizeGb);
    });
  });

  describe('shouldApplyComputeStorageDefault', () => {
    it('applies the default when storage is disabled', () => {
      expect(
        shouldApplyComputeStorageDefault({ ...defaultWorkloadForm, storageEnabled: false }),
      ).toBe(true);
    });

    it('applies the default when the storage size is blank', () => {
      expect(
        shouldApplyComputeStorageDefault({
          ...defaultWorkloadForm,
          storageEnabled: true,
          storageSizeGb: '   ',
        }),
      ).toBe(true);
    });

    it('does not overwrite a storage size the user chose themselves', () => {
      expect(
        shouldApplyComputeStorageDefault({
          ...defaultWorkloadForm,
          storageEnabled: true,
          storageSizeGb: '4242',
        }),
      ).toBe(false);
    });
  });
});
