/**
 * Setting up cloud backup: which service, where, and the keys.
 *
 * The provider's own words are used here, and only here, because people copy
 * them from the provider's site. The secret key goes straight to the system's
 * keychain when the connection is checked, and never comes back: once saved it
 * shows as dots, with a way to change it.
 */

import {useEffect, useState, type ReactNode} from 'react'
import {Dialog, Select} from '../components/controls'
import {CLOUD_SERVICES, findCloudService, tidyEndpoint, tidyFolder, type CloudServiceId} from '../core/backup/cloud-services'
import {savedCloudKeys, type CloudTarget} from '../platform/backup'
import {useBackupStore} from '../store/backup-store'
import {useSettingsStore} from '../store/settings-store'

type CheckState = {readonly phase: 'idle'} | {readonly phase: 'checking'} | {readonly phase: 'passed'} | {readonly phase: 'failed'; readonly message: string}

const SERVICE_CHOICES = CLOUD_SERVICES.map((service) => ({value: service.id, label: service.label}))

function Field({id, label, hint, children}: {id: string; label: string; hint?: string; children: ReactNode}) {
    return (
        <div className="cloud-setup__field">
            <label className="dialog__label" htmlFor={id}>
                {label}
            </label>
            {children}
            {hint ? <p className="dialog__hint">{hint}</p> : null}
        </div>
    )
}

