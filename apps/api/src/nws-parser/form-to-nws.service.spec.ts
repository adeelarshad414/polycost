import { describe, it, expect } from '@jest/globals';
import { NWSValidationError } from '../nws/nws-validator.js';
import { FormToNWSService } from './form-to-nws.service.js';

const fixedNow = () => new Date('2026-06-28T12:00:00.000Z');

describe('FormToNWSService', () => {
  it('maps structured form fields into a valid NWS', () => {
    const service = new FormToNWSService(fixedNow);

    expect(
      service.parse({
        workloadName: ' Proposal API ',
        workloadType: 'api_backend',
        dailyActiveUsers: 5000,
        peakConcurrentUsers: 500,
        regionPreference: ' us-east-1 ',
        compute: [
          {
            role: 'api',
            vcpu: 2,
            memoryGb: 4,
            instanceCount: 2,
            scalingType: 'fixed',
          },
        ],
        storage: [
          {
            role: 'uploads',
            type: 'object',
            sizeGb: 250,
            accessPattern: 'frequent',
          },
        ],
        database: [
          {
            role: 'primary',
            engine: 'postgres',
            sizeGb: 100,
            highAvailability: true,
            managedServicePreference: 'managed postgres',
          },
        ],
        network: {
          estimatedMonthlyEgressGb: 150,
          cdn: true,
          loadBalancer: true,
        },
        availability: {
          multiAz: true,
          multiRegion: false,
          slaTarget: ' 99.9% ',
        },
      }),
    ).toEqual({
      schemaVersion: '1.0',
      metadata: {
        sourceType: 'structured_form',
        createdAt: '2026-06-28T12:00:00.000Z',
      },
      workload: {
        name: 'Proposal API',
        type: 'api_backend',
        expectedUsers: {
          dailyActiveUsers: 5000,
          peakConcurrentUsers: 500,
        },
        region: {
          preference: 'us-east-1',
          isDefault: false,
        },
      },
      compute: [
        {
          role: 'api',
          vcpu: 2,
          memoryGb: 4,
          instanceCount: 2,
          scalingType: 'fixed',
        },
      ],
      storage: [
        {
          role: 'uploads',
          type: 'object',
          sizeGb: 250,
          accessPattern: 'frequent',
        },
      ],
      database: [
        {
          role: 'primary',
          engine: 'postgres',
          sizeGb: 100,
          highAvailability: true,
          managedServicePreference: 'managed postgres',
        },
      ],
      network: {
        estimatedMonthlyEgressGb: 150,
        cdn: true,
        loadBalancer: true,
      },
      availability: {
        multiAz: true,
        multiRegion: false,
        slaTarget: '99.9%',
      },
    });
  });

  it('uses cloud-neutral defaults for omitted optional form fields', () => {
    const service = new FormToNWSService(fixedNow);

    const nws = service.parse({
      workloadType: 'web_app',
      compute: [
        {
          role: 'web',
          instanceCount: 1,
          scalingType: 'fixed',
        },
      ],
    });

    expect(nws.workload.region).toEqual({
      isDefault: true,
    });
    expect(nws.network).toEqual({
      cdn: false,
      loadBalancer: false,
    });
    expect(nws.availability).toEqual({
      multiAz: false,
      multiRegion: false,
    });
  });

  it('delegates invalid form submissions to NWSValidator', () => {
    const service = new FormToNWSService(fixedNow);

    expect(() =>
      service.parse({
        workloadType: 'web_app',
        compute: [],
        storage: [],
        database: [],
      }),
    ).toThrow(NWSValidationError);
  });
});
