import {describe, expect, it} from 'vitest'
import {DEFAULT_FOLDER_BACKUP} from '../settings/settings-spec'
import {folderBackupDue, localDay, mayBeDue, palettesFingerprint, pathInFolder} from './auto'

const on = {...DEFAULT_FOLDER_BACKUP, folder: 'D:/Backups'}

describe('when a folder backup is due', () => {
    it('is never due with no folder chosen', () => {
        expect(mayBeDue(DEFAULT_FOLDER_BACKUP, '2026-11-04')).toBe(false)
        expect(folderBackupDue(DEFAULT_FOLDER_BACKUP, 'changed', '2026-11-04')).toBe(false)
    })

    it('is due the first time, and whenever something changed on a new day', () => {
        expect(folderBackupDue(on, 'a', '2026-11-04')).toBe(true)
        expect(folderBackupDue({...on, lastDay: '2026-11-03', lastFingerprint: 'a'}, 'b', '2026-11-04')).toBe(true)
    })

    it('waits for the next day once today’s backup is written', () => {
        expect(folderBackupDue({...on, lastDay: '2026-11-04', lastFingerprint: 'a'}, 'b', '2026-11-04')).toBe(false)
    })

    it('is not due when nothing changed since the last backup', () => {
        expect(folderBackupDue({...on, lastDay: '2026-11-03', lastFingerprint: 'a'}, 'a', '2026-11-04')).toBe(false)
    })

    it('counts days by the local calendar', () => {
        expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
        expect(localDay(new Date(2026, 0, 6, 0, 1))).toBe('2026-01-06')
    })

    it('sees a changed palette as a change', () => {
        const forest = {id: 'p', name: 'Forest', set: 'tree', colours: ['#112233']}

        expect(palettesFingerprint([forest])).toBe(palettesFingerprint([{...forest}]))
        expect(palettesFingerprint([forest])).not.toBe(palettesFingerprint([{...forest, colours: ['#112234']}]))
        expect(palettesFingerprint([])).not.toBe(palettesFingerprint([forest]))
    })

    it('writes the path the way the folder is written', () => {
        expect(pathInFolder('D:\\Backups', 'b.zip')).toBe('D:\\Backups\\b.zip')
        expect(pathInFolder('/home/me/backups/', 'b.zip')).toBe('/home/me/backups/b.zip')
        expect(pathInFolder('C:/Sync', 'b.zip')).toBe('C:/Sync/b.zip')
    })
})