export function CloudSetupDialog() {
    const open = useBackupStore((state) => state.cloudSetupOpen)
    const close = useBackupStore((state) => state.closeCloudSetup)
    const checkCloud = useBackupStore((state) => state.checkCloud)
    const saveCloudSetup = useBackupStore((state) => state.saveCloudSetup)

    const [service, setService] = useState<CloudServiceId>('r2')
    const [endpoint, setEndpoint] = useState('')
    const [region, setRegion] = useState('auto')
    const [bucket, setBucket] = useState('')
    const [folder, setFolder] = useState('easy-props')
    const [accessKey, setAccessKey] = useState('')
    const [secretKey, setSecretKey] = useState('')
    const [secretSaved, setSecretSaved] = useState(false)
    const [changingSecret, setChangingSecret] = useState(false)
    const [check, setCheck] = useState<CheckState>({phase: 'idle'})

    // Opening the form starts from what's saved, or from Cloudflare R2.
    useEffect(() => {
        if (!open) {
            return
        }

        const saved = useSettingsStore.getState().cloudBackup
        const chosen = findCloudService(saved.service) ?? findCloudService('r2')!

        setService(chosen.id)
        setEndpoint(saved.service ? saved.endpoint : '')
        setRegion(saved.service ? saved.region : chosen.region)
        setBucket(saved.bucket)
        setFolder(saved.folder || 'easy-props')
        setSecretKey('')
        setChangingSecret(false)
        setCheck({phase: 'idle'})
        void savedCloudKeys().then((keys) => {
            setAccessKey(keys.accessKey)
            setSecretSaved(keys.saved)
        })
    }, [open])

    const chosen = findCloudService(service)!
    const target: CloudTarget = {
        service,
        endpoint: service === 'aws' ? '' : tidyEndpoint(endpoint).endpoint,
        region: region.trim() || chosen.region,
        bucket: bucket.trim(),
        folder: tidyFolder(folder),
        pathStyle: service !== 'aws',
    }
    const complete = target.bucket !== '' && (service === 'aws' || target.endpoint !== '') && accessKey.trim() !== '' && (secretSaved || secretKey.trim() !== '')

    const pickService = (id: CloudServiceId) => {
        const next = findCloudService(id)!

        setService(id)
        setRegion(next.region)
        setCheck({phase: 'idle'})
    }

    // A pasted address loses https:// and anything after the host, and a bucket found there fills its field.
    const tidyAddress = () => {
        const tidied = tidyEndpoint(endpoint)

        setEndpoint(tidied.endpoint)

        if (tidied.bucket && bucket.trim() === '') {
            setBucket(tidied.bucket)
        }
    }

    const runCheck = async () => {
        tidyAddress()
        setCheck({phase: 'checking'})

        const problem = await checkCloud(target, accessKey, changingSecret || !secretSaved ? secretKey : '')

        if (problem === null) {
            setSecretSaved(true)
            setChangingSecret(false)
            setSecretKey('')
            setCheck({phase: 'passed'})
        } else {
            setCheck({phase: 'failed', message: problem})
        }
    }

    const edited = () => setCheck((current) => (current.phase === 'checking' ? current : {phase: 'idle'}))

    return (
        <Dialog open={open} onClose={close} title="Set up cloud backup" width={560} closesOnOutsideClick={false}>
            <form
                className="dialog__form cloud-setup"
                onSubmit={(event) => {
                    event.preventDefault()

                    if (check.phase === 'passed') {
                        saveCloudSetup(target)
                    } else {
                        void runCheck()
                    }
                }}
            >
                <p className="dialog__hint">
                    Back up to storage you already have. Works with any storage that speaks the S3 API. easy-props talks to it directly;
                    there's no account with us.
                </p>

                <Field id="cloud-service" label="Service" hint={chosen.hint}>
                    <Select<CloudServiceId> label="Service" value={service} options={SERVICE_CHOICES} onChange={pickService} />
                </Field>

                {service === 'aws' ? null : (
                    <Field id="cloud-endpoint" label="Endpoint">
                        <input
                            className="field"
                            id="cloud-endpoint"
                            value={endpoint}
                            placeholder={chosen.endpoint}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(event) => {
                                setEndpoint(event.target.value)
                                edited()
                            }}
                            onBlur={tidyAddress}
                        />
                    </Field>
                )}

                <div className="cloud-setup__pair">
                    <Field id="cloud-bucket" label="Bucket" hint="It must already exist. easy-props never makes or changes buckets.">
                        <input
                            className="field"
                            id="cloud-bucket"
                            value={bucket}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(event) => {
                                setBucket(event.target.value)
                                edited()
                            }}
                        />
                    </Field>
                    <Field id="cloud-region" label="Region">
                        <input
                            className="field"
                            id="cloud-region"
                            value={region}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(event) => {
                                setRegion(event.target.value)
                                edited()
                            }}
                        />
                    </Field>
                </div>

                <Field id="cloud-folder" label="Folder in the bucket" hint="So one bucket can hold other things too.">
                    <input
                        className="field"
                        id="cloud-folder"
                        value={folder}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(event) => {
                            setFolder(event.target.value)
                            edited()
                        }}
                    />
                </Field>

                <div className="cloud-setup__pair">
                    <Field id="cloud-access" label="Access key">
                        <input
                            className="field"
                            id="cloud-access"
                            value={accessKey}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(event) => {
                                setAccessKey(event.target.value)
                                edited()
                            }}
                        />
                    </Field>
                    <Field id="cloud-secret" label="Secret key">
                        {secretSaved && !changingSecret ? (
                            <div className="cloud-setup__saved">
                                <span className="tabular">••••••••</span>
                                <button type="button" className="text-button" onClick={() => setChangingSecret(true)}>
                                    Change
                                </button>
                            </div>
                        ) : (
                            <input
                                className="field"
                                id="cloud-secret"
                                type="password"
                                value={secretKey}
                                autoComplete="off"
                                onChange={(event) => {
                                    setSecretKey(event.target.value)
                                    edited()
                                }}
                            />
                        )}
                    </Field>
                </div>

                <p className="dialog__hint">
                    The keys need only read, write and list. Nothing here deletes from the bucket, so keys without delete permission are
                    safer, and work. The secret key is kept in your system's keychain, never in a file.
                </p>

                {check.phase === 'passed' ? (
                    <p className="cloud-setup__result" data-result="passed" role="status">
                        Connected. easy-props can read and write in {target.bucket}/{target.folder ? `${target.folder}/` : ''}.
                    </p>
                ) : check.phase === 'failed' ? (
                    <p className="cloud-setup__result" data-result="failed" role="alert">
                        {check.message}
                    </p>
                ) : null}

                <div className="dialog__actions">
                    <button type="button" className="button" onClick={close}>
                        Cancel
                    </button>
                    {check.phase === 'passed' ? (
                        <button type="submit" className="button button--primary">
                            Use this storage
                        </button>
                    ) : (
                        <button type="submit" className="button button--primary" disabled={!complete || check.phase === 'checking'}>
                            {check.phase === 'checking' ? 'Checking…' : 'Check the connection'}
                        </button>
                    )}
                </div>
            </form>
        </Dialog>
    )
}
