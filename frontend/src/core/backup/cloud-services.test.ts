import {describe, expect, it} from 'vitest'
import {planRestore} from '../library/restore-plan'
import {CLOUD_SERVICES, tidyEndpoint, tidyFolder} from './cloud-services'

describe('tidying a pasted storage address', () => {
    it('keeps only the address, and finds the bucket in the path', () => {
        expect(tidyEndpoint('https://ABC.r2.cloudflarestorage.com/my-bucket/')).toEqual({
            endpoint: 'abc.r2.cloudflarestorage.com',
            bucket: 'my-bucket',
        })
    })

    it('leaves a plain address as it is', () => {
        expect(tidyEndpoint('  s3.us-west-004.backblazeb2.com ')).toEqual({endpoint: 's3.us-west-004.backblazeb2.com', bucket: null})
    })

    it('keeps a port, for a server on this computer', () => {
        expect(tidyEndpoint('http://localhost:3900')).toEqual({endpoint: 'localhost:3900', bucket: null})
    })

    it('offers MinIO, on a server of your own', () => {
        expect(CLOUD_SERVICES.find((service) => service.id === 'minio')).toMatchObject({label: 'MinIO', region: 'us-east-1'})
    })

    it('takes the slashes off the folder', () => {
        expect(tidyFolder(' /easy-props/backups/ ')).toBe('easy-props/backups')
    })

    it('gives every service a region, and an address pattern except Amazon', () => {
        for (const service of CLOUD_SERVICES) {
            expect(service.region).not.toBe('')
            expect(service.endpoint === '').toBe(service.id === 'aws')
        }
    })
})

describe('restoring props removed since', () => {
    it('brings a removed prop back as it was, not as a copy', () => {
        const choices = planRestore([{id: 'gone', name: 'Old oak', status: 'removed'}], new Set(['gone']), ['Old oak'], () => '{}', () => 'x')

        expect(choices).toEqual([{id: 'gone', copyId: '', copyContents: ''}])
    })
})
